/**
 * One colour per production stage on a red → amber → green progression, so
 * the stage order reads at a glance and every screen (T-Card board columns,
 * status pills, mould badges) uses the same hue for the same stage
 * (client snag #16: "colours used for each stage could follow a consistent
 * pattern").
 */
export const STAGE_COLOR: Record<string, string> = {
  '1. Spec Required': '#b91c1c',
  '2. Materials Required': '#c2410c',
  '3. Queue - Awaiting Mould': '#d97706',
  '4. Gel Coat & Laminate': '#a16207',
  '5. Trim & Finish': '#6b7f12',
  '6. Assembly': '#4d7c0f',
  '7. QC Check': '#15803d',
  '8. Packing': '#0f766e',
  '9. Ready to Despatch': '#0c6b50',
  Despatched: '#1558a0',
};

const FALLBACK = '#5c574f';

/** Solid stage colour (text / borders / bars). */
export const stageColor = (status: string): string => STAGE_COLOR[status] ?? FALLBACK;

/** Light tint of the stage colour for pills and badges on light surfaces. */
export const stageTint = (status: string): string => `${stageColor(status)}1f`;
