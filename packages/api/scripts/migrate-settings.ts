/**
 * Migration: create a key/value `settings` table for app settings
 * (stage completion weightings, manager PIN), then reload the PostgREST cache.
 * Run: pnpm --filter @bowson/api tsx scripts/migrate-settings.ts
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

const SQL = `
create table if not exists "settings" (
  "key" text primary key,
  "value" jsonb not null,
  "updatedAt" timestamptz not null default now()
);
alter table "settings" enable row level security;
select pg_notify('pgrst', 'reload schema');
`;

async function connect(): Promise<pg.Client> {
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

const client = await connect();
try {
  await client.query(SQL);
  console.log('✅ settings table created + PostgREST reloaded');
} finally {
  await client.end();
}
process.exit(0);
