/**
 * Migration: add product-template fields to the catalogue table, then reload the
 * PostgREST schema cache. Run with: pnpm --filter @bowson/api tsx scripts/migrate-catalogue.ts
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
alter table "catalogue"
  add column if not exists "singlePiece" boolean not null default false,
  add column if not exists "assemblyHrs" double precision not null default 0,
  add column if not exists "gelCureMins" integer,
  add column if not exists "lamCureMins" integer,
  add column if not exists "specUrl" text;
select pg_notify('pgrst', 'reload schema');
`;

const needsSsl = /sslmode=require/.test(DATABASE_URL);

async function connect(): Promise<pg.Client> {
  for (const ssl of needsSsl ? [{ rejectUnauthorized: false }, undefined] : [undefined, { rejectUnauthorized: false }]) {
    const client = new pg.Client({ connectionString: DATABASE_URL, ssl });
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (!/SSL|secure|self[- ]signed/i.test((err as Error).message)) throw err;
    }
  }
  throw new Error('Could not connect');
}

const client = await connect();
try {
  await client.query(SQL);
  console.log('✅ catalogue columns added + PostgREST reloaded');
} finally {
  await client.end();
}
process.exit(0);
