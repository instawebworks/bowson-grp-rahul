// Scheduling / production-week helpers. The target production week is the
// Monday two weeks before an order's deadline (ported from t-card.html).
// Weeks are displayed as "W/C DD/MM/YYYY" and grouped by their Monday ISO date.

/** Snap a date back to that week's Monday (00:00, local). */
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/** ISO date "YYYY-MM-DD" (local). */
export function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Display label for a Monday date: "W/C DD/MM/YYYY". */
export function formatWc(monday: Date): string {
  const dd = String(monday.getDate()).padStart(2, '0');
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  return `W/C ${dd}/${mm}/${monday.getFullYear()}`;
}

/** Target production week (string) for a deadline ISO date, or null. */
export function wcForDeadline(deadlineIso: string | null | undefined): string | null {
  if (!deadlineIso) return null;
  const d = new Date(deadlineIso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 14);
  return formatWc(mondayOf(d));
}

/** Normalise any wc string to its Monday ISO date for grouping/compare ('' if unknown). */
export function wcKey(wc: string | null | undefined): string {
  if (!wc) return '';
  const s = wc.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoDate(mondayOf(new Date(s)));
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // W/C DD/MM/YYYY
  if (m) return isoDate(mondayOf(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))));
  return '';
}

/** The next `n` production weeks (this week first) as "W/C …" strings. */
export function nextWeeks(n: number, from: Date = new Date()): string[] {
  const start = mondayOf(from);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    out.push(formatWc(d));
  }
  return out;
}
