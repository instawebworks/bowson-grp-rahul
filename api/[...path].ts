// Vercel Serverless Function: mounts the Fastify app to handle every /api/* route.
// The app is built once per warm instance and reused across invocations.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer } from '../packages/api/src/index.js';

type App = Awaited<ReturnType<typeof buildServer>>;
let ready: Promise<App> | null = null;

function getApp(): Promise<App> {
  if (!ready) {
    ready = (async () => {
      const app = await buildServer();
      await app.ready();
      return app;
    })();
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
