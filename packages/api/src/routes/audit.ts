import type { FastifyPluginAsync } from 'fastify';
import { db, unwrap } from '../supabase.js';

/** Recent audit-log entries (optionally filtered by entity). */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    let q = db.from('audit_log').select('*').order('at', { ascending: false }).limit(100);
    if (entityType) q = q.eq('entityType', entityType);
    if (entityId) q = q.eq('entityId', Number(entityId));
    return unwrap(await q);
  });
};
