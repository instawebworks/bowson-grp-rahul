// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN CONSTANTS — ported 1:1 from the original t-card.html prototype.
// Do NOT re-guess these values; they encode the real manufacturing workflow.
// ═══════════════════════════════════════════════════════════════════════════

/** Live (in-production) GRP stages — excludes the terminal "Despatched". */
export const LIVE_STATUSES = [
  '1. Spec Required',
  '2. Materials Required',
  '3. Queue - Awaiting Mould',
  '4. Gel Coat',
  '5. Laminating',
  '6. Trim & Finish',
  '7. Assembly',
  '8. QC Check',
  '9. Packing',
  '10. Ready to Despatch',
] as const;

/** Full ordered GRP manufacturing pipeline (11 stages incl. terminal). */
export const GRP_STAGES = [...LIVE_STATUSES, 'Despatched'] as const;
export type GrpStage = (typeof GRP_STAGES)[number];

/** Short labels aligned by index with GRP_STAGES. */
export const STAGE_SHORT = [
  'Spec', 'Materials', 'Queue', 'Gel Coat', 'Lam', 'Trim',
  'Assembly', 'QC', 'Packing', 'Ready', 'Despatched',
] as const;

/** Stages for bought-in RAW material tickets. */
export const RAW_STAGES = ['Ordered', 'Received'] as const;
export type RawStage = (typeof RAW_STAGES)[number];

/** Order-level statuses. */
export const ORDER_STATS = [
  'Pending', 'In Progress', 'Ready to Despatch', 'Despatched', 'Completed', 'Cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATS)[number];

/** Every possible ticket status. */
export const ALL_TICKET_STATS = [...GRP_STAGES, 'Ordered', 'Received', 'Order Cancelled'] as const;
export type TicketStatus = (typeof ALL_TICKET_STATS)[number];

/** Ticket types. */
export const TICKET_TYPES = ['RAW', 'MADE', 'COMP', 'PART'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/** Despatch methods. */
export const DESPATCH = ['BOWSON TO ARRANGE DELIVERY', 'CUSTOMER TO COLLECT'] as const;
export type DespatchMethod = (typeof DESPATCH)[number];

/** Resin types (M2 = fire-rated / USA spec). */
export const RESIN_TYPES = ['Standard', 'M2'] as const;
export type ResinType = (typeof RESIN_TYPES)[number];

/**
 * Fraction of labour hours REMAINING at the start of each stage — used for
 * deadline burndown. Pre-production stages = 1.00 (no work done yet).
 */
export const STAGE_HRS_REMAINING: Record<GrpStage, number> = {
  '1. Spec Required': 1.0,
  '2. Materials Required': 1.0,
  '3. Queue - Awaiting Mould': 1.0,
  '4. Gel Coat': 0.85,
  '5. Laminating': 0.65,
  '6. Trim & Finish': 0.4,
  '7. Assembly': 0.25,
  '8. QC Check': 0.12,
  '9. Packing': 0.05,
  '10. Ready to Despatch': 0.01,
  Despatched: 0.0,
};

/** Auto-calculated progress percentage per status. */
export const AUTO_PCT: Record<TicketStatus, number> = {
  '1. Spec Required': 0,
  '2. Materials Required': 10,
  '3. Queue - Awaiting Mould': 20,
  '4. Gel Coat': 35,
  '5. Laminating': 50,
  '6. Trim & Finish': 63,
  '7. Assembly': 72,
  '8. QC Check': 85,
  '9. Packing': 95,
  '10. Ready to Despatch': 98,
  Despatched: 100,
  Ordered: 0,
  Received: 100,
  'Order Cancelled': 0,
};

/** Hours per working day used in capacity planning. */
export const HRS_PER_DAY = 7.5;

/**
 * Stages that require an operative skill (used for capacity-by-skill planning
 * and operative skill assignment). Must use FULL GRP_STAGES names with numbers.
 */
export const STAGE_SKILLS = [
  '4. Gel Coat',
  '5. Laminating',
  '6. Trim & Finish',
  '7. Assembly',
  '8. QC Check',
  '9. Packing',
] as const;

/** 10 T-Card colour palettes that rotate by order. */
export const KB_PALETTES = [
  { bg: '#e8f4fd', border: '#1a6fa8', header: '#1a6fa8', text: '#0a3d5c' }, // Blue
  { bg: '#edf7ed', border: '#1a7a3a', header: '#1a7a3a', text: '#0a3d1a' }, // Green
  { bg: '#fdf3e8', border: '#a86010', header: '#a86010', text: '#5c3000' }, // Amber
  { bg: '#f5edfb', border: '#7a35b0', header: '#7a35b0', text: '#3d1a5c' }, // Purple
  { bg: '#fdedf2', border: '#b02050', header: '#b02050', text: '#5c0a25' }, // Rose
  { bg: '#edfbfb', border: '#1a8a8a', header: '#1a8a8a', text: '#0a4444' }, // Teal
  { bg: '#fdf8ed', border: '#8a7010', header: '#8a7010', text: '#443800' }, // Gold
  { bg: '#edf0fb', border: '#2a40b0', header: '#2a40b0', text: '#0a1a5c' }, // Indigo
  { bg: '#fdedf8', border: '#a83080', header: '#a83080', text: '#5c0a3d' }, // Pink
  { bg: '#f0fbed', border: '#3a8a20', header: '#3a8a20', text: '#1a4400' }, // Lime
] as const;

/** Stable palette for an order given its index in the ordered list. */
export function paletteForIndex(idx: number) {
  return KB_PALETTES[(idx < 0 ? 0 : idx) % KB_PALETTES.length]!;
}
