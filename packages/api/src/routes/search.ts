import type { FastifyPluginAsync } from 'fastify';
import { db, unwrap } from '../supabase.js';

/** Global search: orders by number/site, tickets by ticket-number/detail. */
export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const raw = ((req.query as { q?: string }).q ?? '').trim();
    // Strip characters that would break a PostgREST or() filter.
    const q = raw.replace(/[(),*]/g, '');
    if (!q) return { orders: [], tickets: [] };
    const like = `%${q}%`;
    const numeric = /^\d+$/.test(q);

    const orders = unwrap(
      await db.from('orders').select('id, orderNumber, siteName, status')
        .is('deletedAt', null)
        .or(`orderNumber.ilike.${like},siteName.ilike.${like}`)
        .order('createdAt', { ascending: false })
        .limit(20),
    );

    let tq = db.from('tickets')
      .select('id, tn, detail, status, orderId, order:orders(orderNumber)')
      .is('deletedAt', null);
    tq = numeric ? tq.or(`detail.ilike.${like},tn.eq.${Number(q)}`) : tq.ilike('detail', like);
    const tickets = unwrap(await tq.order('id', { ascending: false }).limit(20));

    return { orders, tickets };
  });
};
