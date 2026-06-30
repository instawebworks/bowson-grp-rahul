// Vercel Serverless Function: mounts the Fastify app for every /api/* route.
//
// Vercel's filename-based catch-all (`[...path]`) only matched one path segment
// here, so vercel.json rewrites all `/api/*` requests to this function and passes
// the original sub-path in the `__path` query param. We rebuild req.url from it so
// Fastify (which registers routes under /api/...) matches correctly at any depth.
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
  // Reconstruct the original path: /api/index?__path=customers/6 -> /api/customers/6
  const url = new URL(req.url ?? '/', 'http://internal');
  const sub = url.searchParams.get('__path');
  if (sub !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `/api/${sub}${qs ? `?${qs}` : ''}`;
  }
  const app = await getApp();
  app.server.emit('request', req, res);
}
