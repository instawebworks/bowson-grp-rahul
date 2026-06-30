// Standalone server entry — used for local dev and the Docker/Coolify deploy.
// (On Vercel the app is mounted as a serverless function; see /api/[...path].ts.)
import { env } from './env.js';
import { buildServer } from './index.js';

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
