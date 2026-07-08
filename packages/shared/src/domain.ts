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

/** A member of a COMP family that is not yet at Ready to Despatch. */
export interface FamilyNotReady {
  tn: number | null;
  detail: string;
  type: 'Assembly' | 'Part' | 'Warning';
  status: string;
}

export interface FamilyReadyResult {
  ready: boolean;
  notReady: FamilyNotReady[];
  compId: number | null;
}

/**
 * Check whether all members of a COMP family (the assembly + every part) are at
 * "10. Ready to Despatch" (ported from familyReadyCheck). MADE tickets have no
 * family and are always ready.
 */
export function familyReadyCheck(
  ticket: TicketLike & { tn?: number | null; detail?: string },
  tickets: (TicketLike & { tn?: number | null; detail?: string })[],
): FamilyReadyResult {
  const compId = ticket.type === 'COMP' ? ticket.id : ticket.compParentId;
  if (compId == null) return { ready: true, notReady: [], compId: null };
  const comp = tickets.find((t) => t.id === compId);
  if (!comp) return { ready: true, notReady: [], compId };

  const parts = tickets.filter((t) => t.compParentId === compId);
  const rtd = '10. Ready to Despatch';
  const notReady: FamilyNotReady[] = [];
  if (comp.status !== rtd) {
    notReady.push({ tn: comp.tn ?? null, detail: comp.detail ?? '', type: 'Assembly', status: comp.status });
  }
  for (const p of parts) {
    if (p.status !== rtd) {
      notReady.push({ tn: p.tn ?? null, detail: p.detail ?? '', type: 'Part', status: p.status });
    }
  }
  // No parts found at all is itself suspicious — block unless a manager overrides.
  if (!parts.length && comp.status === rtd) {
    notReady.push({ tn: null, detail: 'No part tickets found for this assembly', type: 'Warning', status: 'Unknown' });
  }
  return { ready: notReady.length === 0, notReady, compId };
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
  // Completed is a terminal, manually set state (invoice printed) — never
  // downgrade it back to Despatched on a recompute.
  if (allDespatched) return current === 'Completed' ? 'Completed' : 'Despatched';

  const allReady = nonRaw.every((t) => READY_OR_DONE.includes(eff(t)));
  if (allReady) return 'Ready to Despatch';

  const anyInProd = nonRaw.some((t) => !['1. Spec Required', ...READY_OR_DONE].includes(eff(t)));
  if (anyInProd) return 'In Progress';

  return current;
}
