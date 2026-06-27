/** Status → inline colour styles, ported from the prototype's sCls palette. */
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  '1. Spec Required': { bg: '#eeedfd', color: '#4a42b0' },
  '2. Materials Required': { bg: '#fef0d3', color: '#a86e0a' },
  '3. Queue - Awaiting Mould': { bg: '#fff4e0', color: '#8a5200' },
  '4. Gel Coat': { bg: '#fff0d8', color: '#7a4800' },
  '5. Laminating': { bg: '#fde8d8', color: '#8b3800' },
  '6. Trim & Finish': { bg: '#f3e8fd', color: '#5b21b6' },
  '7. Assembly': { bg: '#dff2eb', color: '#0c6b50' },
  '8. QC Check': { bg: '#e8f1fb', color: '#1558a0' },
  '9. Packing': { bg: '#eaf5e0', color: '#2e6810' },
  '10. Ready to Despatch': { bg: '#e8f1fb', color: '#1558a0' },
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
