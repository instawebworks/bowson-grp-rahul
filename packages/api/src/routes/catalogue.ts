import type { FastifyPluginAsync } from 'fastify';
import { catalogueInputSchema } from '@bowson/shared';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';

const SELECT = '*, parts:catalogue_parts(*, mould:moulds(*)), hardware:catalogue_hardware(*)';

async function fetchOne(id: number) {
  return unwrap(await db.from('catalogue').select(SELECT).eq('id', id).maybeSingle());
}

export const catalogueRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return unwrap(
      await db.from('catalogue').select(SELECT).is('deletedAt', null).order('name', { ascending: true }),
    );
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = await fetchOne(id);
    if (!row || (row as { deletedAt: string | null }).deletedAt) return reply.notFound('Catalogue item not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(catalogueInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const { parts, hardware, ...rest } = data;
    const created = unwrap(await db.from('catalogue').insert(rest).select('id').single());
    const id = (created as { id: number }).id;
    if (parts.length)
      unwrap(await db.from('catalogue_parts').insert(parts.map((p) => ({ ...p, catalogueId: id }))).select('id'));
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
    if (Object.keys(rest).length) unwrap(await db.from('catalogue').update(rest).eq('id', id).select('id'));
    // Nested arrays are replaced wholesale when provided (delete + re-insert).
    if (parts) {
      unwrap(await db.from('catalogue_parts').delete().eq('catalogueId', id).select('id'));
      if (parts.length)
        unwrap(await db.from('catalogue_parts').insert(parts.map((p) => ({ ...p, catalogueId: id }))).select('id'));
    }
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
