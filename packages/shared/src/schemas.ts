import { z } from 'zod';
import {
  ALL_TICKET_STATS,
  DESPATCH,
  ORDER_STATS,
  RESIN_TYPES,
  TICKET_TYPES,
} from './constants.js';

/** Build a Zod enum from a readonly string tuple constant, preserving literals. */
function enumOf<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values as unknown as [T[number], ...T[number][]]);
}

export const ticketStatusSchema = enumOf(ALL_TICKET_STATS);
export const orderStatusSchema = enumOf(ORDER_STATS);
export const ticketTypeSchema = enumOf(TICKET_TYPES);
export const despatchSchema = enumOf(DESPATCH);
export const resinTypeSchema = enumOf(RESIN_TYPES);

// ─── Customer ──────────────────────────────────────────────────────────────
export const customerInputSchema = z.object({
  name: z.string().min(1),
  contact: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  address: z.string().nullish(),
  region: z.string().nullish(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

// ─── Operative ─────────────────────────────────────────────────────────────
export const operativeInputSchema = z.object({
  name: z.string().min(1),
  skills: z.array(z.string()).default([]),
  defaultHrs: z.number().nonnegative().nullish(),
  dayPattern: z.array(z.number().nonnegative()).default([]),
  /** Per-week day-hour overrides keyed "<mondayIso>_d<dayIdx>" (planner). */
  dayHrs: z.record(z.number().nonnegative()).optional(),
  /** Hourly pay rate £ (shown on the operative card). */
  payRate: z.number().nonnegative().nullish(),
  /** Shop-floor login PIN (digits, set by the manager; null = default 1234). */
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits').nullish(),
});
export type OperativeInput = z.infer<typeof operativeInputSchema>;

// ─── Mould ─────────────────────────────────────────────────────────────────
export const mouldInputSchema = z.object({
  ref: z.string().min(1),
  name: z.string().nullish(),
  qty: z.number().int().positive().default(1),
  status: z.enum(['Active', 'Maintenance']).default('Active'),
  notes: z.string().nullish(),
});
export type MouldInput = z.infer<typeof mouldInputSchema>;

// ─── Order ─────────────────────────────────────────────────────────────────
export const orderInputSchema = z.object({
  orderNumber: z.string().min(1),
  customerId: z.number().int().nullish(),
  siteName: z.string().nullish(),
  status: orderStatusSchema.default('Pending'),
  deadline: z.coerce.date().nullish(),
  despatch: despatchSchema.nullish(),
  wc: z.string().nullish(),
  resinType: resinTypeSchema.default('Standard'),
  themeImage: z.string().nullish(),
  notes: z.string().nullish(),
  isDraft: z.boolean().default(true),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

/** One hardware line of the packing checklist (ported from packing_checklist). */
export const packingItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().int().nonnegative().default(0),
  notes: z.string().default(''),
  checked: z.boolean().default(false),
});
export type PackingItem = z.infer<typeof packingItemSchema>;

export const orderUpdateSchema = orderInputSchema.partial().extend({
  packingChecklist: z.array(packingItemSchema).optional(),
  packingNotes: z.string().nullish(),
});

// ─── Ticket ────────────────────────────────────────────────────────────────
export const ticketInputSchema = z.object({
  orderId: z.number().int(),
  type: ticketTypeSchema,
  compParentId: z.number().int().nullish(),
  detail: z.string().min(1),
  spec: z.string().nullish(),
  drawing: z.string().nullish(),
  status: ticketStatusSchema.optional(),
  wc: z.string().nullish(),
  hrs: z.number().nonnegative().default(0),
  /** Labour split (phase 2) — editable per ticket from the board (client snag #18). */
  lamHrs: z.number().nonnegative().nullish(),
  finHrs: z.number().nonnegative().nullish(),
  qty: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative().default(0),
  mouldId: z.number().int().nullish(),
  resinType: resinTypeSchema.nullish(),
  qcRef: z.string().nullish(),
});
export type TicketInput = z.infer<typeof ticketInputSchema>;
export const ticketUpdateSchema = ticketInputSchema.partial().omit({ orderId: true });

// ─── Catalogue ─────────────────────────────────────────────────────────────
/**
 * A library part — one unique moulded piece, created once and reused by any
 * number of products (client: "flip the catalogue"). `drawing` is the part /
 * mould code; code + detail together identify the part.
 */
export const cataloguePartInputSchema = z.object({
  detail: z.string().min(1),
  spec: z.string().nullish(),
  /** Labour split: Laminating = at-the-mould work, Finishing = trim → packing. */
  lamHrs: z.number().nonnegative().default(0),
  finHrs: z.number().nonnegative().default(0),
  price: z.number().nonnegative().default(0),
  drawing: z.string().nullish(),
  mouldId: z.number().int().nullish(),
});
export type CataloguePartInput = z.infer<typeof cataloguePartInputSchema>;

/** A product's link to a library part: one piece at a whole or half mould. */
export const PART_QTYS = [1, 0.5] as const;
export const catalogueProductPartSchema = z.object({
  partId: z.number().int(),
  qty: z.union([z.literal(1), z.literal(0.5)]).default(1),
});
export type CatalogueProductPartInput = z.infer<typeof catalogueProductPartSchema>;

export const catalogueHardwareInputSchema = z.object({
  name: z.string().min(1),
  // qty 0 is valid — "listed on the checklist but not needed for this product"
  // (e.g. the default "Flange Supports × 0" row, as in the prototype).
  qty: z.number().int().nonnegative().default(1),
  notes: z.string().nullish(),
});

/**
 * A product is built from library parts. Price, hours and the single-piece
 * flag are DERIVED from the linked parts server-side, so they're not inputs:
 * a product with one part at qty 1 is a single slide; anything else is an
 * assembly whose labour is the sum of its children.
 */
export const catalogueInputSchema = z.object({
  productCode: z.string().min(1),
  name: z.string().min(1),
  code: z.string().nullish(),
  drawing: z.string().nullish(),
  gelCureMins: z.number().int().nonnegative().nullish(),
  lamCureMins: z.number().int().nonnegative().nullish(),
  specUrl: z.string().nullish(),
  parts: z.array(catalogueProductPartSchema).default([]),
  hardware: z.array(catalogueHardwareInputSchema).default([]),
});
export type CatalogueInput = z.infer<typeof catalogueInputSchema>;

// ─── Status change / workflow ──────────────────────────────────────────────
export const statusChangeSchema = z.object({
  status: ticketStatusSchema,
  note: z.string().nullish(),
  /** Manager-PIN-authorised override of the family-ready gate (→ Despatched). */
  managerOverride: z.boolean().default(false),
});

export const assignOperativesSchema = z.object({
  operativeIds: z.array(z.number().int()),
});

/** Bulk despatch from the Ready to Despatch screen. */
export const despatchTicketsSchema = z.object({
  ticketIds: z.array(z.number().int()).min(1),
  /** Manager-PIN-authorised override of the COMP family-ready gate. */
  managerOverride: z.boolean().default(false),
  /** User confirmed the partial-despatch warning. */
  confirmPartial: z.boolean().default(false),
});
export type DespatchInput = z.infer<typeof despatchTicketsSchema>;
