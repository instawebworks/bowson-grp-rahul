import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { corsOrigins, env } from './env.js';
import { db } from './supabase.js';
import { customerRoutes } from './routes/customers.js';
import { operativeRoutes } from './routes/operatives.js';
import { mouldRoutes } from './routes/moulds.js';
import { catalogueRoutes } from './routes/catalogue.js';
import { orderRoutes } from './routes/orders.js';
import { ticketRoutes } from './routes/tickets.js';
import { dashboardRoutes } from './routes/dashboard.js';

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
