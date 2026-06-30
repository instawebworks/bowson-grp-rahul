import type { FastifyPluginAsync } from 'fastify';
import {
  HRS_PER_DAY,
  LIVE_STATUSES,
  STAGE_HRS_REMAINING,
  STAGE_SKILLS,
  formatWc,
  nextWeeks,
  orderProgress,
  wcKey,
  type GrpStage,
  type TicketLike,
} from '@bowson/shared';
import { db, unwrap } from '../supabase.js';

const WORKING_DAYS = 5;
const live: string[] = [...LIVE_STATUSES];
const isLive = (s: string) => live.includes(s) || s.startsWith('Awaiting Parts');

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const now = new Date();
    const nowIso = now.toISOString();

    const [ordersR, recentR, ticketsR, opsR, mouldsR] = await Promise.all([
      db.from('orders').select('id, status, deadline').is('deletedAt', null),
      db.from('orders')
        .select('id, orderNumber, status, deadline, customer:customers(name), tickets:tickets(id,type,status,pct,netPrice,compParentId)')
        .is('deletedAt', null).is('tickets.deletedAt', null)
        .order('id', { ascending: false }).limit(8),
      db.from('tickets').select('type, status, hrs, compParentId, wc').is('deletedAt', null),
      db.from('operatives').select('skills, defaultHrs').is('deletedAt', null),
      db.from('moulds').select('id, status').is('deletedAt', null),
    ]);

    const orders = unwrap(ordersR) as { id: number; status: string; deadline: string | null }[];
    const tickets = unwrap(ticketsR) as {
      type: string; status: string; hrs: number; compParentId: number | null; wc: string | null;
    }[];
    const operatives = unwrap(opsR) as { skills: string[]; defaultHrs: number | null }[];
    const moulds = unwrap(mouldsR) as { id: number; status: string }[];

    // ── Order metrics ──
    const TERMINAL = ['Despatched', 'Completed', 'Cancelled', 'Pending', 'Draft'];
    const active = orders.filter((o) => !TERMINAL.includes(o.status)).length;
    const pending = orders.filter((o) => o.status === 'Pending').length;
    const overdue = orders.filter(
      (o) => o.deadline && o.deadline < nowIso && !['Despatched', 'Completed', 'Cancelled'].includes(o.status),
    ).length;

    // ── Ticket production metrics ──
    const slidesInProduction = tickets.filter(
      (t) => (t.type === 'MADE' || t.type === 'COMP') && t.compParentId == null && isLive(t.status),
    ).length;
    const partsInProduction = tickets.filter((t) => t.type === 'PART' && live.includes(t.status)).length;

    const manHours = tickets
      .filter((t) => t.type !== 'RAW' && isLive(t.status))
      .reduce((s, t) => s + (t.hrs || 0) * (STAGE_HRS_REMAINING[t.status as GrpStage] ?? 1), 0);

    // Hours remaining by stage (MADE/PART live work)
    const hoursByStageMap = new Map<string, number>();
    for (const t of tickets) {
      if (t.type === 'RAW' || t.type === 'COMP') continue;
      if (!live.includes(t.status)) continue;
      hoursByStageMap.set(t.status, (hoursByStageMap.get(t.status) ?? 0) + (t.hrs || 0));
    }
    const hoursByStage = live
      .filter((s) => hoursByStageMap.has(s))
      .map((s) => ({ stage: s, hrs: Math.round((hoursByStageMap.get(s) ?? 0) * 10) / 10 }));

    // ── Moulds ──
    const totalMoulds = moulds.length;
    const maintenance = moulds.filter((m) => m.status === 'Maintenance').length;
    const inUseRows = unwrap(
      await db.from('tickets').select('mouldId').is('deletedAt', null)
        .not('mouldId', 'is', null).in('status', ['4. Gel Coat', '5. Laminating']),
    ) as unknown as { mouldId: number }[];
    const mouldsInUse = new Set(inUseRows.map((r) => r.mouldId)).size;
    const mouldUtil = totalMoulds ? Math.round((mouldsInUse / totalMoulds) * 100) : 0;

    // ── Capacity (8 weeks) ──
    const weeklyCapacity = operatives.reduce((s, op) => s + WORKING_DAYS * (op.defaultHrs ?? HRS_PER_DAY), 0);
    const weekKeys = new Set(nextWeeks(8).map((w) => wcKey(w)));
    let committed8 = 0;
    for (const t of tickets) {
      if (t.type === 'RAW' || !live.includes(t.status) || !t.wc) continue;
      if (!weekKeys.has(wcKey(t.wc))) continue;
      committed8 += (t.hrs || 0) * (STAGE_HRS_REMAINING[t.status as GrpStage] ?? 1);
    }
    const totalCapacity8 = weeklyCapacity * 8;
    const utilisation8 = totalCapacity8 ? Math.round((committed8 / totalCapacity8) * 100) : 0;
    const leadTimeWeeks = weeklyCapacity > 0 ? Math.round((manHours / weeklyCapacity) * 10) / 10 : null;

    // ── Recent orders ──
    const recentOrders = (unwrap(recentR) as unknown as {
      id: number; orderNumber: string; status: string; deadline: string | null;
      customer: { name: string } | null; tickets: TicketLike[];
    }[]).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      deadline: o.deadline,
      customer: o.customer?.name ?? null,
      items: (o.tickets ?? []).filter((t) => t.compParentId == null).length,
      progress: orderProgress(o.tickets ?? []),
    }));

    // ── Stage capacity (this week / next week) ──
    const weekday = now.getDay() >= 1 && now.getDay() <= 5;
    const stageRow = () =>
      STAGE_SKILLS.map((stage) => {
        const trained = operatives.filter((op) => (op.skills ?? []).includes(stage)).length;
        const available = weekday ? trained : 0;
        return { stage, trained, available };
      });
    const stageCapacity = { thisWeek: stageRow(), nextWeek: stageRow() };

    return {
      orders: { active, pending, overdue },
      tickets: { slidesInProduction, partsInProduction, manHours: Math.round(manHours * 100) / 100 },
      moulds: { total: totalMoulds, inUse: mouldsInUse, maintenance, utilisation: mouldUtil },
      capacity: {
        weeklyCapacity,
        committed8: Math.round(committed8 * 10) / 10,
        totalCapacity8,
        utilisation8,
        leadTimeWeeks,
      },
      recentOrders,
      hoursByStage,
      stageCapacity,
      thisWeek: nextWeeks(1)[0],
      nextWeek: formatWc(new Date(wcKey(nextWeeks(2)[1]!))),
    };
  });
};
