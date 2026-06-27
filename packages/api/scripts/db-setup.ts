/**
 * Direct-to-Postgres setup: creates all tables (schema.sql) and loads the
 * seed data (seed.sql) using DATABASE_URL, then asks PostgREST to reload its
 * schema cache so the Supabase REST API immediately sees the new tables.
 *
 * Run with:  pnpm --filter @bowson/api db:setup
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

const schemaSql = readFileSync(fileURLToPath(new URL('../../../supabase/schema.sql', import.meta.url)), 'utf8');
const seedSql = readFileSync(fileURLToPath(new URL('../../../supabase/seed.sql', import.meta.url)), 'utf8');

const needsSsl = /sslmode=require/.test(DATABASE_URL);

async function connect(): Promise<pg.Client> {
  // Try the SSL mode implied by the URL first, then fall back to the opposite.
  for (const ssl of needsSsl ? [{ rejectUnauthorized: false }, undefined] : [undefined, { rejectUnauthorized: false }]) {
    const client = new pg.Client({ connectionString: DATABASE_URL, ssl });
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      const msg = (err as Error).message;
      if (!/SSL|secure|self[- ]signed/i.test(msg)) throw err;
    }
  }
  throw new Error('Could not connect (SSL negotiation failed both ways)');
}

async function main() {
  console.log('🔌 Connecting to Postgres…');
  const client = await connect();
  try {
    const who = await client.query('select current_database() as db, current_user as usr, version() as v');
    console.log(`✅ Connected — db="${who.rows[0].db}" user="${who.rows[0].usr}"`);

    console.log('📐 Running schema.sql …');
    await client.query(schemaSql);
    console.log('   tables created.');

    console.log('🌱 Running seed.sql …');
    await client.query(seedSql);
    console.log('   seed loaded.');

    // Make PostgREST (the Supabase REST API) pick up the new tables.
    await client.query("NOTIFY pgrst, 'reload schema'");

    const tables = await client.query(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    console.log(`\n📋 public tables (${tables.rowCount}): ${tables.rows.map((r) => r.table_name).join(', ')}`);

    const counts = await client.query(
      'select (select count(*) from operatives) as operatives,' +
        ' (select count(*) from catalogue) as catalogue,' +
        ' (select count(*) from orders) as orders,' +
        ' (select count(*) from tickets) as tickets,' +
        ' (select count(*) from moulds) as moulds',
    );
    console.log('🔢 row counts:', counts.rows[0]);
    console.log('\n✅ Database setup complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
