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
  qty: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative().default(0),
  mouldId: z.number().int().nullish(),
  resinType: resinTypeSchema.nullish(),
  qcRef: z.string().nullish(),
});
export type TicketInput = z.infer<typeof ticketInputSchema>;
export const ticketUpdateSchema = ticketInputSchema.partial().omit({ orderId: true });

// ─── Catalogue ─────────────────────────────────────────────────────────────
export const cataloguePartInputSchema = z.object({
  detail: z.string().min(1),
  spec: z.string().nullish(),
  hrs: z.number().nonnegative().default(0),
  price: z.number().nonnegative().default(0),
  drawing: z.string().nullish(),
  mouldId: z.number().int().nullish(),
});

export const catalogueHardwareInputSchema = z.object({
  name: z.string().min(1),
  qty: z.number().int().positive().default(1),
  notes: z.string().nullish(),
});

export const catalogueInputSchema = z.object({
  productCode: z.string().min(1),
  name: z.string().min(1),
  code: z.string().nullish(),
  drawing: z.string().nullish(),
  unitPrice: z.number().nonnegative().default(0),
  singlePiece: z.boolean().default(false),
  assemblyHrs: z.number().nonnegative().default(0),
  gelCureMins: z.number().int().nonnegative().nullish(),
  lamCureMins: z.number().int().nonnegative().nullish(),
  specUrl: z.string().nullish(),
  parts: z.array(cataloguePartInputSchema).default([]),
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
