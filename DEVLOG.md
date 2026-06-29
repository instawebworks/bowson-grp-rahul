# Bowson GRP — Development Log

A running, day-by-day record of work on the Bowson GRP rebuild. Every working
session adds an entry; every feature added or modified is recorded here so the
project history stays traceable and professional.

---

## How we work

**This log is the source of truth for "what was done when."** It is updated at
the end of every session (and whenever a feature is added or changed).

Two special commands drive the workflow:

- **"Continue from last"** — Read the most recent entry in this log, pick up the
  *Next up* items from where the last session finished, and carry on. No need to
  re-explain context; the log holds it.
- **"Wrap up"** — Finish the current piece of work cleanly, update this log with
  what was done today (and any feature added/modified), then create a git commit
  and push it to GitHub.

### Entry format

Each day uses the template:

```
## YYYY-MM-DD — <short title>
**Done**
- ...
**Features added / modified**
- ...
**Decisions**
- ...
**Next up**
- ...
```

---

## 2026-06-27 — Project kickoff & Phase 1 scaffold

**Done**
- Reviewed the original prototype `t-card.html` (single-file vanilla-JS app,
  ~9,400 lines, localStorage) and produced a full feature/data-model inventory.
- Agreed the tech stack (see Decisions) and architecture.
- Scaffolded the pnpm monorepo: `packages/shared`, `packages/api`, `packages/web`.
- `packages/shared`: ported domain constants 1:1 from the prototype
  (GRP stages, RAW stages, order statuses, `STAGE_HRS_REMAINING`, `AUTO_PCT`,
  `HRS_PER_DAY = 7.5`, `STAGE_SKILLS`, 10 colour palettes) + Zod schemas/DTOs.
- `packages/api`: Fastify server skeleton (health route, CORS, env validation,
  Prisma client, Supabase admin client, JWT auth skeleton) + full Prisma schema
  for all entities + seed script.
- `packages/web`: React + Vite + Tailwind v4 shell — sidebar nav (ported 1:1),
  routing for all views, TanStack Query, API + Supabase client helpers.
- Wrote `README.md`, `.env.example`, this `DEVLOG.md`, and the reviewable
  planning doc `docs/PROJECT_PLAN.md`.

**Features added / modified**
- N/A yet — this session is scaffolding only; no end-user features built.

**Decisions**
- **Platform:** Supabase (hosted) — Postgres + Auth (roles via RLS) + Realtime + Storage.
- **Backend:** thin Node + Fastify + TypeScript owns all writes & domain logic;
  Prisma ORM; Zod validation.
- **Frontend:** React + TS + Vite + Tailwind; TanStack Query, Zustand, dnd-kit.
- **Repo:** pnpm monorepo with a shared package for types/constants/schemas.
- **Scope:** exact parity with `t-card.html` first, then iterate.
- Domain statuses stored as plain strings (not Postgres enums) to match the
  prototype values exactly; validated at the API boundary via shared Zod enums.

### Phase 2 — Core CRUD + read views (same day, "Continue from last")

**Done**
- **API:** validation helper (`lib/validate.ts`) + REST routes for Customers,
  Operatives, Moulds (CRUD with soft-delete + ref-uniqueness), Catalogue
  (nested parts/hardware, transactional replace), Orders & Tickets
  (read + CRUD; ticket net-price + auto `pct` from `AUTO_PCT`), and a Dashboard
  KPI endpoint (orders/moulds/tickets metrics, overdue, utilisation).
  All routes registered under `/api/*`.
- **Web:** API hooks (TanStack Query), shared types, UI kit (PageHeader, Card,
  Table, StatusPill, Metric, ProgressBar, QueryState) with the prototype's
  status-colour palette, and live views wired up: Dashboard, All Orders,
  All Tickets, In Production / Ready / Despatched (status-filtered orders),
  Customers, Operatives, Moulds, Product Catalogue.
- Both packages typecheck; web production-build passes (144 modules).

**Features added / modified**
- Read/CRUD for all core entities (Customers, Operatives, Moulds, Catalogue,
  Orders, Tickets) and a Dashboard — backend + frontend, end to end.

**Notes / not done**
- Still no `.env` — code is written but not yet run against a live DB.
  Needs Supabase credentials to `db:push` + `db:seed` and verify at runtime.
- Create/edit forms (modals) for these entities are not built yet — current
  views are read-focused; the CRUD endpoints exist and are ready to wire.

### Change — dropped Prisma, switched to the Supabase client (same day)

**Why:** the Prisma setup required `DATABASE_URL` / `DIRECT_URL` connection
strings, which were confusing. User opted to remove Prisma. Backend architecture
unchanged — Fastify still owns writes + domain logic; only the data-access
library changed.

**Done**
- Removed Prisma (deps, `schema.prisma`, generated client, `db:*` scripts,
  `db.ts`). `.env` no longer needs connection strings — just `SUPABASE_URL` + keys.
- Added **`supabase/schema.sql`** (all tables, camelCase quoted columns, FKs,
  `updatedAt` triggers, RLS enabled with no policies) and **`supabase/seed.sql`**
  (operatives + 8 catalogue templates + demo customer/moulds/order) — both run
  by hand in the Supabase SQL Editor.
- New `supabase.ts` data client (service-role) + `unwrap()` helper; rewrote all
  7 route groups + health check to use `@supabase/supabase-js`.
- Frontend unchanged (API still returns the same camelCase shapes). API + web
  both typecheck clean.

**Features added / modified**
- Data layer swapped Prisma → Supabase client across the whole API; no change to
  API contracts or UI behaviour.

### Verified live against self-hosted Supabase (Coolify)

**Done**
- Added `pnpm --filter @bowson/api db:setup` (scripts/db-setup.ts, uses `pg` +
  `DATABASE_URL`) — connects directly to Postgres, runs schema.sql + seed.sql,
  and issues `NOTIFY pgrst, 'reload schema'` so PostgREST sees the new tables.
  (`DATABASE_URL` is used ONLY by this one-off script; the app still uses the
  Supabase client at runtime.)
- Ran it against the user's self-hosted instance: 12 tables created; seeded
  6 operatives, 8 catalogue, 1 demo order, 2 tickets, 3 moulds.
- Smoke-tested the live API: `/health` ok, dashboard/operatives/catalogue/orders
  all 200 with correct embedded relations; POST + soft-DELETE verified.
- Fixed `/health` (was a false-positive `ok` due to a HEAD request hiding the
  PostgREST error body) and made the `.env` path resolution Windows-safe.

### UI polish (same day, from live review)

**Features added / modified**
- **Company logo:** extracted the real Bowson GRP rainbow logo (embedded base64
  JPEG) from `t-card.html` → `packages/web/src/assets/bowson-logo.jpg`; replaced
  the placeholder diamond in the sidebar.
- **New Order button + create form:** added a reusable `Modal`/`Button`/`Field`
  UI kit, a `useCreateOrder` mutation, and an `OrderForm` (order number, customer,
  site, deadline, despatch, resin, notes). Wired a "+ New Order" button into the
  Orders header. (Adding tickets to an order is deferred to the workflow phase.)
- Made Vite read the shared root `.env` (`envDir`). Web typechecks; create verified.
- **Customers create + edit:** `useCreateCustomer` / `useUpdateCustomer` mutations
  and a `CustomerForm` modal (handles both new + edit). Customers page now has a
  "+ New Customer" button and each row is clickable / has an Edit button that opens
  the prefilled form. Create + edit verified end-to-end against the live API.
- **New Order popup reworked to match the prototype** (screenshot-driven): title
  "New Order — Step 1 of 2 / Enter order details", sectioned layout (Order details
  / Notes / Colour theme image), "Customer reference" field, required despatch
  method, inline "+ New customer" button (opens CustomerForm, auto-selects the new
  customer), and a **Colour theme image upload** (file → base64 → `themeImage`,
  with preview + remove). Added `Modal` sub-title + `FormSection` to the UI kit.
  Verified create with despatch + theme image end-to-end.
- **Sidebar nav icons:** ported the 12 wireframe SVG icons 1:1 (`components/icons.tsx`,
  `NavIcon`); added an `icon` key to each nav item and rendered it in the sidebar
  (active = full opacity, inactive = 70%). Fixed nested-modal stacking so the
  "+ New customer" popup opens above the New Order popup.
- **Playwright UI audit:** added `packages/web/scripts/audit.mjs` (+ `pnpm --filter
  @bowson/web audit`) that screenshots all 12 screens and the order/customer modals
  and reports console + network errors. Ran it: **all screens render correctly,
  zero console/network errors, modals stack correctly, CRUD verified.** Tweak from
  the review: Dashboard "Overdue" metric is red only when count > 0. Screenshots
  gitignored.

## 2026-06-27 — Phase 3: Workflow engine + ticket adding (Step 2)

**Done**
- **Shared domain module** (`packages/shared/src/domain.ts`), ported 1:1: stage
  state machine (`stageIndex`/`nextStage`/`pctForStatus`), COMP roll-up
  (`compRollupStatus` → "Awaiting Parts (x/y)" / "7. Assembly"), `compPct`,
  `orderValue`, `orderProgress`, `deriveOrderStatus` (never auto-resets to Pending).
- **API recompute service** (`services/recompute.ts`): `syncComp` + `recomputeOrder`,
  wired into ticket create / patch / delete / status-change.
- **`POST /api/tickets/:id/status`** — sets status + auto pct, stamps `completed`
  on Despatched, writes an **audit_log** row, rolls up the COMP, recomputes order.
- **`POST /api/orders/:id/tickets`** — instantiates a catalogue template
  (≤1 part → MADE; multi-part → COMP + one PART per piece, colour/resin spec,
  mould links, tn when not Pending) or adds a manual RAW/MADE ticket.
- **Frontend:** Order detail page `/orders/:id` (meta cards, COMP→PART indented
  tickets, per-ticket status dropdown, colour-theme image), clickable order rows,
  and an **Add ticket** modal (Step 2) with "From catalogue" / "Manual item" tabs.

**Features added / modified**
- Full ticket lifecycle: add tickets to an order (catalogue or manual), change
  stage per ticket, automatic COMP roll-up + order value/status + audit trail.

**Verified**
- Live DB: catalogue → COMP + 5 PARTs (£5,200); part→QC ⇒ "Awaiting Parts (1/5)";
  all parts→QC ⇒ "7. Assembly" (pct 85); order status auto-derives.
- Playwright audit clean incl. new order-detail + add-ticket screens; all packages
  typecheck.

**Next up**
- **Phase 4 — Kanban T-Card board** (by-stage / by-operative, drag-drop, time
  tracking, gel-coat cure timers, Supabase Realtime sync).
- Mould assignment + auto-advance (stage 3 → Gel Coat); capacity/schedule math.
- Add/edit forms for Operatives & Moulds; order edit (deadline/scheduling).

## 2026-06-27 — Phase 4: T-Card Kanban board (core)

**Done**
- **API:** `POST /api/tickets/:id/assign` (replace operatives), `…/time/start`
  and `…/time/stop` (per-operative sessions); added `time_sessions` to the ticket
  SELECT. **Fix:** soft-deleting an order now soft-deletes its tickets (no orphans
  on the board); added `scripts/cleanup-orphans.ts` and cleared 6 pre-existing orphans.
- **Frontend board** (`pages/Board.tsx`) with dnd-kit:
  - **By stage** — 10 columns (Spec → Ready), drag a card to a column ⇒ status change.
  - **By operative** — Unassigned + one column per operative; drag a card ⇒ assign
    (or unassign); per-card **▶/⏸ timer** with live elapsed (1 s tick).
  - Cards show order #, type, detail, progress, assignee initials.
  - **Live updates via polling** (5 s `refetchInterval`).

**Features added / modified**
- Shop-floor T-Card board: visual stage management (drag-drop), operative
  assignment, and per-operative time tracking.

**Verified**
- API: assign (→ Harry Cook), start/stop timer (1 session opened then closed).
- Playwright: by-stage + by-operative views render correctly (1 live ticket),
  zero console/network errors; all packages typecheck.

**Deferred within Phase 4 (next)**
- Gel-coat **cure timers**, **mould assignment + auto-advance** (stage 3 → Gel Coat),
  **capacity/schedule** math.
- **True Supabase Realtime** (currently polling) — needs RLS read policies + the
  realtime publication, which land with auth in Phase 6.
- Right-click context menu for multi-operative assignment (currently single-assign
  via drag; multi-assign still available through the API).

## 2026-06-27 — Phase 4 cont.: mould assignment + gel-coat cure timers

**Done**
- **API:** `POST /api/tickets/:id/mould` (assign/unassign; if the mould is free —
  not in maintenance and in-mould slots < qty — and the ticket is at "3. Queue -
  Awaiting Mould", **auto-advances to "4. Gel Coat"** with an audit entry + order
  recompute). `POST /api/tickets/:id/cure` (start timer: target stage + minutes) and
  `POST /api/tickets/:id/cure/clear` (confirm cure → advances to the target stage,
  audit + recompute). `isMouldFree` ported from the prototype.
- **Frontend:** Order detail tickets now have a **Mould / Cure** column — a mould
  `<select>` for items in mould stages (auto-advance on assign) and a cure control
  (preset 30m/1h/2h/4h; live countdown; "confirm" when done). Board cards show a
  live **cure badge** (⏱ remaining / ✓ done).
- Added `cureState` + `fmtCureMins` helpers; new hooks `useAssignMould`,
  `useSetCure`, `useConfirmCure`.

**Verified**
- API: queue→assign mould ⇒ auto-advanced to "4. Gel Coat"; set cure (60m → target
  Laminating) ⇒ confirm ⇒ advanced to "5. Laminating", timer cleared.
- Playwright audit clean (order detail shows Mould/Cure column); all packages typecheck.

**Next up**
- **Phase 5** — Schedule view + capacity math (HRS_PER_DAY = 7.5, per-stage skills),
  Mould planner tabs, CSV import/export, global search, audit-log UI.
- Add/edit forms for Operatives & Moulds; order edit (deadline/scheduling).
- **Phase 6** — auth/roles (RLS) → then switch the board from polling to true Realtime.

## 2026-06-27 — Phase 5 (part 1): admin CRUD, global search, activity log

**Done**
- **API:** `GET /api/search?q=` (orders by number/site, tickets by tn/detail, ilike,
  sanitised) and `GET /api/audit` (recent audit-log entries, optional entity filter);
  registered both.
- **Operatives add/edit** — `OperativeForm` (skills as toggle chips from
  `STAGE_SKILLS`, default hrs/day) + `useCreateOperative`/`useUpdateOperative`;
  Operatives page now has "+ New Operative" and row/Edit.
- **Moulds add/edit** — `MouldForm` (ref, name, capacity, status, notes) +
  `useCreateMould`/`useUpdateMould`; Moulds page has "+ New Mould" and row/Edit.
- **Global search** — search box in the sidebar → `/search?q=` results page (orders +
  tickets, click-through to the order).
- **Activity Log** page (`/audit`, new Admin nav item) — status changes rendered as
  coloured from→to pills with notes (incl. "Auto-advanced — mould was free",
  "Cure confirmed").

**Features added / modified**
- Completed admin CRUD parity (customers ✓ already; now operatives + moulds).
- New visibility features: global search + activity/audit log.

**Verified**
- API: search 'DEMO' → 1 order; search 'Twin' → 1 ticket; audit → 10 entries;
  operative + mould create/edit/delete. Playwright audit clean (search + activity
  pages render); all packages typecheck.

**Next up (Phase 5 part 2)**
- Schedule view + capacity math (HRS_PER_DAY = 7.5, per-stage skills/availability).
- Mould planner tabs (board / schedule / unassigned / register).
- CSV import/export; order edit (deadline/scheduling).

## 2026-06-27 — Phase 5 (part 2): Schedule + capacity, order edit

**Done**
- **Shared** `schedule.ts` (pure): `mondayOf`, `formatWc`, `wcForDeadline`
  (Monday 2 weeks before deadline, ported), `wcKey` (normalise wc → Monday ISO),
  `nextWeeks`.
- **API** `GET /api/schedule`: weekly capacity = Σ operatives × 5 × (defaultHrs ?? 7.5);
  committed = Σ remaining labour hours (ticket hrs × `STAGE_HRS_REMAINING[status]`)
  grouped by target week; returns next-8-weeks + any committed weeks with utilisation.
  Order **PATCH now propagates `wc`** down to the order's tickets.
- **Order edit** — `EditOrderForm` (status, customer, ref, despatch, resin, **deadline
  → auto-calculated target week**, notes); "Edit order" button on the order detail.
- **Schedule page** — capacity summary + per-week table (tickets, committed vs
  capacity, utilisation bar, overload ⚠).

**Verified**
- API: capacity 225 h (6 ops × 5 × 7.5); PATCH wc propagated to ticket; that week's
  committed = 10 h / 4 % util. Playwright audit clean (schedule + edit-order modal);
  all packages typecheck.

**Next up (Phase 5 part 3 / final)**
- Mould planner tabs (occupancy board / unassigned queue / register).
- CSV import/export.
- Then **Phase 6** — auth/roles (RLS) + switch board to true Realtime.

## 2026-06-27 — Phase 5 (part 3, final): mould planner + CSV

**Done**
- **CSV utility** (`lib/csv.ts`): `downloadCsv` (quoted, safe) + `parseCsv`
  (quote-aware), no deps.
- **CSV export** buttons on **All Orders** and **All Tickets**; export + import
  on the Moulds **Register**.
- **Mould planner tabs** on the Moulds page:
  - **Register** — table (add/edit) + CSV import/export.
  - **Board** — occupancy cards per mould (Free / Partial / Full / Maintenance,
    n/qty in use, in-mould + queued tickets).
  - **Unassigned** — tickets at "3. Queue - Awaiting Mould" with no mould; assign
    via dropdown (auto-advances to Gel Coat if the mould is free).

**Features added / modified**
- Mould planning/visibility + CSV data in/out — **Phase 5 complete**.

**Verified**
- Playwright audit clean (Board tab shows 3 mould cards Free 0/qty; Unassigned tab
  renders); all packages typecheck.

**Next up — Phase 6 (final phase)**
- Supabase Auth + roles (admin / manager / operative) via RLS policies.
- Switch the T-Card board from polling to **true Supabase Realtime**.
- Then deployment (frontend + API hosting, CI).

## 2026-06-27 — Phase 6 (part 1): authentication (env-gated)

**Done**
- **Backend:** `AUTH_REQUIRED` env flag + a global `onRequest` hook that verifies
  the Supabase JWT on `/api/*` (skips `/health` + CORS pre-flight). Off by default
  so nothing breaks until auth is configured.
- **Frontend:** `AuthProvider` (Supabase session + `onAuthStateChange`), branded
  **Login** page, and an App `Gate` — when `VITE_REQUIRE_AUTH=true` it shows login
  until signed in (and a clear message if Supabase isn't configured). The API
  client already attaches the bearer token. Sidebar shows the signed-in email +
  **Sign out**.
- **`supabase/rls.sql`** — authenticated SELECT policies on all tables (writes stay
  service-role/backend only) + adds the live tables to the `supabase_realtime`
  publication (for Phase 6 part 2).
- Documented enablement in README + `.env.example` (`AUTH_REQUIRED`,
  `VITE_REQUIRE_AUTH`).

**Verified**
- Auth **off** (default): `/health` ok, `GET /api/orders` → 200 with no token;
  Playwright audit clean — app unchanged.
- Auth **on** (temp `VITE_REQUIRE_AUTH=true`): app shows the branded login wall,
  zero page errors. All packages typecheck.

**Next up — Phase 6 (part 2, final)**
- Switch the T-Card board from polling to **true Supabase Realtime** (subscribe to
  `tickets`/`time_sessions` changes; keep polling as a fallback).
- Role-based gating (admin / manager / operative) on sensitive writes.
- Deployment (host frontend + API; managed/self-hosted Supabase already live).

## 2026-06-27 — Phase 6 (part 2): Realtime + role gating

**Done**
- **Realtime:** `useBoardRealtime` subscribes to Supabase `postgres_changes` on
  `tickets`, `time_sessions`, `ticket_assignments` and invalidates the board query
  — near-instant multi-screen updates. Board polling dropped to a 15 s fallback.
  No-op if Supabase isn't configured (needs the auth-on RLS read policies from
  `supabase/rls.sql` to receive events).
- **Backend role gating:** `resolveRole` (JWT app_metadata → `users` table →
  `DEFAULT_ROLE`, default admin) + a `preHandler` that requires **manager/admin**
  for mutations *outside* the shop-floor ticket workflow. Shop-floor actions
  (`/tickets/:id/status|assign|mould|cure|time`) stay open to operatives. Only
  active when `AUTH_REQUIRED=true`.
- **Frontend:** `useAuth` now exposes `role` + `canManage` (true when auth is off
  or role is admin/manager). Gated the "+ New Order/Customer/Operative/Mould" and
  the order detail "Edit order" / "+ Add ticket" buttons.

**Verified**
- Auth off (default): `GET /api/orders` → 200; Playwright audit clean — app and
  board unchanged (manage buttons visible since canManage=true). All packages typecheck.

**Phase 6 status:** auth, Realtime, and role gating complete. **Remaining: deployment**
(host the web app + API; Supabase is already live self-hosted).
