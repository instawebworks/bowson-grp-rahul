import type { FastifyPluginAsync } from 'fastify';
import {
  HRS_PER_DAY,
  LIVE_STATUSES,
  STAGE_HRS_REMAINING,
  formatWc,
  nextWeeks,
  wcKey,
  type GrpStage,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';

const WORKING_DAYS = 5;

/** Weekly capacity vs committed (remaining) labour hours. */
export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const operatives = unwrap(
      await db.from('operatives').select('defaultHrs').is('deletedAt', null),
    ) as { defaultHrs: number | null }[];
    const weeklyCapacity = operatives.reduce(
      (sum, op) => sum + WORKING_DAYS * (op.defaultHrs ?? HRS_PER_DAY),
      0,
    );

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

    // weeks to show: next 8 + any committed weeks
    const labels = new Map<string, string>();
    for (const wc of nextWeeks(8)) labels.set(wcKey(wc), wc);
    for (const key of committed.keys()) {
      if (!labels.has(key)) labels.set(key, formatWc(new Date(key)));
    }

    const weeks = [...labels.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, wc]) => {
        const c = committed.get(key) ?? { hrs: 0, count: 0 };
        const committedHrs = Math.round(c.hrs * 10) / 10;
        return {
          key,
          wc,
          capacityHrs: weeklyCapacity,
          committedHrs,
          ticketCount: c.count,
          utilisation: weeklyCapacity > 0 ? Math.round((committedHrs / weeklyCapacity) * 100) : 0,
        };
      });

    return { weeklyCapacity, operativeCount: operatives.length, weeks };
  });
};
