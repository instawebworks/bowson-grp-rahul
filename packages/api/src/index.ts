import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { corsOrigins, env } from './env.js';
import { db } from './supabase.js';
import { authenticate, resolveRole } from './auth.js';
import { customerRoutes } from './routes/customers.js';
import { operativeRoutes } from './routes/operatives.js';
import { mouldRoutes } from './routes/moulds.js';
import { catalogueRoutes } from './routes/catalogue.js';
import { orderRoutes } from './routes/orders.js';
import { ticketRoutes } from './routes/tickets.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { searchRoutes } from './routes/search.js';
import { auditRoutes } from './routes/audit.js';
import { scheduleRoutes } from './routes/schedule.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: corsOrigins, credentials: true });

  // Auth gate (only active when AUTH_REQUIRED=true). Protects /api/* routes;
  // /health and CORS pre-flight stay open.
  app.addHook('onRequest', async (req, reply) => {
    if (!env.AUTH_REQUIRED) return;
    if (req.method === 'OPTIONS' || !req.url.startsWith('/api')) return;
    await authenticate(req, reply);
  });

  // Role gate: mutations outside the shop-floor ticket workflow need manager/admin.
  // Shop-floor actions (status/assign/mould/cure/time) stay open to all operatives.
  const SHOP_FLOOR = /^\/api\/tickets\/\d+\/(status|assign|mould|cure|time)\b/;
  app.addHook('preHandler', async (req, reply) => {
    if (!env.AUTH_REQUIRED) return;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return;
    if (SHOP_FLOOR.test(req.url)) return;
    const role = await resolveRole(req);
    if (role !== 'admin' && role !== 'manager') {
      return reply.forbidden('This action requires a manager or admin role');
    }
  });

  app.get('/health', async () => {
    let dbStatus = 'unknown';
    let dbMessage: string | undefined;
    try {
      const { error } = await db.from('operatives').select('id').limit(1);
      if (error) {
        dbStatus = 'error';
        dbMessage = error.message;
      } else {
        dbStatus = 'ok';
      }
    } catch (e) {
      dbStatus = 'error';
      dbMessage = (e as Error).message;
    }
    return { status: 'ok', db: dbStatus, dbMessage, env: env.NODE_ENV };
  });

  // Feature routes
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(customerRoutes, { prefix: '/api/customers' });
  await app.register(operativeRoutes, { prefix: '/api/operatives' });
  await app.register(mouldRoutes, { prefix: '/api/moulds' });
  await app.register(catalogueRoutes, { prefix: '/api/catalogue' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(ticketRoutes, { prefix: '/api/tickets' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(scheduleRoutes, { prefix: '/api/schedule' });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
