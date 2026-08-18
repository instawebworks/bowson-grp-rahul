/**
 * ⚠⚠⚠ PHASE 2 CUTOVER — DESTRUCTIVE. RUN ONLY AT MERGE/DEPLOY TIME. ⚠⚠⚠
 *
 * Run IMMEDIATELY AFTER the new-scope build is deployed (never before — the
 * old build's board cannot display the new stage names), at a quiet moment
 * with nobody dragging tickets.
 *
 *  1. Ticket statuses → the merged, renumbered 9-stage list
 *     (4 Gel Coat + 5 Laminating → "4. Gel Coat & Laminate"; 6→5 … 10→9).
 *  2. Ticket cureTargetStage values → same mapping.
 *  3. Status history (audit) from/to values → same mapping.
 *  4. Operative skills → merged list (gel + lam skills → the merged skill).
 *  5. Stage-completion weightings deleted from settings (replaced by the
 *     Laminating/Finishing bucket model).
 *
 * Idempotent: re-running is harmless (updates match nothing the second time).
 *
 * Run: pnpm --filter @bowson/api exec tsx scripts/migrate-phase2-cutover.ts
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

// old stage → new stage (single source of truth for the rewrite)
const STAGE_MAP: [string, string][] = [
  ['4. Gel Coat', '4. Gel Coat & Laminate'],
  ['5. Laminating', '4. Gel Coat & Laminate'],
  ['6. Trim & Finish', '5. Trim & Finish'],
  ['7. Assembly', '6. Assembly'],
  ['8. QC Check', '7. QC Check'],
  ['9. Packing', '8. Packing'],
  ['10. Ready to Despatch', '9. Ready to Despatch'],
];

const esc = (s: string) => s.replace(/'/g, "''");

const stageCases = (col: string) =>
  `${col} = CASE ${col} ${STAGE_MAP.map(([o, n]) => `WHEN '${esc(o)}' THEN '${esc(n)}'`).join(' ')} ELSE ${col} END`;

const inList = STAGE_MAP.map(([o]) => `'${esc(o)}'`).join(', ');

const SQL = `
-- 1. ticket statuses
update "tickets" set ${stageCases('"status"')} where "status" in (${inList});

-- 2. cure target stages
update "tickets" set ${stageCases('"cureTargetStage"')} where "cureTargetStage" in (${inList});

-- 3. status history (audit trail)
update "audit_log" set ${stageCases('"fromValue"')} where "fromValue" in (${inList});
update "audit_log" set ${stageCases('"toValue"')} where "toValue" in (${inList});

-- 4. operative skills (text[]): gel/lam → merged skill, others renumbered, deduped
update "operatives" set "skills" = (
  select coalesce(array_agg(distinct case s
    when '4. Gel Coat' then '4. Gel Coat & Laminate'
    when '5. Laminating' then '4. Gel Coat & Laminate'
    when '6. Trim & Finish' then '5. Trim & Finish'
    when '7. Assembly' then '6. Assembly'
    when '8. QC Check' then '7. QC Check'
    when '9. Packing' then '8. Packing'
    else s
  end), '{}')
  from unnest("skills") as s
)
where "skills" is not null;

-- 5. retire the stage-completion weightings
delete from "settings" where "key" = 'stageWeights';

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

if (process.argv[2] !== '--confirm') {
  console.error('⚠ DESTRUCTIVE stage-rewrite cutover. Deploy the new build FIRST, then re-run with --confirm.');
  process.exit(1);
}

try {
  const client = await connect();
  try {
    await client.query(SQL);
  } finally {
    await client.end();
  }
  console.log('✅ phase-2 cutover applied: stages rewritten, skills merged, weightings removed (direct pg)');
} catch (err) {
  console.warn(`direct pg connection failed (${(err as Error).message}) — trying Kong /pg/query…`);
  await runViaMeta();
  console.log('✅ phase-2 cutover applied: stages rewritten, skills merged, weightings removed (via /pg/query)');
}
process.exit(0);
