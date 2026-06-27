import type { FastifyPluginAsync } from 'fastify';
import {
  AUTO_PCT,
  assignOperativesSchema,
  pctForStatus,
  statusChangeSchema,
  ticketInputSchema,
  ticketUpdateSchema,
  type TicketStatus,
} from '@bowson/shared';
import { z } from 'zod';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';
import { recomputeForTicket } from '../services/recompute.js';

const SELECT =
  '*, order:orders(*, customer:customers(*)), mould:moulds(*), assignments:ticket_assignments(*, operative:operatives(*)), time:time_sessions(*)';

const timerSchema = z.object({ operativeId: z.number().int() });

/** Default starting status by ticket type (RAW items start "Ordered"). */
function defaultStatus(type: string): TicketStatus {
  return type === 'RAW' ? 'Ordered' : '1. Spec Required';
}

type TicketRef = { orderId: number; compParentId: number | null };

export const ticketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { orderId, status } = req.query as { orderId?: string; status?: string };
    let q = db.from('tickets').select(SELECT).is('deletedAt', null);
    if (orderId) q = q.eq('orderId', Number(orderId));
    if (status) q = q.eq('status', status);
    return unwrap(await q.order('id', { ascending: true }));
  });

  app.get('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const row = unwrap(
      await db.from('tickets').select(`${SELECT}, parts:tickets!compParentId(*)`)
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!row) return reply.notFound('Ticket not found');
    return row;
  });

  app.post('/', async (req, reply) => {
    const data = parse(ticketInputSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const order = unwrap(
      await db.from('orders').select('id').eq('id', data.orderId).is('deletedAt', null).maybeSingle(),
    );
    if (!order) return reply.badRequest('orderId does not reference an existing order');

    const status = data.status ?? defaultStatus(data.type);
    const netPrice = (data.unitPrice ?? 0) * (data.qty ?? 1);
    const created = unwrap(
      await db.from('tickets').insert({ ...data, status, pct: AUTO_PCT[status] ?? 0, netPrice })
        .select('id').single(),
    );
    await recomputeForTicket({ orderId: data.orderId, compParentId: data.compParentId ?? null });
    return reply.status(201).send(
      unwrap(await db.from('tickets').select(SELECT).eq('id', (created as { id: number }).id).maybeSingle()),
    );
  });

  app.patch('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const data = parse(ticketUpdateSchema, req.body, reply);
    if (data === PARSE_FAILED) return;
    const existing = unwrap(
      await db.from('tickets').select('unitPrice, qty, orderId, compParentId')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ unitPrice: number; qty: number } & TicketRef) | null;
    if (!existing) return reply.notFound('Ticket not found');

    const unitPrice = data.unitPrice ?? existing.unitPrice;
    const qty = data.qty ?? existing.qty;
    unwrap(await db.from('tickets').update({ ...data, netPrice: unitPrice * qty }).eq('id', id).select('id'));
    await recomputeForTicket(existing);
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Stage transition / status change
  app.post('/:id/status', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(statusChangeSchema, req.body, reply);
    if (body === PARSE_FAILED) return;

    const existing = unwrap(
      await db.from('tickets').select('status, orderId, compParentId')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ status: string } & TicketRef) | null;
    if (!existing) return reply.notFound('Ticket not found');

    const to = body.status;
    const update: Record<string, unknown> = {
      status: to,
      pct: pctForStatus(to),
      completed: to === 'Despatched' ? new Date().toISOString() : null,
    };
    unwrap(await db.from('tickets').update(update).eq('id', id).select('id'));

    // Audit trail
    unwrap(
      await db.from('audit_log').insert({
        entityType: 'ticket',
        entityId: id,
        field: 'status',
        fromValue: existing.status,
        toValue: to,
        note: body.note ?? null,
      }).select('id'),
    );

    await recomputeForTicket(existing);
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Assign operatives (replaces the current set)
  app.post('/:id/assign', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(assignOperativesSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    const exists = unwrap(
      await db.from('tickets').select('id').eq('id', id).is('deletedAt', null).maybeSingle(),
    );
    if (!exists) return reply.notFound('Ticket not found');

    unwrap(await db.from('ticket_assignments').delete().eq('ticketId', id).select('id'));
    if (body.operativeIds.length) {
      const rows = [...new Set(body.operativeIds)].map((operativeId) => ({ ticketId: id, operativeId }));
      unwrap(await db.from('ticket_assignments').insert(rows).select('id'));
    }
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Start a time session for an operative on this ticket (no-op if already running)
  app.post('/:id/time/start', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(timerSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    const open = unwrap(
      await db.from('time_sessions').select('id')
        .eq('ticketId', id).eq('operativeId', body.operativeId).is('end', null).maybeSingle(),
    );
    if (!open) {
      unwrap(
        await db.from('time_sessions')
          .insert({ ticketId: id, operativeId: body.operativeId, start: new Date().toISOString() })
          .select('id'),
      );
    }
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Stop the running time session for an operative on this ticket
  app.post('/:id/time/stop', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(timerSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    unwrap(
      await db.from('time_sessions').update({ end: new Date().toISOString() })
        .eq('ticketId', id).eq('operativeId', body.operativeId).is('end', null).select('id'),
    );
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  app.delete('/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const existing = unwrap(
      await db.from('tickets').select('orderId, compParentId').eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as TicketRef | null;
    if (!existing) return reply.notFound('Ticket not found');
    unwrap(
      await db.from('tickets').update({ deletedAt: new Date().toISOString() }).eq('id', id).select('id'),
    );
    await recomputeForTicket(existing);
    return reply.status(204).send();
  });
};
