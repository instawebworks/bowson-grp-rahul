import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AUTO_PCT,
  orderInputSchema,
  orderUpdateSchema,
  resinTypeSchema,
  ticketTypeSchema,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';
import { recomputeOrder, syncComp } from '../services/recompute.js';

const SELECT = '*, customer:customers(*), tickets:tickets(*, assignments:ticket_assignments(*))';

/** Add a ticket either from a catalogue template (fromCatalogueId) or manually. */
const addTicketSchema = z.object({
  fromCatalogueId: z.number().int().optional(),
  colour: z.string().optional(),
  resin: resinTypeSchema.optional(),
  type: ticketTypeSchema.optional(),
  detail: z.string().optional(),
  spec: z.string().nullish(),
  drawing: z.string().nullish(),
  hrs: z.number().nonnegative().optional(),
  qty: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  resinType: resinTypeSchema.nullish(),
});

interface CatPart {
  id: number;
  detail: string;
  spec: string | null;
  hrs: number;
  price: number;
  drawing: string | null;
  mouldId: number | null;
}

/** Next ticket number = max(tn) + 1. */
async function nextTn(): Promise<number> {
  const row = unwrap(
    await db.from('tickets').select('tn').not('tn', 'is', null)
      .order('tn', { ascending: false }).limit(1).maybeSingle(),
  ) as { tn: number } | null;
  return (row?.tn ?? 0) + 1;
}

/** Convert nullable Date inputs to ISO strings for Supabase. */
function serializeOrder<T extends { deadline?: Date | null }>(data: T) {
  const { deadline, ...rest } = data;
  return { ...rest, ...(deadline !== undefined ? { deadline: deadline ? deadline.toISOString() : null } : {}) };
}

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return unwrap(
      await db.from('orders').select(SELECT)
        .is('deletedAt', null).is('tickets.deletedAt', null)
        .order('createdAt', { ascending: false }),
    );
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('orders').select(SELECT).eq('id', id).is('deletedAt', null)
        .is('tickets.deletedAt', null).maybeSingle(),
    );
    if (!row) return reply.notFound('Order not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(orderInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const dup = unwrap(
      await db.from('orders').select('id').eq('orderNumber', data.orderNumber).maybeSingle(),
    );
    if (dup) return reply.conflict(`Order number "${data.orderNumber}" already exists`);
    const created = unwrap(await db.from('orders').insert(serializeOrder(data)).select('id').single());
    return reply.status(201).send(
      unwrap(await db.from('orders').select(SELECT).eq('id', (created as { id: number }).id).maybeSingle()),
    );
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(orderUpdateSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const existing = unwrap(
      await db.from('orders').select('id').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!existing) return reply.notFound('Order not found');
    unwrap(await db.from('orders').update(serializeOrder(data)).eq('id', id).select('id'));
    return unwrap(await db.from('orders').select(SELECT).eq('id', id).is('tickets.deletedAt', null).maybeSingle());
  });

  // Add a ticket to an order — from a catalogue template or a manual entry.
  app.post('/:id/tickets', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(addTicketSchema, req.body, reply);
    if (body === PARSE_FAILED) return;

    const order = unwrap(
      await db.from('orders').select('id, status, wc, themeImage, resinType')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as { id: number; status: string; wc: string | null; themeImage: string | null; resinType: string } | null;
    if (!order) return reply.notFound('Order not found');

    const isPending = order.status === 'Pending';
    let tnCounter = isPending ? 0 : await nextTn();
    const tnFor = () => (isPending ? null : tnCounter++);
    const themeImage = order.themeImage ?? null;

    if (body.fromCatalogueId != null) {
      const tpl = unwrap(
        await db.from('catalogue').select('*, parts:catalogue_parts(*)')
          .eq('id', body.fromCatalogueId).is('deletedAt', null).maybeSingle(),
      ) as { name: string; drawing: string | null; unitPrice: number; parts: CatPart[] } | null;
      if (!tpl) return reply.badRequest('fromCatalogueId does not reference a catalogue item');

      const resin = body.resin ?? order.resinType ?? 'Standard';
      const resinTag = resin === 'M2' ? ' / M2 RESIN' : '';
      const colour = (body.colour ?? '').trim();
      const spec = colour ? colour + resinTag : resinTag.replace(/^\s*\/\s*/, '') || null;
      const parts = (tpl.parts ?? []).slice().sort((a, b) => a.id - b.id);

      if (parts.length <= 1) {
        const p = parts[0];
        unwrap(
          await db.from('tickets').insert({
            orderId: id, tn: tnFor(), type: 'MADE', detail: tpl.name,
            spec: spec ?? p?.spec ?? null, drawing: tpl.drawing ?? p?.drawing ?? null,
            status: '1. Spec Required', pct: 0, wc: order.wc, hrs: p?.hrs ?? 0, qty: 1,
            unitPrice: tpl.unitPrice, netPrice: tpl.unitPrice, resinType: resin,
            mouldId: p?.mouldId ?? null, themeImage,
          }).select('id'),
        );
      } else {
        const comp = unwrap(
          await db.from('tickets').insert({
            orderId: id, tn: tnFor(), type: 'COMP', detail: tpl.name, spec,
            drawing: tpl.drawing ?? null, status: '1. Spec Required', pct: 0, wc: order.wc,
            hrs: 0, qty: 1, unitPrice: tpl.unitPrice, netPrice: tpl.unitPrice, resinType: resin, themeImage,
          }).select('id').single(),
        ) as { id: number };
        const partRows = parts.map((p) => ({
          orderId: id, tn: tnFor(), type: 'PART', compParentId: comp.id, detail: p.detail,
          spec: spec ?? p.spec ?? null, drawing: p.drawing ?? null, status: '1. Spec Required',
          pct: 0, wc: order.wc, hrs: p.hrs ?? 0, qty: 1, unitPrice: p.price ?? 0,
          netPrice: p.price ?? 0, mouldId: p.mouldId ?? null, resinType: resin, themeImage,
        }));
        unwrap(await db.from('tickets').insert(partRows).select('id'));
        await syncComp(comp.id);
      }
      await db.from('orders').update({ resinType: resin }).eq('id', id);
    } else {
      if (!body.type || !body.detail) {
        return reply.badRequest('A manual ticket needs at least "type" and "detail"');
      }
      const status = body.type === 'RAW' ? 'Ordered' : '1. Spec Required';
      const qty = body.qty ?? 1;
      const unitPrice = body.unitPrice ?? 0;
      unwrap(
        await db.from('tickets').insert({
          orderId: id, tn: tnFor(), type: body.type, detail: body.detail,
          spec: body.spec ?? null, drawing: body.drawing ?? null, status,
          pct: AUTO_PCT[status] ?? 0, wc: order.wc, hrs: body.hrs ?? 0, qty, unitPrice,
          netPrice: unitPrice * qty, resinType: body.resinType ?? order.resinType, themeImage,
        }).select('id'),
      );
    }

    await recomputeOrder(id);
    return reply.status(201).send(
      unwrap(await db.from('orders').select(SELECT).eq('id', id).is('tickets.deletedAt', null).maybeSingle()),
    );
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('orders').update({ deletedAt: new Date().toISOString() })
        .eq('id', id).is('deletedAt', null).select().maybeSingle(),
    );
    if (!row) return reply.notFound('Order not found');
    // Soft-delete the order's tickets too, so they leave the board / lists.
    const ts = new Date().toISOString();
    unwrap(await db.from('tickets').update({ deletedAt: ts }).eq('orderId', id).is('deletedAt', null).select('id'));
    return reply.status(204).send();
  });
};
