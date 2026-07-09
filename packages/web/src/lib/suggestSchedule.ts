// Suggested-schedule maths — ported from the prototype's suggestScheduleHtml:
// walk the coming weeks filling spare capacity (per-week prorated capacity
// minus hours already committed by OTHER orders) until the order's hours are
// absorbed; deadline = end week + 1-week buffer (lands on the Friday).
import {
  HRS_PER_DAY,
  LIVE_STATUSES,
  isoDate,
  nextWeeks,
  wcKey,
  weekCapacityFor,
  type OperativeHoursLike,
} from '@bowson/shared';
import type { Ticket } from './types';

export interface SuggestedSchedule {
  startKey: string; // Monday ISO of the suggested start week
  deadline: string; // suggested deadline ISO date
  weeksNeeded: number;
  noCapacity: boolean;
}

export function computeSuggestedSchedule({
  ops,
  allTickets,
  totalHrs,
  weights,
  excludeOrderId,
}: {
  ops: OperativeHoursLike[];
  allTickets: Ticket[];
  totalHrs: number;
  weights: Record<string, number>;
  excludeOrderId?: number;
}): SuggestedSchedule {
  const committed = new Map<string, number>();
  for (const t of allTickets) {
    if (excludeOrderId != null && t.orderId === excludeOrderId) continue;
    if (!(LIVE_STATUSES as readonly string[]).includes(t.status)) continue;
    const key = wcKey(t.wc);
    if (!key) continue;
    committed.set(key, (committed.get(key) ?? 0) + (t.hrs || 0) * (weights[t.status] ?? 1));
  }
  let hrsRemaining = totalHrs;
  let startKey: string | null = null;
  let endKey: string | null = null;
  let weeksNeeded = 0;
  const weekKeys = nextWeeks(26).map((w) => wcKey(w));
  for (const key of weekKeys) {
    const cap = weekCapacityFor(ops, key);
    const spare = cap - (committed.get(key) ?? 0);
    if (cap > 0 && spare <= 0) continue; // week is full — skip
    if (!startKey) startKey = key;
    hrsRemaining -= cap > 0 ? Math.max(spare, 0) : HRS_PER_DAY * 5;
    weeksNeeded++;
    endKey = key;
    if (hrsRemaining <= 0) break;
  }
  startKey ??= weekKeys[0]!;
  endKey ??= startKey;
  const end = new Date(endKey);
  end.setDate(end.getDate() + 11); // +1 week buffer, land on the Friday
  const noCapacity = weekKeys.slice(0, 8).every((k) => weekCapacityFor(ops, k) === 0);
  return { startKey, deadline: isoDate(end), weeksNeeded, noCapacity };
}
