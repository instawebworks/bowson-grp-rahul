import type { FastifyPluginAsync } from 'fastify';
import { catalogueInputSchema, cataloguePartInputSchema } from '@bowson/shared';
import { z } from 'zod';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

/**
 * Product catalogue — a PARTS LIBRARY plus products built from it (client
 * email 1 Oct 2026). A library part is one unique moulded piece, created once;
 * a product links any number of parts, each at a whole (1) or half (0.5)
 * mould. Price, hours and the single-piece flag roll up from the children.
 */

const partMouldSchema = z.object({ mouldId: z.number().int().nullable() });

const PART_SELECT = '*, mould:moulds(*)';
const SELECT = `*, links:catalogue_product_parts(id, qty, sort, part:catalogue_parts(${PART_SELECT})), hardware:catalogue_hardware(*)`;

interface LibPart {
  id: number;
  detail: string;
  spec: string | null;
  hrs: number;
  lamHrs: number | null;
  finHrs: number | null;
  price: number;
  drawing: string | null;
  mouldId: number | null;
  deletedAt: string | null;
}
interface Link { id: number; qty: number; sort: number; part: LibPart | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Flatten a product's links into the `parts` array the web app consumes:
 * each entry is the library part's fields plus `qty` and `linkId`, in link
 * order. A retired library part still shows on products that used it.
 */
function shape(row: Record<string, unknown>) {
  const { links, ...rest } = row as { links?: Link[] } & Record<string, unknown>;
  const parts = (links ?? [])
    .filter((l) => l.part)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((l) => ({ ...l.part!, qty: l.qty, linkId: l.id }));
  return { ...rest, parts };
}

async function fetchOne(id: number) {
  const row = unwrap(await db.from('catalogue').select(SELECT).eq('id', id).maybeSingle());
  return row ? shape(row as Record<string, unknown>) : null;
}

/** Derived product fields from its linked parts. */
function rollUp(links: { qty: number; part: LibPart }[]) {
  const unitPrice = r2(links.reduce((s, l) => s + (l.part.price || 0) * l.qty, 0));
  return { unitPrice, assemblyHrs: 0, singlePiece: links.length <= 1 };
}

/** Load the library parts for a set of link inputs, 400 if any is unknown. */
async function resolveLinks(inputs: { partId: number; qty: number }[]) {
  if (!inputs.length) return [];
  const ids = [...new Set(inputs.map((l) => l.partId))];
  const rows = unwrap(
    await db.from('catalogue_parts').select('*').in('id', ids).is('deletedAt', null),
  ) as LibPart[];
  const byId = new Map(rows.map((p) => [p.id, p]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) return { missing };
  return inputs.map((l) => ({ qty: l.qty, part: byId.get(l.partId)! }));
}

async function writeLinks(catalogueId: number, links: { qty: number; part: LibPart }[]) {
  unwrap(await db.from('catalogue_product_parts').delete().eq('catalogueId', catalogueId).select('id'));
  if (links.length) {
    unwrap(
      await db.from('catalogue_product_parts')
        .insert(links.map((l, i) => ({ catalogueId, partId: l.part.id, qty: l.qty, sort: i })))
        .select('id'),
    );
  }
}

export const catalogueRoutes: FastifyPluginAsync = async (app) => {
  // ── Parts library ──────────────────────────────────────────────────────────
  app.get('/parts', async () => {
    const [partsR, linksR] = await Promise.all([
      db.from('catalogue_parts').select(PART_SELECT).is('deletedAt', null).order('drawing').order('detail'),
      db.from('catalogue_product_parts').select('partId, catalogue:catalogue(id, deletedAt)'),
    ]);
    const parts = unwrap(partsR) as LibPart[];
    const links = unwrap(linksR) as unknown as { partId: number; catalogue: { id: number; deletedAt: string | null } | null }[];
    // How many live products use each part (drives the delete guard in the UI).
    const used = new Map<number, Set<number>>();
    for (const l of links) {
      if (!l.catalogue || l.catalogue.deletedAt) continue;
      used.set(l.partId, (used.get(l.partId) ?? new Set()).add(l.catalogue.id));
    }
    return parts.map((p) => ({ ...p, usedBy: used.get(p.id)?.size ?? 0 }));
  });

  app.post('/parts', async (req, reply) => {
    const data = parse(cataloguePartInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const dup = await findDuplicate(data.drawing ?? null, data.detail, null);
    if (dup) return reply.conflict(`A library part with code "${data.drawing ?? ''}" and detail "${data.detail}" already exists`);
    const created = unwrap(
      await db.from('catalogue_parts')
        .insert({ ...data, hrs: r2(data.lamHrs + data.finHrs) })
        .select(PART_SELECT).single(),
    );
    return reply.status(201).send({ ...(created as object), usedBy: 0 });
  });

  app.patch('/parts/:partId', async (req, reply) => {
    const partId = parseId((req.params as { partId: string }).partId, reply);
    if (partId === PARSE_FAILED) return;
    const data = parse(cataloguePartInputSchema.partial(), req.body, reply);
    if (data === PARSE_FAILED) return;
    const existing = unwrap(
      await db.from('catalogue_parts').select('*').eq('id', partId).is('deletedAt', null).maybeSingle(),
    ) as LibPart | null;
    if (!existing) return reply.notFound('Library part not found');
    const drawing = data.drawing !== undefined ? data.drawing : existing.drawing;
    const detail = data.detail ?? existing.detail;
    const dup = await findDuplicate(drawing ?? null, detail, partId);
    if (dup) return reply.conflict(`Another library part already has code "${drawing ?? ''}" and detail "${detail}"`);
    const lam = data.lamHrs ?? existing.lamHrs ?? 0;
    const fin = data.finHrs ?? existing.finHrs ?? 0;
    unwrap(
      await db.from('catalogue_parts').update({ ...data, hrs: r2(lam + fin) }).eq('id', partId).select('id'),
    );
    // Price / hours changed → every product built from this part re-rolls.
    if (data.price !== undefined) await rerollProductsUsing(partId);
    return unwrap(await db.from('catalogue_parts').select(PART_SELECT).eq('id', partId).maybeSingle());
  });

  // Link a library part to its default mould (Moulds → Unlinked Catalogue tab).
  // New tickets instantiated from products using it inherit the mould.
  app.patch('/parts/:partId/mould', async (req, reply) => {
    const partId = parseId((req.params as { partId: string }).partId, reply);
    if (partId === PARSE_FAILED) return;
    const body = parse(partMouldSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    const part = unwrap(
      await db.from('catalogue_parts').select('id').eq('id', partId).is('deletedAt', null).maybeSingle(),
    );
    if (!part) return reply.notFound('Library part not found');
    if (body.mouldId != null) {
      const mould = unwrap(
        await db.from('moulds').select('id').eq('id', body.mouldId).is('deletedAt', null).maybeSingle(),
      );
      if (!mould) return reply.badRequest('mouldId does not reference a mould');
    }
    unwrap(await db.from('catalogue_parts').update({ mouldId: body.mouldId }).eq('id', partId).select('id'));
    return unwrap(await db.from('catalogue_parts').select(PART_SELECT).eq('id', partId).maybeSingle());
  });

  app.delete('/parts/:partId', async (req, reply) => {
    const partId = parseId((req.params as { partId: string }).partId, reply);
    if (partId === PARSE_FAILED) return;
    // Refuse while a live product is built from it — remove it there first.
    const users = unwrap(
      await db.from('catalogue_product_parts').select('catalogue:catalogue(id, name, deletedAt)').eq('partId', partId),
    ) as unknown as { catalogue: { id: number; name: string; deletedAt: string | null } | null }[];
    const live = users.filter((u) => u.catalogue && !u.catalogue.deletedAt).map((u) => u.catalogue!.name);
    if (live.length) {
      return reply.conflict(`This part is used by ${[...new Set(live)].join(', ')} — remove it from those products first`);
    }
    const row = unwrap(
      await db.from('catalogue_parts').update({ deletedAt: new Date().toISOString() })
        .eq('id', partId).is('deletedAt', null).select('id').maybeSingle(),
    );
    if (!row) return reply.notFound('Library part not found');
    return reply.status(204).send();
  });

  // ── Products ───────────────────────────────────────────────────────────────
  app.get('/', async () => {
    const rows = unwrap(
      await db.from('catalogue').select(SELECT).is('deletedAt', null).order('name', { ascending: true }),
    ) as Record<string, unknown>[];
    return rows.map(shape);
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = await fetchOne(id);
    if (!row || (row as unknown as { deletedAt: string | null }).deletedAt) return reply.notFound('Catalogue item not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(catalogueInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const { parts, hardware, ...rest } = data;
    const links = await resolveLinks(parts);
    if ('missing' in links) return reply.badRequest(`Unknown library part id(s): ${links.missing.join(', ')}`);
    const created = unwrap(
      await db.from('catalogue').insert({ ...rest, ...rollUp(links) }).select('id').single(),
    );
    const id = (created as { id: number }).id;
    await writeLinks(id, links);
    if (hardware.length)
      unwrap(await db.from('catalogue_hardware').insert(hardware.map((h) => ({ ...h, catalogueId: id }))).select('id'));
    return reply.status(201).send(await fetchOne(id));
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(catalogueInputSchema.partial(), req.body, reply);
    if (data === PARSE_FAILED) return;
    const existing = unwrap(
      await db.from('catalogue').select('id').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!existing) return reply.notFound('Catalogue item not found');

    const { parts, hardware, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    // Links are replaced wholesale when provided, and the derived price /
    // single-piece flag re-roll from the new children.
    if (parts) {
      const links = await resolveLinks(parts);
      if ('missing' in links) return reply.badRequest(`Unknown library part id(s): ${links.missing.join(', ')}`);
      await writeLinks(id, links);
      Object.assign(patch, rollUp(links));
    }
    if (Object.keys(patch).length) unwrap(await db.from('catalogue').update(patch).eq('id', id).select('id'));
    if (hardware) {
      unwrap(await db.from('catalogue_hardware').delete().eq('catalogueId', id).select('id'));
      if (hardware.length)
        unwrap(await db.from('catalogue_hardware').insert(hardware.map((h) => ({ ...h, catalogueId: id }))).select('id'));
    }
    return fetchOne(id);
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('catalogue').update({ deletedAt: new Date().toISOString() })
        .eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Catalogue item not found');
    return reply.status(204).send();
  });
};

/** Case-insensitive (code, detail) clash among live library parts. */
async function findDuplicate(drawing: string | null, detail: string, exceptId: number | null) {
  const rows = unwrap(
    await db.from('catalogue_parts').select('id, drawing, detail').is('deletedAt', null).ilike('detail', detail.trim()),
  ) as { id: number; drawing: string | null; detail: string }[];
  const code = (drawing ?? '').trim().toUpperCase();
  return rows.find((p) => p.id !== exceptId && (p.drawing ?? '').trim().toUpperCase() === code) ?? null;
}

/** Re-derive unitPrice on every live product that links the given part. */
async function rerollProductsUsing(partId: number) {
  const links = unwrap(
    await db.from('catalogue_product_parts').select('catalogueId').eq('partId', partId),
  ) as { catalogueId: number }[];
  for (const cid of new Set(links.map((l) => l.catalogueId))) {
    const all = unwrap(
      await db.from('catalogue_product_parts').select('qty, part:catalogue_parts(*)').eq('catalogueId', cid),
    ) as unknown as { qty: number; part: LibPart | null }[];
    const live = all.filter((l) => l.part) as { qty: number; part: LibPart }[];
    unwrap(await db.from('catalogue').update(rollUp(live)).eq('id', cid).select('id'));
  }
}
