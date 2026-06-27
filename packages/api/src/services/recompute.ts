import {
  compPct,
  compRollupStatus,
  deriveOrderStatus,
  orderValue,
  type TicketLike,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';

const TICKET_COLS = 'id,type,status,pct,netPrice,compParentId,orderId';

async function orderTickets(orderId: number): Promise<(TicketLike & { orderId: number })[]> {
  return unwrap(
    await db.from('tickets').select(TICKET_COLS).eq('orderId', orderId).is('deletedAt', null),
  ) as (TicketLike & { orderId: number })[];
}

/** Recompute a COMP's status + pct from its (non-deleted) parts. */
export async function syncComp(compId: number): Promise<void> {
  const comp = unwrap(
    await db.from('tickets').select(TICKET_COLS).eq('id', compId).maybeSingle(),
  ) as TicketLike | null;
  if (!comp || comp.type !== 'COMP') return;
  const parts = unwrap(
    await db.from('tickets').select(TICKET_COLS).eq('compParentId', compId).is('deletedAt', null),
  ) as TicketLike[];
  await db.from('tickets').update({
    status: compRollupStatus(comp, parts),
    pct: compPct(parts),
  }).eq('id', compId);
}

/** Recompute an order's value + derived status from its tickets. */
export async function recomputeOrder(orderId: number): Promise<void> {
  const order = unwrap(
    await db.from('orders').select('status').eq('id', orderId).maybeSingle(),
  ) as { status: string } | null;
  if (!order) return;
  const tickets = await orderTickets(orderId);
  await db.from('orders').update({
    value: orderValue(tickets),
    status: deriveOrderStatus(order.status, tickets),
  }).eq('id', orderId);
}

/**
 * After a ticket changes: if it's a PART, roll its COMP parent up first, then
 * recompute the owning order (value + status).
 */
export async function recomputeForTicket(ticket: {
  orderId: number;
  compParentId: number | null;
}): Promise<void> {
  if (ticket.compParentId != null) await syncComp(ticket.compParentId);
  await recomputeOrder(ticket.orderId);
}
