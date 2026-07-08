import type { FastifyPluginAsync } from 'fastify';
import {
  AUTO_PCT,
  assignOperativesSchema,
  despatchTicketsSchema,
  familyReadyCheck,
  pctForStatus,
  statusChangeSchema,
  ticketInputSchema,
  ticketUpdateSchema,
  type TicketStatus,
} from '@bowson/shared';
import { z } from 'zod';
import { db, unwrap } from '../supabase.js';
import { PARSE_FAILED, parse, parseId } from '../lib/validate.js';
import { recomputeForTicket, recomputeOrder } from '../services/recompute.js';
import { nextTn } from '../services/tn.js';

const SELECT =
  '*, order:orders(*, customer:customers(*)), mould:moulds(*), assignments:ticket_assignments(*, operative:operatives(*)), time:time_sessions(*)';

const timerSchema = z.object({ operativeId: z.number().int() });
const mouldAssignSchema = z.object({ mouldId: z.number().int().nullable() });
const cureSetSchema = z.object({ targetStage: z.string().optional(), mins: z.number().int().positive() });

/** A mould is free if not in maintenance and its in-mould slots (Gel Coat /
 * Laminating) are below capacity. */
async function isMouldFree(mouldId: number): Promise<boolean> {
  const mould = unwrap(
    await db.from('moulds').select('qty, status').eq('id', mouldId).is('deletedAt', null).maybeSingle(),
  ) as { qty: number; status: string } | null;
  if (!mould || mould.status === 'Maintenance') return false;
  const active = unwrap(
    await db.from('tickets').select('id')
      .eq('mouldId', mouldId).in('status', ['4. Gel Coat', '5. Laminating']).is('deletedAt', null),
  ) as { id: number }[];
  return active.length < (mould.qty || 1);
}

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
      await db.from('orders').select('id, status').eq('id', data.orderId).is('deletedAt', null).maybeSingle(),
    ) as { id: number; status: string } | null;
    if (!order) return reply.badRequest('orderId does not reference an existing order');

    const status = data.status ?? defaultStatus(data.type);
    const netPrice = (data.unitPrice ?? 0) * (data.qty ?? 1);
    // Ticket numbers are only issued once the order is in production; tickets
    // on a Pending order stay tn=null until release (prototype parity).
    const tn = order.status === 'Pending' ? null : await nextTn();
    const created = unwrap(
      await db.from('tickets').insert({ ...data, tn, status, pct: AUTO_PCT[status] ?? 0, netPrice })
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
      await db.from('tickets').select('id, tn, type, detail, status, pct, netPrice, orderId, compParentId')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ id: number; tn: number | null; type: string; detail: string; status: string; pct: number; netPrice: number } & TicketRef) | null;
    if (!existing) return reply.notFound('Ticket not found');

    const to = body.status;

    // Family gate (ported from doAdvance): a COMP / PART can only jump to
    // Despatched when its whole family is at Ready to Despatch, unless a
    // manager override is supplied.
    if (
      to === 'Despatched' && !body.managerOverride &&
      (existing.type === 'COMP' || existing.type === 'PART')
    ) {
      const family = unwrap(
        await db.from('tickets').select('id, tn, type, detail, status, pct, netPrice, compParentId, orderId')
          .eq('orderId', existing.orderId).is('deletedAt', null),
      ) as (typeof existing)[];
      const check = familyReadyCheck(existing, family);
      if (!check.ready) {
        return reply.status(409).send({ gate: 'family', notReady: check.notReady });
      }
    }

    const update: Record<string, unknown> = {
      status: to,
      pct: pctForStatus(to),
      completed: to === 'Despatched' ? new Date().toISOString() : null,
      despatchDate: to === 'Despatched' ? new Date().toISOString().slice(0, 10) : null,
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
        note: body.note ?? (to === 'Despatched' && body.managerOverride ? 'Manager override — family not ready' : null),
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

  // Assign / unassign a mould (auto-advances stage 3 → Gel Coat if the mould is free)
  app.post('/:id/mould', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(mouldAssignSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    const t = unwrap(
      await db.from('tickets').select('status, orderId, compParentId').eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ status: string } & TicketRef) | null;
    if (!t) return reply.notFound('Ticket not found');

    if (body.mouldId == null) {
      unwrap(await db.from('tickets').update({ mouldId: null }).eq('id', id).select('id'));
      return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
    }

    const mould = unwrap(
      await db.from('moulds').select('id').eq('id', body.mouldId).is('deletedAt', null).maybeSingle(),
    );
    if (!mould) return reply.badRequest('mouldId does not reference a mould');

    const update: Record<string, unknown> = { mouldId: body.mouldId };
    let autoAdvanced = false;
    if (t.status === '3. Queue - Awaiting Mould' && (await isMouldFree(body.mouldId))) {
      update.status = '4. Gel Coat';
      update.pct = AUTO_PCT['4. Gel Coat'];
      autoAdvanced = true;
    }
    unwrap(await db.from('tickets').update(update).eq('id', id).select('id'));
    if (autoAdvanced) {
      unwrap(
        await db.from('audit_log').insert({
          entityType: 'ticket', entityId: id, field: 'status',
          fromValue: '3. Queue - Awaiting Mould', toValue: '4. Gel Coat',
          note: 'Auto-advanced — mould was free',
        }).select('id'),
      );
      await recomputeForTicket(t);
    }
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Start a gel-coat cure timer
  app.post('/:id/cure', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const body = parse(cureSetSchema, req.body, reply);
    if (body === PARSE_FAILED) return;
    const exists = unwrap(await db.from('tickets').select('id').eq('id', id).is('deletedAt', null).maybeSingle());
    if (!exists) return reply.notFound('Ticket not found');
    unwrap(
      await db.from('tickets').update({
        cureTargetStage: body.targetStage ?? null,
        cureStart: new Date().toISOString(),
        cureMins: body.mins,
        cureCleared: false,
      }).eq('id', id).select('id'),
    );
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // Confirm a cure is done — clears the timer and advances to the target stage (if set)
  app.post('/:id/cure/clear', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const t = unwrap(
      await db.from('tickets').select('status, cureTargetStage, orderId, compParentId')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ status: string; cureTargetStage: string | null } & TicketRef) | null;
    if (!t) return reply.notFound('Ticket not found');

    const update: Record<string, unknown> = { cureCleared: true };
    if (t.cureTargetStage) {
      update.status = t.cureTargetStage;
      update.pct = pctForStatus(t.cureTargetStage);
    }
    unwrap(await db.from('tickets').update(update).eq('id', id).select('id'));
    if (t.cureTargetStage) {
      unwrap(
        await db.from('audit_log').insert({
          entityType: 'ticket', entityId: id, field: 'status',
          fromValue: t.status, toValue: t.cureTargetStage, note: 'Cure confirmed',
        }).select('id'),
      );
      await recomputeForTicket(t);
    }
    return unwrap(await db.from('tickets').select(SELECT).eq('id', id).maybeSingle());
  });

  // ── Despatch pipeline ──────────────────────────────────────────────────────
  // Bulk despatch from the Ready to Despatch screen (ported from
  // despatchSelected → _proceedDespatch → doDespatching). Gates:
  //  1. COMP family gate — every member of a selected assembly's family must be
  //     at "10. Ready to Despatch" (409 gate:'family' unless managerOverride).
  //  2. Partial despatch — if an order's top-level non-RAW tickets aren't all
  //     covered by the selection, 409 gate:'partial' unless confirmPartial;
  //     despatched tickets are then flagged partialDespatch.
  // Selected COMPs are expanded to include all their PART children.
  app.post('/despatch', async (req, reply) => {
    const body = parse(despatchTicketsSchema, req.body, reply);
    if (body === PARSE_FAILED) return;

    const SLIM = 'id,tn,type,detail,status,pct,netPrice,compParentId,orderId';
    type Slim = {
      id: number; tn: number | null; type: string; detail: string; status: string;
      pct: number; netPrice: number; compParentId: number | null; orderId: number;
    };
    const selected = unwrap(
      await db.from('tickets').select(SLIM).in('id', body.ticketIds).is('deletedAt', null),
    ) as Slim[];
    if (!selected.length) return reply.badRequest('No matching tickets to despatch');

    const orderIds = [...new Set(selected.map((t) => t.orderId))];
    const family = unwrap(
      await db.from('tickets').select(SLIM).in('orderId', orderIds).is('deletedAt', null),
    ) as Slim[];

    // Gate 1: for ANY ticket in a COMP family, ALL members must be Ready to Despatch.
    if (!body.managerOverride) {
      const checked = new Set<number>();
      const blocked: { tn: number | null; detail: string; notReady: unknown[] }[] = [];
      for (const t of selected) {
        const compId = t.type === 'COMP' ? t.id : t.compParentId;
        if (compId == null || checked.has(compId)) continue;
        checked.add(compId);
        const check = familyReadyCheck(t, family);
        if (!check.ready) {
          const comp = family.find((x) => x.id === compId);
          blocked.push({ tn: comp?.tn ?? t.tn, detail: comp?.detail ?? t.detail, notReady: check.notReady });
        }
      }
      if (blocked.length) return reply.status(409).send({ gate: 'family', blocked });
    }

    // Gate 2: partial despatch — some top-level non-RAW tickets on an order are
    // neither already Despatched nor in this selection.
    const uncoveredOf = (oid: number) =>
      family.filter(
        (t) =>
          t.orderId === oid && t.compParentId == null && t.type !== 'RAW' &&
          t.status !== 'Despatched' && !selected.some((s) => s.id === t.id),
      );
    const partialOrderIds = orderIds.filter((oid) => uncoveredOf(oid).length > 0);
    const isPartial = partialOrderIds.length > 0;
    if (isPartial && !body.confirmPartial) {
      const orders = unwrap(
        await db.from('orders').select('id, orderNumber').in('id', partialOrderIds),
      ) as { id: number; orderNumber: string }[];
      return reply.status(409).send({
        gate: 'partial',
        orders: partialOrderIds.map((oid) => {
          const tops = family.filter((t) => t.orderId === oid && t.compParentId == null && t.type !== 'RAW');
          return {
            orderNumber: orders.find((o) => o.id === oid)?.orderNumber ?? String(oid),
            selected: selected.filter((s) => s.orderId === oid).length,
            total: tops.length,
          };
        }),
      });
    }

    // Expand: a despatched COMP takes all its PART children with it.
    const expanded = [...selected];
    for (const t of selected) {
      if (t.type !== 'COMP') continue;
      for (const p of family.filter((x) => x.compParentId === t.id)) {
        if (!expanded.some((x) => x.id === p.id)) expanded.push(p);
      }
    }

    const despatchDate = new Date().toISOString().slice(0, 10);
    const completed = new Date().toISOString();
    for (const t of expanded) {
      unwrap(
        await db.from('tickets').update({
          status: 'Despatched', pct: 100, despatchDate, completed,
          ...(isPartial ? { partialDespatch: true } : {}),
        }).eq('id', t.id).select('id'),
      );
      unwrap(
        await db.from('audit_log').insert({
          entityType: 'ticket', entityId: t.id, field: 'status',
          fromValue: t.status, toValue: 'Despatched',
          note: isPartial ? 'Partial despatch' : (body.managerOverride ? 'Manager override — family not ready' : null),
        }).select('id'),
      );
    }
    for (const oid of orderIds) await recomputeOrder(oid);

    const rows = unwrap(
      await db.from('tickets').select(SELECT).in('id', expanded.map((t) => t.id)).order('id', { ascending: true }),
    );
    return { tickets: rows, partial: isPartial, despatchDate };
  });

  // Manager-PIN-authorised despatch of a single blocked ticket (COMP whose
  // family isn't ready, or a lone PART) — ported from managerOverrideDespatch.
  app.post('/:id/despatch-override', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id, reply);
    if (id === PARSE_FAILED) return;
    const t = unwrap(
      await db.from('tickets').select('status, orderId, compParentId')
        .eq('id', id).is('deletedAt', null).maybeSingle(),
    ) as ({ status: string } & TicketRef) | null;
    if (!t) return reply.notFound('Ticket not found');

    unwrap(
      await db.from('tickets').update({
        status: 'Despatched', pct: 100, managerOverride: true,
        despatchDate: new Date().toISOString().slice(0, 10),
        completed: new Date().toISOString(),
      }).eq('id', id).select('id'),
    );
    unwrap(
      await db.from('audit_log').insert({
        entityType: 'ticket', entityId: id, field: 'manager_override',
        fromValue: t.status, toValue: 'Despatched', note: 'Manager override despatch',
      }).select('id'),
    );
    await recomputeForTicket(t);
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
