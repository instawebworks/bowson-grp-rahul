import { STAGE_COLOR } from './stageColors';

/** Status → inline colour styles. The nine production stages take the shared
 * red → green progression (client snag #16); the rest keep the prototype's
 * sCls palette. */
const STAGE_PILLS: Record<string, { bg: string; color: string }> = Object.fromEntries(
  Object.entries(STAGE_COLOR).map(([status, c]) => [status, { bg: `${c}1f`, color: c }]),
);
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ...STAGE_PILLS,
  Despatched: { bg: '#1558a0', color: '#fff' },
  Ordered: { bg: '#fef0d3', color: '#a86e0a' },
  Received: { bg: '#eaf5e0', color: '#2e6810' },
  'Order Cancelled': { bg: '#fdeaea', color: '#922020' },
  Pending: { bg: '#f7f5f2', color: '#5c574f' },
  'In Progress': { bg: '#dff2eb', color: '#0c6b50' },
  'Ready to Despatch': { bg: '#eaf5e0', color: '#2e6810' },
  Completed: { bg: '#e8f1fb', color: '#1558a0' },
  Cancelled: { bg: '#fdeaea', color: '#922020' },
};

export function statusStyle(status: string): { backgroundColor: string; color: string } {
  const c = STATUS_COLORS[status] ?? { bg: '#f7f5f2', color: '#5c574f' };
  return { backgroundColor: c.bg, color: c.color };
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => GBP.format(n ?? 0);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format an elapsed millisecond duration as "h:mm" or "m:ss". */
export function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Cure-timer state for a ticket given the current time, or null if no active timer. */
export function cureState(
  t: { cureStart: string | null; cureMins: number | null; cureCleared: boolean },
  now: number,
): { remainingMin: number; expired: boolean } | null {
  if (!t.cureStart || t.cureMins == null || t.cureCleared) return null;
  const elapsedMin = Math.floor((now - new Date(t.cureStart).getTime()) / 60000);
  const remainingMin = t.cureMins - elapsedMin;
  return { remainingMin: Math.max(0, remainingMin), expired: remainingMin <= 0 };
}

export function fmtCureMins(m: number): string {
  if (m <= 0) return '0m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm ? `${mm}m` : ''}`;
}

/** Initials from a name, e.g. "Mark Staniland" → "MS". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Days until a deadline (negative = overdue). null if no deadline. */
export function daysToDeadline(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
