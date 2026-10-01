/**
 * Parts-library migration (client email 1 Oct 2026, "GRP Product Catalogue
 * Part Selection"): flip the catalogue so parts are created ONCE in a library
 * and products are built from them with a quantity (1 = whole mould, 0.5 =
 * half). Hours and prices then roll up from the children.
 *
 * Safe to re-run: the DDL is idempotent and the data stage is skipped once
 * any product links exist. Everything runs in ONE SQL script so it can go
 * through the Kong /pg/query fallback like every earlier migration.
 *
 *  1. catalogue_parts: catalogueId becomes nullable (deprecated), add
 *     createdAt / deletedAt; new table catalogue_product_parts(catalogueId,
 *     partId, qty, sort).
 *  2. For every LIVE product, de-duplicate its part rows by (code, detail):
 *     the lowest-id occurrence becomes the library part, later copies are
 *     soft-deleted, and every original row becomes one link at qty 1 (a part
 *     used twice in a product gets two links - same as before).
 *  3. A live product with no part rows but assembly hours (the old
 *     "single-piece" form) gets ONE library part named after it carrying those
 *     hours, so no labour is lost.
 *  4. Part rows belonging to soft-deleted products are soft-deleted too.
 *
 * Product prices are NOT recomputed here (library parts start at 0); a
 * product's price becomes the sum of its parts the next time it is saved.
 *
 * Run: pnpm --filter @bowson/api tsx scripts/migrate-parts-library.ts
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const SQL = `
alter table "catalogue_parts" alter column "catalogueId" drop not null;
alter table "catalogue_parts" add column if not exists "lamHrs" double precision;
alter table "catalogue_parts" add column if not exists "finHrs" double precision;
alter table "catalogue_parts" add column if not exists "createdAt" timestamptz not null default now();
alter table "catalogue_parts" add column if not exists "deletedAt" timestamptz;

create table if not exists "catalogue_product_parts" (
  "id"          bigint generated always as identity primary key,
  "catalogueId" bigint not null references "catalogue"("id") on delete cascade,
  "partId"      bigint not null references "catalogue_parts"("id") on delete restrict,
  "qty"         double precision not null default 1 check ("qty" in (0.5, 1)),
  "sort"        integer not null default 0
);
create index if not exists "catalogue_product_parts_catalogueId_idx" on "catalogue_product_parts" ("catalogueId");
create index if not exists "catalogue_product_parts_partId_idx" on "catalogue_product_parts" ("partId");
alter table "catalogue_product_parts" enable row level security;

update "catalogue_parts" set "lamHrs" = "hrs", "finHrs" = 0 where "lamHrs" is null and "finHrs" is null;

do $$
declare
  r record;
  pid bigint;
begin
  if (select count(*) from "catalogue_product_parts") > 0 then
    raise notice 'catalogue_product_parts already populated - data stage skipped';
    return;
  end if;

  -- Live products' part rows with their de-dup key (code + normalised detail)
  -- and their position within the product.
  create temp table cp on commit drop as
    select p."id", p."catalogueId",
           upper(trim(coalesce(p."drawing", ''))) || '|' ||
             upper(regexp_replace(trim(p."detail"), '\\s+', ' ', 'g')) as key,
           (row_number() over (partition by p."catalogueId" order by p."id")) - 1 as sort
    from "catalogue_parts" p
    join "catalogue" c on c."id" = p."catalogueId"
    where c."deletedAt" is null;

  -- One library part per key: the lowest id wins.
  create temp table canon on commit drop as
    select key, min("id") as "id" from cp group by key;

  insert into "catalogue_product_parts" ("catalogueId", "partId", "qty", "sort")
    select cp."catalogueId", canon."id", 1, cp.sort
    from cp join canon using (key)
    order by cp."catalogueId", cp.sort;

  -- Later copies retire; the canonical rows detach from their old product.
  update "catalogue_parts" set "deletedAt" = now(), "catalogueId" = null
    where "id" in (select cp."id" from cp join canon using (key) where cp."id" <> canon."id");
  update "catalogue_parts" set "catalogueId" = null
    where "id" in (select "id" from canon);

  -- Old single-piece form: hours lived on the product itself. Make it a part.
  for r in
    select c.* from "catalogue" c
    where c."deletedAt" is null and c."assemblyHrs" > 0
      and not exists (select 1 from cp where cp."catalogueId" = c."id")
  loop
    insert into "catalogue_parts" ("detail", "drawing", "hrs", "lamHrs", "finHrs", "price")
      values (r."name", coalesce(r."code", r."productCode"), r."assemblyHrs", r."assemblyHrs", 0, 0)
      returning "id" into pid;
    insert into "catalogue_product_parts" ("catalogueId", "partId", "qty", "sort") values (r."id", pid, 1, 0);
    raise notice 'created library part for % from its assembly hours (%h)', r."productCode", r."assemblyHrs";
  end loop;

  -- Single-piece now derives from the link count.
  update "catalogue" c set "singlePiece" =
    ((select count(*) from "catalogue_product_parts" l where l."catalogueId" = c."id") <= 1)
    where c."deletedAt" is null;

  -- Parts that belonged to soft-deleted products are unreachable - retire them.
  update "catalogue_parts" p set "deletedAt" = coalesce(p."deletedAt", now()), "catalogueId" = null
    from "catalogue" c where p."catalogueId" = c."id" and c."deletedAt" is not null;

  raise notice 'parts library: % live parts, % product links',
    (select count(*) from "catalogue_parts" where "deletedAt" is null),
    (select count(*) from "catalogue_product_parts");
end $$;

select pg_notify('pgrst', 'reload schema');
`;

async function connect(): Promise<pg.Client> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set in .env');
  let lastErr: unknown;
  for (const ssl of [{ rejectUnauthorized: false }, undefined] as const) {
    const client = new pg.Client({ connectionString: DATABASE_URL, ssl });
    // A dropped socket must not crash the process before the fallback runs.
    client.on('error', () => {});
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

process.on('uncaughtException', (err) => {
  console.error('unexpected error:', err.message);
  process.exit(1);
});

try {
  const client = await connect();
  try {
    await client.query(SQL);
  } finally {
    await client.end().catch(() => {});
  }
  console.log('parts-library migration applied + PostgREST reloaded (direct pg)');
} catch (err) {
  console.warn(`direct pg connection failed (${(err as Error).message}) - trying Kong /pg/query...`);
  await runViaMeta();
  console.log('parts-library migration applied + PostgREST reloaded (via /pg/query)');
}
process.exit(0);
