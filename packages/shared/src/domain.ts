// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN LOGIC — ported 1:1 from t-card.html. Pure functions, no I/O, so they
// are shared by the API (authoritative) and the web UI, and are unit-testable.
// ═══════════════════════════════════════════════════════════════════════════
import { AUTO_PCT, GRP_STAGES, type GrpStage, type TicketStatus } from './constants.js';

/** Minimal ticket shape the domain logic needs. */
export interface TicketLike {
  id: number;
  type: string; // RAW | MADE | COMP | PART
  status: string;
  pct: number;
  netPrice: number;
  compParentId: number | null;
}

/** Index of a status within the GRP pipeline (-1 if not a GRP stage). */
export function stageIndex(status: string): number {
  return (GRP_STAGES as readonly string[]).indexOf(status);
}

export function isGrpStage(status: string): status is GrpStage {
  return stageIndex(status) >= 0;
}

/** The next stage in the pipeline, or null at the end / for non-GRP statuses. */
export function nextStage(status: string): GrpStage | null {
  const idx = stageIndex(status);
  if (idx < 0 || idx >= GRP_STAGES.length - 1) return null;
  return GRP_STAGES[idx + 1]!;
}

/** Progress % for a status (from AUTO_PCT), falling back to a provided value. */
export function pctForStatus(status: string, fallback = 0): number {
  return AUTO_PCT[status as TicketStatus] ?? fallback;
}

/** PART tickets belonging to a COMP. */
export function partsOf(tickets: TicketLike[], compId: number): TicketLike[] {
  return tickets.filter((t) => t.compParentId === compId);
}

/** Top-level tickets (not COMP children). */
export function topTickets(tickets: TicketLike[]): TicketLike[] {
  return tickets.filter((t) => t.compParentId == null);
}

/** Average progress of a COMP's parts. */
export function compPct(parts: TicketLike[]): number {
  if (!parts.length) return 0;
  return Math.round(parts.reduce((a, p) => a + (p.pct || 0), 0) / parts.length);
}

/**
 * Roll-up status of a COMP ticket from its parts (ported from compStatus):
 *  - no parts → the COMP's own status
 *  - COMP already past "Spec Required" → its own status
 *  - otherwise → "7. Assembly" if all parts reached QC, else "Awaiting Parts (x/y)"
 */
export function compRollupStatus(comp: TicketLike, parts: TicketLike[]): string {
  if (!parts.length) return comp.status;
  if (stageIndex(comp.status) > 0) return comp.status;

  const qcIdx = stageIndex('8. QC Check');
  const doneParts = parts.filter((p) => {
    const idx = stageIndex(p.status);
    return idx === -1 || idx >= qcIdx;
  }).length;
  if (doneParts === parts.length) return '7. Assembly';
  return `Awaiting Parts (${doneParts}/${parts.length})`;
}

/** Resolve a ticket's effective status (COMP → roll-up, otherwise own status). */
export function resolveStatus(ticket: TicketLike, tickets: TicketLike[]): string {
  if (ticket.type === 'COMP') return compRollupStatus(ticket, partsOf(tickets, ticket.id));
  return ticket.status;
}

/** Order value = sum of net prices of top-level tickets (COMP carries the product price). */
export function orderValue(tickets: TicketLike[]): number {
  return topTickets(tickets).reduce((a, t) => a + (t.netPrice || 0), 0);
}

/** Order progress = average progress of non-PART tickets (COMP uses its parts). */
export function orderProgress(tickets: TicketLike[]): number {
  const tops = topTickets(tickets);
  if (!tops.length) return 0;
  const pcts = tops.map((t) => (t.type === 'COMP' ? compPct(partsOf(tickets, t.id)) : t.pct || 0));
  return Math.round(pcts.reduce((a, v) => a + v, 0) / pcts.length);
}

const READY_OR_DONE = ['10. Ready to Despatch', 'Despatched'];

/**
 * Derive an order's status from its tickets (ported from autoOrderStatus).
 * Never auto-resets to Pending — returns the current status if no rule matches.
 */
export function deriveOrderStatus(current: string, tickets: TicketLike[]): string {
  const tops = topTickets(tickets);
  if (!tops.length) return current;
  const nonRaw = tops.filter((t) => t.type !== 'RAW');
  if (!nonRaw.length) return current;

  const eff = (t: TicketLike) => resolveStatus(t, tickets);

  const allDespatched = nonRaw.every((t) => eff(t) === 'Despatched');
  if (allDespatched) return 'Despatched';

  const allReady = nonRaw.every((t) => READY_OR_DONE.includes(eff(t)));
  if (allReady) return 'Ready to Despatch';

  const anyInProd = nonRaw.some((t) => !['1. Spec Required', ...READY_OR_DONE].includes(eff(t)));
  if (anyInProd) return 'In Progress';

  return current;
}
