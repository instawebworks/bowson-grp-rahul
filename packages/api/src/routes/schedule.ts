import type { FastifyPluginAsync } from 'fastify';
import {
  LIVE_STATUSES,
  PLANNER_WEEKS,
  allocateWeeks,
  formatWc,
  nextWeeks,
  opWeekTotal,
  wcKey,
  type AllocOperativeLike,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';

/** Weekly capacity vs committed (remaining) labour hours, using the shared
 * capacity-constrained allocation — the same model as the Planner, so the
 * dashboard's 8-week grid shows the same weeks/hours the Planner does. */
export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const operatives = unwrap(
      await db.from('operatives').select('skills, defaultHrs, dayPattern, dayHrs').is('deletedAt', null),
    ) as AllocOperativeLike[];
    // Standard (un-prorated, no-override) week for the summary metric.
    const weeklyCapacity = operatives.reduce((sum, op) => sum + opWeekTotal(op, ''), 0);

    const rows = unwrap(
      await db.from('tickets').select('id, tn, type, status, hrs, lamHrs, finHrs, wc, order:orders(deadline)')
        .is('deletedAt', null).in('status', [...LIVE_STATUSES]),
    ) as unknown as {
      id: number; tn: number | null; type: string; status: string; hrs: number;
      lamHrs: number | null; finHrs: number | null; wc: string | null;
      order: { deadline: string | null } | null;
    }[];
    const tickets = rows.map((t) => ({ ...t, deadline: t.order?.deadline ?? null }));
    const alloc = allocateWeeks(tickets, operatives);

    // weeks to show: the 16-week planner horizon + any allocated weeks
    const labels = new Map<string, string>();
    for (const wc of nextWeeks(PLANNER_WEEKS)) labels.set(wcKey(wc), wc);
    for (const key of alloc.byWeek.keys()) {
      if (!labels.has(key)) labels.set(key, formatWc(new Date(key)));
    }

    const weeks = [...labels.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, wc]) => {
        const b = alloc.byWeek.get(key);
        const committedHrs = Math.round((b?.total ?? 0) * 10) / 10;
        const capacityHrs = alloc.capacityFor(key).total;
        return {
          key,
          wc,
          capacityHrs,
          committedHrs,
          ticketCount: b?.tickets.length ?? 0,
          lateCount: b?.late.size ?? 0,
          utilisation: capacityHrs > 0 ? Math.round((committedHrs / capacityHrs) * 100) : 0,
        };
      });

    return { weeklyCapacity, operativeCount: operatives.length, weeks };
  });
};
