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

/** Planner horizon (ported from PLANNER_WEEKS). */
export const PLANNER_WEEKS = 16;

import { LAM_SKILLS, LIVE_STATUSES, STAGE_SKILLS } from './constants.js';
import { remainingSplit } from './domain.js';

// ─── Per-week operative day hours (ported from getOpDayHrs / weekCapacity) ──
const DAY_HRS_DEFAULT = 7.5; // HRS_PER_DAY (kept local to avoid an import cycle)

export interface OperativeHoursLike {
  defaultHrs?: number | null;
  dayPattern?: number[] | null;
  /** Per-week overrides keyed "<mondayIso>_d<dayIdx>" (0=Mon … 6=Sun). */
  dayHrs?: Record<string, number> | null;
}

/** An operative's default hours for a weekday (no override applied). */
export function opDayDefault(op: OperativeHoursLike, dayIdx: number): number {
  if (dayIdx >= 5) return 0; // weekends default off
  const pat = op.dayPattern ?? [];
  return pat[dayIdx] ?? op.defaultHrs ?? DAY_HRS_DEFAULT;
}

/** Operative hours for a specific day of a specific week (Monday-ISO key). */
export function getOpDayHrs(op: OperativeHoursLike, weekKey: string, dayIdx: number): number {
  const val = (op.dayHrs ?? {})[`${weekKey}_d${dayIdx}`];
  return val !== undefined ? val : opDayDefault(op, dayIdx);
}

/** An operative's Mon–Fri total for a week. */
export function opWeekTotal(op: OperativeHoursLike, weekKey: string): number {
  let t = 0;
  for (let d = 0; d < 5; d++) t += getOpDayHrs(op, weekKey, d);
  return t;
}

/** Today's day index in our Mon-first convention (0=Mon … 6=Sun). */
export function todayDayIdx(today: Date = new Date()): number {
  const js = today.getDay(); // 0=Sun
  return js === 0 ? 6 : js - 1;
}

/**
 * Total available hours across operatives for a week. The current week is
 * prorated — days already passed contribute nothing (ported from weekCapacity).
 */
export function weekCapacityFor(
  ops: OperativeHoursLike[],
  weekKey: string,
  today: Date = new Date(),
): number {
  const curKey = isoDate(mondayOf(today));
  const isCurrent = weekKey === curKey;
  const startDay = isCurrent ? todayDayIdx(today) : 0;
  return ops.reduce((sum, op) => {
    let total = 0;
    for (let d = 0; d < 7; d++) {
      if (isCurrent && d < startDay) continue;
      total += getOpDayHrs(op, weekKey, d);
    }
    return sum + total;
  }, 0);
}

// ─── Capacity-constrained week allocation (phase 2 + client email 20 Aug) ──
// THE single scheduling model, shared by the Planner, /api/schedule (which
// feeds the dashboard's 8-week grid) and the dashboard metrics — so every
// screen agrees on which week a ticket's work lands in.

export interface AllocTicketLike {
  id: number;
  tn?: number | null;
  type: string;
  status: string;
  hrs?: number | null;
  lamHrs?: number | null;
  finHrs?: number | null;
  wc?: string | null;
  /** Order deadline (ISO), used for allocation order and the late flag. */
  deadline?: string | null;
}

export interface AllocOperativeLike extends OperativeHoursLike {
  skills?: string[] | null;
}

export interface WeekCapacity {
  lam: number;
  fin: number;
  total: number;
}

export interface WeekAllocation<T> {
  key: string;
  tickets: T[];
  /** Hours placed in this week, per bucket and in total. */
  lam: number;
  fin: number;
  total: number;
  capacity: WeekCapacity;
  /** Ids of tickets placed after their deadline week. */
  late: Set<number>;
}

const HIDDEN_DEFAULT = ['Despatched', 'Completed', 'Order Cancelled', 'Cancelled'];

/**
 * An operative's week hours split between the two labour pools by skill —
 * informational only: allocation is constrained by the TOTAL, because the
 * factory cross-trains and a person can be moved between processes within
 * a week. Both skill sets = 50/50, laminating-only = all Laminating,
 * finishing-only or unskilled = all Finishing.
 */
export function poolCapacity(ops: AllocOperativeLike[], weekKey: string, today: Date = new Date()): WeekCapacity {
  let lam = 0;
  let fin = 0;
  for (const op of ops) {
    const hrs = weekCapacityFor([op], weekKey, today);
    const skills = op.skills ?? [];
    const hasLam = skills.some((s) => LAM_SKILLS.includes(s));
    const hasFin = skills.some((s) => !LAM_SKILLS.includes(s) && (STAGE_SKILLS as readonly string[]).includes(s));
    if (hasLam && hasFin) { lam += hrs / 2; fin += hrs / 2; }
    else if (hasLam) lam += hrs;
    else fin += hrs;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { lam: r1(lam), fin: r1(fin), total: r1(lam + fin) };
}

/**
 * Place every non-hidden ticket, whole, into a week: soonest deadline first
 * (then ticket number), starting from its stored wc or the current week —
 * never a past week — into the first week whose remaining TOTAL capacity
 * covers its outstanding hours. A week can therefore never hold more work
 * than it has hours for; overflow spills forward. A ticket that alone
 * exceeds a whole week takes the first untouched week rather than never
 * landing. Tickets placed after their deadline week are flagged late — the
 * manager fixes that by adding hours or moving the deadline.
 */
export function allocateWeeks<T extends AllocTicketLike>(
  tickets: T[],
  ops: AllocOperativeLike[],
  opts: { today?: Date; maxWeeks?: number; hidden?: readonly string[] } = {},
): { byWeek: Map<string, WeekAllocation<T>>; weekSeq: string[]; capacityFor: (key: string) => WeekCapacity } {
  const today = opts.today ?? new Date();
  const maxWeeks = opts.maxWeeks ?? 52;
  const hidden = opts.hidden ?? HIDDEN_DEFAULT;
  const curKey = isoDate(mondayOf(today));

  const weekSeq: string[] = [];
  const caps: WeekCapacity[] = [];
  const remaining: number[] = [];
  for (let i = 0; i < maxWeeks; i++) {
    const d = new Date(curKey);
    d.setDate(d.getDate() + i * 7);
    const key = isoDate(d);
    weekSeq.push(key);
    const cap = poolCapacity(ops, key, today);
    caps.push(cap);
    remaining.push(cap.total);
  }
  const capacityFor = (key: string): WeekCapacity => {
    const i = weekSeq.indexOf(key);
    return i === -1 ? poolCapacity(ops, key, today) : caps[i]!;
  };
  const startIdxOf = (t: AllocTicketLike) => {
    const k = wcKey(t.wc) || curKey;
    const key = k < curKey ? curKey : k;
    const i = weekSeq.indexOf(key);
    return i === -1 ? weekSeq.length - 1 : i;
  };

  const sorted = tickets
    .filter((t) => !hidden.includes(t.status))
    .slice()
    .sort((a, b) => {
      const da = a.deadline ?? '9999';
      const db = b.deadline ?? '9999';
      if (da !== db) return da < db ? -1 : 1;
      return (a.tn ?? Infinity) - (b.tn ?? Infinity);
    });

  const byWeek = new Map<string, WeekAllocation<T>>();
  const bucketFor = (i: number) => {
    const key = weekSeq[i]!;
    let b = byWeek.get(key);
    if (!b) {
      b = { key, tickets: [], lam: 0, fin: 0, total: 0, capacity: caps[i]!, late: new Set() };
      byWeek.set(key, b);
    }
    return b;
  };

  for (const t of sorted) {
    const live = (LIVE_STATUSES as readonly string[]).includes(t.status);
    const split = live ? remainingSplit(t) : { lam: 0, fin: 0 };
    const need = split.lam + split.fin;
    const start = startIdxOf(t);

    let placed = weekSeq.length - 1;
    for (let i = start; i < weekSeq.length; i++) {
      const cap = caps[i]!.total;
      const rem = remaining[i]!;
      const fits = need === 0 || rem >= need;
      const oversizedFresh = need > cap && cap > 0 && rem >= cap; // takes an untouched week
      if (fits || oversizedFresh) { placed = i; break; }
    }
    remaining[placed] = Math.max(0, remaining[placed]! - need);
    const b = bucketFor(placed);
    b.tickets.push(t);
    b.lam += split.lam;
    b.fin += split.fin;
    b.total += need;
    if (t.deadline && need > 0) {
      const friday = new Date(weekSeq[placed]!);
      friday.setDate(friday.getDate() + 4);
      if (isoDate(friday) > t.deadline.slice(0, 10)) b.late.add(t.id);
    }
  }
  return { byWeek, weekSeq, capacityFor };
}
