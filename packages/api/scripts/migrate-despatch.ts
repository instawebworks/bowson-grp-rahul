/**
 * Migration: despatch-pipeline fields on tickets
 * (despatch date stamp, partial-despatch flag, manager-override flag),
 * then reload the PostgREST cache.
 * Run: pnpm --filter @bowson/api tsx scripts/migrate-despatch.ts
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const SQL = `
alter table "tickets" add column if not exists "despatchDate"    date;
alter table "tickets" add column if not exists "partialDespatch" boolean not null default false;
alter table "tickets" add column if not exists "managerOverride" boolean not null default false;
select pg_notify('pgrst', 'reload schema');
`;

async function connect(): Promise<pg.Client> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set in .env');
  let lastErr: unknown;
  // Try SSL (accept self-signed) first, then plain — falling through on ANY error.
  for (const ssl of [{ rejectUnauthorized: false }, undefined] as const) {
    const client = new pg.Client({ connectionString: DATABASE_URL, ssl });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
    }
  }
  throw lastErr ?? new Error('Could not connect');
}

/** Fallback when the direct Postgres port is firewalled (Coolify): run the SQL
 * through the Supabase meta service exposed by Kong at /pg/query. */
async function runViaMeta(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / service key not set in .env');
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL }),
  });
  if (!res.ok) throw new Error(`meta query failed (${res.status}): ${await res.text()}`);
}

try {
  const client = await connect();
  try {
    await client.query(SQL);
  } finally {
    await client.end();
  }
  console.log('✅ tickets despatch columns added + PostgREST reloaded (direct pg)');
} catch (err) {
  console.warn(`direct pg connection failed (${(err as Error).message}) — trying Kong /pg/query…`);
  await runViaMeta();
  console.log('✅ tickets despatch columns added + PostgREST reloaded (via /pg/query)');
}
process.exit(0);
