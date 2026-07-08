import type { FastifyPluginAsync } from 'fastify';
import {
  LIVE_STATUSES,
  PLANNER_WEEKS,
  STAGE_HRS_REMAINING,
  formatWc,
  nextWeeks,
  opWeekTotal,
  wcKey,
  weekCapacityFor,
  type GrpStage,
  type OperativeHoursLike,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';

/** Weekly capacity vs committed (remaining) labour hours. Capacity honours
 * each operative's day pattern + per-week overrides, and the current week is
 * prorated (days already passed contribute nothing). */
export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const operatives = unwrap(
      await db.from('operatives').select('defaultHrs, dayPattern, dayHrs').is('deletedAt', null),
    ) as OperativeHoursLike[];
    // Standard (un-prorated, no-override) week for the summary metric.
    const weeklyCapacity = operatives.reduce((sum, op) => sum + opWeekTotal(op, ''), 0);

    const tickets = unwrap(
      await db.from('tickets').select('hrs, status, wc')
        .is('deletedAt', null).in('status', [...LIVE_STATUSES]).not('wc', 'is', null),
    ) as { hrs: number; status: string; wc: string | null }[];

    // committed (remaining) hours per week key
    const committed = new Map<string, { hrs: number; count: number }>();
    for (const t of tickets) {
      const key = wcKey(t.wc);
      if (!key) continue;
      const frac = STAGE_HRS_REMAINING[t.status as GrpStage] ?? 1;
      const cur = committed.get(key) ?? { hrs: 0, count: 0 };
      cur.hrs += (t.hrs || 0) * frac;
      cur.count += 1;
      committed.set(key, cur);
    }

    // weeks to show: the 16-week planner horizon + any committed weeks
    const labels = new Map<string, string>();
    for (const wc of nextWeeks(PLANNER_WEEKS)) labels.set(wcKey(wc), wc);
    for (const key of committed.keys()) {
      if (!labels.has(key)) labels.set(key, formatWc(new Date(key)));
    }

    const weeks = [...labels.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, wc]) => {
        const c = committed.get(key) ?? { hrs: 0, count: 0 };
        const committedHrs = Math.round(c.hrs * 10) / 10;
        const capacityHrs = Math.round(weekCapacityFor(operatives, key) * 10) / 10;
        return {
          key,
          wc,
          capacityHrs,
          committedHrs,
          ticketCount: c.count,
          utilisation: capacityHrs > 0 ? Math.round((committedHrs / capacityHrs) * 100) : 0,
        };
      });

    return { weeklyCapacity, operativeCount: operatives.length, weeks };
  });
};
