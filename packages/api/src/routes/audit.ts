import type { FastifyPluginAsync } from 'fastify';
import { db, unwrap } from '../supabase.js';

/** Recent audit-log entries. Filter by entity, or by order (order + its tickets). */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { entityType, entityId, orderId } = req.query as {
      entityType?: string;
      entityId?: string;
      orderId?: string;
    };

    // Order view: the order's own entries + all of its tickets' entries.
    if (orderId) {
      const oid = Number(orderId);
      const ticketRows = unwrap(
        await db.from('tickets').select('id').eq('orderId', oid),
      ) as { id: number }[];
      const ticketIds = ticketRows.map((r) => r.id);
      const ticketClause = ticketIds.length
        ? `,and(entityType.eq.ticket,entityId.in.(${ticketIds.join(',')}))`
        : '';
      return unwrap(
        await db.from('audit_log').select('*')
          .or(`and(entityType.eq.order,entityId.eq.${oid})${ticketClause}`)
          .order('at', { ascending: false }).limit(100),
      );
    }

    let q = db.from('audit_log').select('*').order('at', { ascending: false }).limit(100);
    if (entityType) q = q.eq('entityType', entityType);
    if (entityId) q = q.eq('entityId', Number(entityId));
    return unwrap(await q);
  });
};
