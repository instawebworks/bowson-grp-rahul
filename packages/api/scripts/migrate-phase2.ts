/**
 * Phase 2 migration — ADDITIVE ONLY (safe to run while main is deployed):
 *  - catalogue_parts.lamHrs / finHrs  (labour split, client point 8)
 *  - tickets.lamHrs / finHrs / finishTypeId (snapshots + theming, point 9)
 *  - finish_types table + seed (THEME WORKINGS defaults — client to confirm)
 * Backfill: lamHrs = hrs, finHrs = 0 where unset (split unknown until the
 * client re-imports the catalogue with split hours).
 *
 * The DESTRUCTIVE stage-merge rewrite lives in migrate-phase2-cutover.ts and
 * must only run at merge/deploy time.
 *
 * Run: pnpm --filter @bowson/api tsx scripts/migrate-phase2.ts
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const SQL = `
alter table "catalogue_parts" add column if not exists "lamHrs" double precision;
alter table "catalogue_parts" add column if not exists "finHrs" double precision;
alter table "tickets" add column if not exists "lamHrs" double precision;
alter table "tickets" add column if not exists "finHrs" double precision;

create table if not exists "finish_types" (
  "id" serial primary key,
  "name" text not null unique,
  "lamMult" double precision not null default 1,
  "finMult" double precision not null default 1,
  "sort" integer not null default 0
);
alter table "tickets" add column if not exists "finishTypeId" integer references "finish_types"("id");

insert into "finish_types" ("name", "lamMult", "finMult", "sort") values
  ('PLAIN', 1.0, 1.0, 1),
  ('THEMED', 2.5, 1.2, 2),
  ('PLAIN WITH LEDS', 1.5, 1.1, 3),
  ('THEMED WITH LEDS', 3.0, 1.4, 4),
  ('ASSEMBLY ONLY', 0, 1.0, 5)
on conflict ("name") do nothing;

-- Backfill: existing part hours are totals; park them in the Laminating
-- bucket so sums stay right until the client re-imports the split.
update "catalogue_parts" set "lamHrs" = "hrs", "finHrs" = 0 where "lamHrs" is null;

select pg_notify('pgrst', 'reload schema');
`;

async function connect(): Promise<pg.Client> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set in .env');
  let lastErr: unknown;
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
  console.log('✅ phase-2 additive schema applied + PostgREST reloaded (direct pg)');
} catch (err) {
  console.warn(`direct pg connection failed (${(err as Error).message}) — trying Kong /pg/query…`);
  await runViaMeta();
  console.log('✅ phase-2 additive schema applied + PostgREST reloaded (via /pg/query)');
}
process.exit(0);
