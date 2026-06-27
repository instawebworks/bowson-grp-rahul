import type { FastifyPluginAsync } from 'fastify';
import { LIVE_STATUSES } from '@bowson/shared';
import { db } from '../supabase.js';

/** Run a head-only count query and return the number. */
async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: c, error } = await build();
  if (error) throw error;
  return c ?? 0;
}

const base = () => db.from('orders').select('*', { count: 'exact', head: true }).is('deletedAt', null);
const tBase = () => db.from('tickets').select('*', { count: 'exact', head: true }).is('deletedAt', null);
const mBase = () => db.from('moulds').select('*', { count: 'exact', head: true }).is('deletedAt', null);

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const now = new Date().toISOString();
    const live = [...LIVE_STATUSES];

    const [
      totalOrders,
      pending,
      inProgress,
      readyToDespatch,
      despatched,
      overdue,
      totalMoulds,
      maintenanceMoulds,
      preProduction,
      liveTickets,
    ] = await Promise.all([
      count(base),
      count(() => base().eq('status', 'Pending')),
      count(() => base().eq('status', 'In Progress')),
      count(() => base().eq('status', 'Ready to Despatch')),
      count(() => base().eq('status', 'Despatched')),
      count(() => base().lt('deadline', now).not('status', 'in', '("Despatched","Completed","Cancelled")')),
      count(mBase),
      count(() => mBase().eq('status', 'Maintenance')),
      count(() => tBase().in('status', ['1. Spec Required', '2. Materials Required'])),
      count(() => tBase().in('status', live)),
    ]);

    // Moulds in use = distinct moulds referenced by a live ticket.
    const { data: inUseRows, error } = await db
      .from('tickets')
      .select('mouldId')
      .is('deletedAt', null)
      .not('mouldId', 'is', null)
      .in('status', live);
    if (error) throw error;
    const mouldsInUse = new Set((inUseRows ?? []).map((r) => (r as { mouldId: number }).mouldId)).size;

    const availableMoulds = Math.max(0, totalMoulds - maintenanceMoulds - mouldsInUse);
    const utilisation = totalMoulds > 0 ? Math.round((mouldsInUse / totalMoulds) * 100) : 0;

    return {
      orders: { total: totalOrders, pending, inProgress, readyToDespatch, despatched, overdue },
      moulds: {
        total: totalMoulds,
        inUse: mouldsInUse,
        available: availableMoulds,
        maintenance: maintenanceMoulds,
        utilisation,
      },
      tickets: { live: liveTickets, preProduction },
    };
  });
};
