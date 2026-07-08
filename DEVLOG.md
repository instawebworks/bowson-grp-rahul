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

## 2026-06-27 — Phase 6 (part 3): deployment artifacts

**Done**
- **API runs via `tsx` in prod** (monorepo-safe: consumes `@bowson/shared` from
  source, no bundling). `start` → `tsx src/index.ts`; moved `tsx` to dependencies;
  dropped the dead `node dist` build from the root build chain.
- **`Dockerfile.api`** — pnpm workspace install (`--filter @bowson/api...`) + run.
- **`Dockerfile.web`** — `vite build` with `VITE_*` build args → static files served
  by **nginx** (`packages/web/nginx.conf`, SPA fallback + asset caching).
- **`.dockerignore`**, **`docker-compose.yml`** (both services, reads root `.env`),
  and **`docs/DEPLOY.md`** — Coolify guide (two resources, env vars, build args,
  `/health` check) + compose option + auth-enable steps.

**Verified (Docker not installed locally)**
- Web production build succeeds (185 KB gzip). API prod `start` (tsx) boots on a
  spare port and `/health` returns `db: ok`. Lockfile up to date (frozen install
  will pass in Docker).

**Project status: feature-complete + deployable.** Remaining are enhancements, not
parity gaps:
- Catalogue management UI; CSV import for orders/tickets.
- Operative day-availability patterns; bulk/multi-assign actions.
- Automated test suite; theme images → Supabase Storage.

## 2026-06-27 — Dashboard parity + global top bar

**Done**
- **Global TopBar** (in the app layout): global search ("Ticket # or order / site…"),
  **Import CSV**, **+ Ticket**, **+ Order**, and a "✓ Saved" indicator. Buttons are
  role-gated (hidden for operatives). Moved search out of the sidebar into the top bar;
  made `PageHeader` non-sticky so it doesn't clash with the sticky top bar.
  - **+ Order** → OrderForm. **+ Ticket** → pick an order, then AddTicketModal.
  - **Import CSV** → bulk-create orders from CSV (orderNumber required; site/despatch/
    resin/notes optional).
- **Rich Dashboard** rebuilt to match the prototype:
  - 6 metric cards: Active Orders, Orders Pending, Slides in Production, Parts in
    Production, Moulds in Use, Total Man Hours.
  - Recent Orders table + Hours Remaining by Stage.
  - 8-Week Capacity Summary + Current Lead Time (Slides).
  - Production Capacity — Next 8 Weeks grid; Stage Capacity (this/next week, per skill).
- **Enriched `/api/dashboard`** to back all of the above (man-hours via
  `STAGE_HRS_REMAINING`, slides/parts-in-production, recent orders w/ progress,
  hours-by-stage, 8-week committed vs capacity + lead time, stage capacity by skill).

**Features added / modified**
- Global create/import actions everywhere (top bar) + a production-overview Dashboard
  matching the original prototype.

**Verified**
- Dashboard renders all sections correctly (screenshot matches prototype); Playwright
  audit clean; all packages typecheck. Note: Stage Capacity shows 0/0 until operatives
  have skills assigned (expected — same as prototype).

**Remaining (enhancements):** orders↔tickets full CSV import, catalogue management UI,
operative day-availability patterns, bulk/multi-assign, automated tests, theme images
→ Storage.

## 2026-06-27 — View parity pass (match prototype sections)

Matched the remaining views to the t-card.html prototype (after the Dashboard):
- **All Orders** — columns Order # (+overdue tag), Customer, Customer Ref, Items
  summary, **inline status dropdown** (Pending/In Progress), Progress, Deadline,
  Value, View; search + status filter + "show completed & despatched" + pagination (15/pg).
- **All Tickets** — columns T/Card # (PART rows indented "↳"), Type badge, Order,
  Customer, Customer Ref, Detail (+ M2 resin badge), Stage, Progress, Deadline, Hrs;
  search + stage filter + show-despatched; COMP→PART grouping.
- **In Production / Ready to Despatch** — now **ticket-level** views (In Production =
  all live GRP stages; Ready = "10. Ready to Despatch"). Despatched stays order-level.
- **Customers** — **card grid** (name, contact, region, N orders) → click to edit.
- **Product Catalogue** — **table** (Code, Product, SKU, Type, Parts, Hours, Sell
  Price) + click-through **detail modal** (parts + hardware).
- **Operatives** — **card grid** (avatar initials, hrs/day + standard week, skill
  chips, day-pattern row when set) → click to edit.

**Verified:** all packages typecheck; Playwright audit clean across every route;
screenshots match the prototype layout.

**Still simplified vs prototype (future):** Ready-to-Despatch blocked-assemblies
sub-tables, ticket-detail time-tracking/audit sections, operative day-pattern editor
& stage-weight settings, catalogue create/edit form, orders↔tickets CSV import.

## 2026-06-27 — Sign-in enabled (initial login page)

- Turned auth ON: `.env` now has `AUTH_REQUIRED=true` + `VITE_REQUIRE_AUTH=true`
  (SUPABASE_JWT_SECRET was already set), so the app opens on the **sign-in page**.
- **Login by username** — the Login page takes a username that maps to a Supabase
  email (`admin` → `admin@bowson.local`); `EMAIL_DOMAIN` configurable.
- **Seed user script** `pnpm --filter @bowson/api create-user` (service-role;
  `SEED_ADMIN_EMAIL/PASSWORD/ROLE` env overrides). Created the initial admin:
  **username `admin` / password `admin123`** with `app_metadata.role = admin`.

**Verified end-to-end:** unauthenticated `/api/orders` → 401; signing in as
admin/admin123 returns a token the API accepts (200); the browser flow lands on the
Dashboard with full access; sidebar shows the user + Sign out. No page errors.

**Note:** auth flags live in `.env` (gitignored) — on a fresh deploy set
`AUTH_REQUIRED`/`VITE_REQUIRE_AUTH` and run `create-user`. To add more users (and
roles manager/operative), run create-user with overrides or set `app_metadata.role`.

## 2026-06-27 — Vercel deploy (web + serverless API)

Made the app deployable to **Vercel as a single project** (frontend static + API
as a serverless function); Docker/Coolify path kept intact.

- **API refactor:** `src/index.ts` is now side-effect-free (exports `buildServer`
  only); new `src/server.ts` is the standalone listen entry (Docker/local `start`
  + `dev`). Added an open `/api/health` alias; health stays unauthenticated.
- **Vercel function** `api/[...path].ts` — builds the Fastify app once per warm
  instance and emits each `/api/*` request into it.
- **`vercel.json`** — installs the workspace, builds the web (`packages/web/dist`),
  routes `/api/*` to the function, SPA-rewrites everything else.
- **Same-origin API:** `api.ts` now defaults to a relative `/api` when
  `VITE_API_URL` is unset (Vercel), so no CORS; dev still uses `.env`’s localhost.
- **docs/DEPLOY.md** — added the Vercel "everything on Vercel" guide (env vars,
  empty `VITE_API_URL`, one-time db:setup/create-user, caveats).

**Verified locally:** all packages typecheck; web prod build OK; API boots via
`server.ts` (`/health` + open `/api/health` return db ok; `/api/*` still 401 without
a token). **Not validated on Vercel itself** (no Vercel CLI here) — the serverless
bundling of the Fastify app + workspace `@bowson/shared` should be confirmed on the
first Vercel deploy.

## 2026-06-30 — Vercel deploy fixes, bug review, test prefill

**Vercel deployment (now live & working):**
- Fixed serverless crash `ERR_MODULE_NOT_FOUND @bowson/shared/src/index.ts` —
  shared now exports compiled JS (`dist`, with a `development`→src condition);
  vercel.json builds shared during install. (commit 2ed505e)
- Fixed env crash — `SUPABASE_URL` had been pasted into Vercel **with quotes**
  (invalid url); removing the quotes let the function boot.
- Fixed nested-route 404 — the `[...path]` catch-all only matched one segment on
  Vercel (`/api/customers` ok, `/api/customers/6` → NOT_FOUND). Replaced with a
  single `api/index.ts` + `vercel.json` rewrite `/api/(.*) → /api/index?__path=$1`;
  the handler rebuilds req.url so Fastify matches any depth. Verified GET + PATCH
  on live. (commit abc3b05)

**Bug review (reported, not yet fixed):**
- COMP delete orphans its PART children (should cascade soft-delete).
- `resolveRole` DEFAULT_ROLE=admin → any logged-in user is admin (use operative).
- Auth accepts unverified tokens if `AUTH_REQUIRED=true` but JWT secret empty.
- Medium: catalogue PATCH non-atomic; tn race; api/index.ts caches failed boot.

**Testing:** Login page prefilled with admin/admin123 (marked "remove before
production") for A-to-Z manual testing on localhost.

**Note:** secrets (service_role, JWT) were shared in chat during debugging — rotate.

## 2026-06-30 — New Order Step 2 wizard (add tickets)

Ported the prototype's "New Order — Step 2 of 2". Creating an order now transitions
in-place to Step 2 instead of closing.

- **OrderForm** is a 2-step wizard: Step 1 creates the order, then shows Step 2.
- **OrderStep2** (`components/OrderStep2.tsx`): success banner; **catalogue search**
  (name/code/SKU typeahead → select); Colour/RAL/theme; Resin type; **per-slide image**
  upload; "Add tickets from catalogue"; "+ Add manual ticket"; **tickets-on-order list**
  (with remove); **Suggested Schedule** (total build hours, ~weeks at capacity,
  suggested target week + "Set target week").
- **API:** add-ticket now accepts an optional `themeImage` (per-slide reference photo).
- **Hooks:** `useAddTicket` gained `themeImage`; added `useDeleteTicket`.

**Verified:** Playwright ran the full flow (login → + Order → create → Step 2 → search
+ add from catalogue) with zero page errors; screenshot matched the prototype. Test
order cleaned up. All packages typecheck.

**Note:** the prototype's "+ New product" (create a catalogue template inline) is
omitted — catalogue create/edit UI still isn't built (a known pending item).

## 2026-07-01 — Catalogue "New Product" form (+ New product)

Added the prototype's catalogue-template creation UI, wired to Step 2's "+ New product".

- **DB migration** (`scripts/migrate-catalogue.ts`, applied + PostgREST reloaded;
  schema.sql updated): catalogue gains `singlePiece`, `assemblyHrs`, `gelCureMins`,
  `lamCureMins`, `specUrl`.
- **CatalogueForm** ("New Product"): single-piece toggle, product code*, name*, SKU,
  sell price, assembly hours, gel/laminating cure mins, Parts/Components (code +
  detail + hrs, hidden when single-piece), Packing hardware checklist (defaults
  Bolt Pack/Slide Feet/Flange Supports), Save to catalogue.
- **Wired:** Step 2 "+ New product" opens it and **auto-selects** the new product in
  the catalogue search on save; also added "+ New Product" to the Catalogue page.
- **API/shared:** `catalogueInputSchema` + web `Catalogue` type extended; COMP
  instantiation now uses the template's `assemblyHrs`. `useCreateCatalogue` hook.

**Verified:** create via API persists all new fields + nested parts/hardware; COMP
hrs uses assemblyHrs; typecheck clean; test item cleaned up.

**Omitted:** the spec-document PDF upload (column `specUrl` exists) — better via
Supabase Storage than base64-in-DB; catalogue **edit** (create only for now).

---

## 2026-07-01 — Autonomous parity pass: ticket detail, audit logs, catalogue edit, day patterns

Self-directed gap-fill against `t-card.html` ("check your end and add any missing
features"). Filled the largest remaining prototype gaps.

**Done**
- **Ticket detail modal** (`TicketDetailModal.tsx`, new) — opened by clicking a row in
  All Tickets. Meta cards (qty/hrs/resin/value), spec, Production stage (status select
  or COMP roll-up pill + mould assignment + cure timer/confirm), Operatives & time
  (assignee toggle chips + per-operative start/stop timers with running totals), Parts
  (for COMP), and per-ticket Activity log. Wired into `Tickets.tsx` (row → modal).
- **Catalogue edit + delete** — `CatalogueForm` gained an edit mode (`catalogue` prop,
  `useUpdateCatalogue`); Catalogue page + detail modal got **Edit** and **Delete**
  (`useDeleteCatalogue`, confirm-guarded, manager-only) and a header "+ New Product".
  Form now also carries mould-per-part, spec-document upload, single-piece label
  swaps, and the "OPTIONAL" cure-times heading.
- **Order detail Activity log** — `OrderAudit` section on `OrderDetail.tsx` showing the
  order's + all its tickets' audit entries (status changes render from→to pills).
  New `audit` route `?orderId=` mode (order entry + `entityId.in.(ticketIds)`).
- **Operative weekly day-pattern editor** — Mon–Sun hours grid in `OperativeForm`
  (per-day inputs, live week total, "reset to Mon–Fri Nh, weekend off"); persists to
  the existing `dayPattern` column and feeds the Operatives card standard-week display.
- **Hooks:** `useTicket`, `useAuditFor`, `useOrderAudit`, `useUpdate/DeleteCatalogue`,
  `useDelete Ticket/Order`, `useSetOrderStatus`, `useCreateCatalogue`; added `['ticket']`
  cache invalidation to board/ticket mutations.

**Features added / modified**
- All Tickets: click-through ticket detail with stage/mould/cure/assignee/timer controls.
- Catalogue: edit + delete existing templates (was create-only).
- Order detail: activity/audit timeline.
- Operatives: full Mon–Sun availability pattern editor.

**Verified**
- `pnpm --filter @bowson/web typecheck` and `--filter @bowson/api typecheck` both clean.
- API dev server boots and returns a fast 401 on protected routes (auth gate works);
  web dev server serves 200.
- **Could not** run a live data round-trip: the remote Supabase (Coolify) was
  unreachable during this session (HTTP 000 / 25s timeout on `/auth/v1/token`), so
  `/api/health` hangs on its DB ping. Infra availability, not a code issue.

**Next up**
- Re-run the live end-to-end check (auth + dayPattern/ticket round-trip) once Coolify
  Supabase is reachable again.
- Remaining prototype gaps: bulk actions on All Tickets (bulk assign/status);
  Ready-to-Despatch blocked-assembly sub-tables; RAW "Mark received"; despatch/invoice
  notes on Despatched view; Kanban right-click context menus.
- Known bugs (flagged, unfixed): COMP delete orphans PART children; `DEFAULT_ROLE=admin`
  makes every logged-in user admin; auth accepts unverified tokens if `AUTH_REQUIRED`
  is true but the JWT secret is empty. Rotate the exposed service-role + JWT secrets;
  remove the login prefill before production.

---

## 2026-07-01 — Import CSV wizard parity (orders + tickets in one file)

The prototype's top-bar **Import CSV** was a 6-step wizard that imports orders *and*
tickets together; ours only bulk-created bare orders. Rebuilt it to match.

**Done**
- **`ImportWizard.tsx` (new)** — 6-step modal mirroring `t-card.html`:
  1. Download CSV template (seeded with up to 3 real catalogue examples).
  2. Upload CSV (click or drag & drop).
  3. Review orders — table with new/⚠exists status + parse errors/warnings.
  4. Review colours/spec — editable per-slide colour; assembly parts inherit it.
  5. Review tickets — catalogue match (✓/⛔), qty, per-slide price; blocks if any
     slide code is unmatched.
  6. Confirm — price-change-vs-catalogue warning + confirm checkbox, summary cards
     (orders / tickets / total value), then Import.
- **Parser** — one row per slide, blank `order_number` carries the previous order
  forward; header normalisation (strips `*` and `(hints)`); despatch/resin validation;
  `dd/mm/yyyy → yyyy-mm-dd`; catalogue match by product code (leading-zeros stripped)
  then SKU.
- **Import execution** — client-side over existing endpoints: find-or-create customer
  by name → `POST /api/orders` (Pending) → per slide × qty `POST
  /api/orders/:id/tickets` (`fromCatalogueId` so the server expands COMP+PART, or a
  basic MADE for unmatched). Skips orders whose number already exists.
- **API** — add-ticket now honours an explicit `unitPrice` override on the catalogue
  path (MADE/COMP), so the wizard's price edits actually apply (was always forced to
  the template price).
- Wired into `TopBar` (replaces the old orders-only `ImportOrdersModal`, now removed).

**Features added / modified**
- Import CSV: full order+ticket wizard with catalogue matching, colour/spec + price
  review, and price-change confirmation.
- Catalogue ticket creation via API can take a price override.

**Verified**
- `@bowson/web` + `@bowson/api` typecheck clean.
- **Not** run live: remote Supabase (Coolify) still unreachable this session
  (HTTP 000 / timeout), so no end-to-end import test yet.

**Next up**
- Live-test the import wizard once Supabase is back (template → upload → import).
- `+ Ticket` button: ours asks you to pick an order first, then opens AddTicketModal;
  the prototype opens a standalone New Ticket drawer with a type picker + order select.
  Functionally equivalent but the flow differs — align if desired.

---

## 2026-07-01 — `+ Ticket` parity: manager PIN gate + standalone New Ticket form

Reworked the top-bar `+ Ticket` flow to match the prototype (per screenshots).

**Done**
- **Manager PIN gate** (`ManagerPinGate.tsx`, new) — clicking `+ Ticket` now opens
  "Manager Authorisation Required" asking for the manager PIN before showing the form
  (mirrors the prototype's `promptManagerPin`). Default PIN **1234**, stored in
  `lib/config.ts` (`MANAGER_PIN`) as the single source of truth (was Admin > Settings
  in the prototype).
- **Standalone New Ticket form** (`NewTicketForm.tsx`, new) — replaces the old
  "pick an order → AddTicketModal" two-step. Matches the screenshot: Product type cards
  (Bought-in / Slide / Assembly = RAW / MADE / COMP), Parent order select + read-only
  "Auto-assigned on release" ticket number, Select-from-catalogue dropdown (auto-fills
  detail/drawing/hrs/price and picks the type), Description (detail, spec/colour,
  drawing ref), and Scheduling & pricing (initial stage, labour hrs, qty, unit price,
  auto net price). Catalogue selection submits via `fromCatalogueId` (server expands
  assemblies); manual entry submits type/detail/spec/drawing/hrs/qty/price/stage.
- **API** — add-ticket now accepts an optional `status` (initial stage) for manual
  tickets, with `pct` derived from `AUTO_PCT`; catalogue tickets still start at
  "1. Spec Required".
- Removed the old `AddTicketGlobal` from `TopBar`; `AddTicketModal` is still used by
  Order detail / Step 2.

**Features added / modified**
- `+ Ticket`: manager-PIN-gated standalone New Ticket form with type cards, catalogue
  autofill, and full scheduling/pricing.
- Manual tickets can be created at a chosen initial stage.

**Verified**
- `@bowson/web` + `@bowson/api` typecheck clean.
- Not run live (Supabase/Coolify still unreachable).

**Next up**
- Live-test `+ Ticket` (PIN 1234 → form → add) once Supabase is back.
- Make the manager PIN admin-configurable (currently a constant in `lib/config.ts`).

**Follow-up (same day) — type-adaptive New Ticket fields**
Made the New Ticket form fields add/remove and re-label by product type, matching the
prototype's `setFType`:
- **RAW (Bought-in):** no catalogue/template section, no Drawing ref, no Labour hrs;
  stage field labelled "Initial status" with Ordered/Received.
- **MADE (Slide):** "Select from catalogue" picker; Drawing ref + Labour hrs shown;
  "Initial stage" with the full GRP stage list.
- **COMP (Assembly):** "Start from template" picker (multi-part products) with a
  read-only parts preview (detail / spec / hrs); Drawing ref + Labour hrs shown.
- Detail placeholder changes per type (bolt packs / slide code / spiral tube slide).
- Switching type resets the catalogue selection and the default stage. Typecheck clean.

---

## 2026-07-01 — Global search: live top-bar typeahead

The top-bar search only navigated to `/search` on Enter; the prototype searches live
from the top bar (`globalSearch` jumps straight to a matching ticket/order as you type).

**Done**
- **`GlobalSearch.tsx` (new)** — live typeahead dropdown in the top bar. Queries
  `useSearch(q)` as you type and shows matching **Orders** (number / site) and
  **Tickets** (number / detail) grouped with status pills; clicking a row jumps to the
  order. Enter (or "See all results →") opens the full `/search` page. Closes on outside
  click / Escape.
- Wired into `TopBar` (replaces the plain input + on-submit navigate).

**Verified**
- Web typecheck clean.
- **Live** (Supabase back up): `GET /api/search?q=test` returns matching orders +
  ticket; scope matches the prototype (order number, site name, ticket number/detail —
  not customer name).

**Next up**
- Optional: extend backend search to match customer name too (beyond prototype scope).
- Wrap up (commit + push) the day's work when ready.

---

## 2026-07-01 — Dashboard Stage Capacity card colours

The Stage Capacity cards showed a grey top border when no operatives were trained for a
stage; the prototype always colours the border red/amber/teal by availability.

**Done** (`Dashboard.tsx` → `StageCapBlock`)
- Split the colours to match `t-card.html`'s `stageCapRow`: the **number** greys out
  (`text3`) when `trained === 0`, but the **top border** is always red (none available),
  amber (some off), or teal (fully staffed).
- Added the prototype's mini availability bar (available / trained %) under each stage.
- Web typecheck clean.

---

## 2026-07-01 — Single combined header row (layout sequence)

The app had two stacked header rows (global `TopBar` with search/actions, then each
page's `PageHeader` with title/actions). The prototype has **one** row: page title on the
left, search + Import CSV + Ticket + Order + Saved on the right. Merged them (layout
only — no behaviour change).

**Done**
- **`GlobalBar.tsx` (new)** — extracted the global controls (search + Import/Ticket/Order
  + Saved indicator + their popups) out of `TopBar` into a reusable inline group.
- **`PageHeader`** now renders, on the right: the page's own actions followed by
  `<GlobalBar />`; made it `sticky top-0`. So every page is a single header row
  `[title/sub] … [page actions] [search][Import CSV][+Ticket][+Order][Saved]`.
- **`GlobalSearch`** sized to a fixed width and its dropdown right-aligned (it now lives
  on the right of the header).
- Removed `<TopBar />` from `Layout` and deleted `TopBar.tsx`.
- Login is unaffected (outside the layout / pre-auth).

**Verified**
- Web typecheck clean; production build succeeds (187 modules) — the ui ↔ GlobalBar
  import is a benign runtime cycle (usage is deferred inside JSX).

---

## 2026-07-01 — Live "✓ Saved" indicator

The saved indicator was static text. The prototype flashes teal with a timestamp
("✓ Saved 11:52") on each save, then fades to grey.

**Done** (`GlobalBar.tsx` → `SavedIndicator`)
- Subscribes to the React Query mutation cache; on any successful write mutation it
  stamps the time and flashes teal for 2s, then fades back to grey — showing
  "✓ Saved HH:MM" (plain "✓ Saved" before the first save this session). Matches the
  prototype's `saveData` autosave-status behaviour, adapted to our server-backed writes.
- Web typecheck clean.

---

## 2026-07-01 — T-Card Board redesign (full-screen dark overlay)

Our board was a light page inside the app layout; the prototype's is a full-screen dark
Kanban overlay. Rebuilt `Board.tsx` to match while keeping our dnd-kit drag + data.

**Done**
- **Full-screen dark overlay** (`fixed inset-0 bg-[#1a1917]`) with the prototype's top
  bar: teal diamond + "T-Card Board", a By Stage / By Operative toggle, Bulk Assign,
  live ticket count, a drag/click hint, a Scroll-lock toggle, and Close (also Esc).
- **Dark stage columns** using the prototype's `KB_COLS` colours; Spec Required &
  Materials are flagged red with a ⚠; each head shows a translucent count badge; empty
  columns show a dashed placeholder.
- **Dark T-cards** — big ticket number, type badge + coloured left border (MADE/COMP/
  PART/RAW), detail, cure pill, order number, assignee initials (or "unassigned"), and
  the per-operative start/stop timer in the By-Operative view.
- **Click a card → opens the ticket detail modal** ("Click to view detail"); drag still
  moves cards between stages / onto operatives.
- **Bulk Assign** — toggles a bar to pick an operative and click-select cards, then
  "Assign N tickets" adds that operative to each selected ticket (appends, keeps
  existing assignees).
- **Scroll lock** toggles the columns' vertical scroll (default locked, like the
  prototype).

**Verified**
- Web typecheck clean; production build succeeds.
- Note: the board Close/Esc returns to the Dashboard (the route stays `/board`; it just
  renders as an overlay above the sidebar).

**Follow-up (same day) — PIN-gated scroll unlock**
- Unlocking the board's vertical scroll now requires the manager PIN, matching the
  prototype's `kbToggleScrollLock`. Clicking "🔒 Scroll locked" opens an "Unlock scroll"
  PIN prompt; on success it switches to "🔓 Scroll unlocked" (green) and enables column
  scrolling. Re-locking needs no PIN.
- Generalised `ManagerPinGate` to accept custom `title` / `prompt` / `confirmLabel`
  (defaults preserve the standalone-ticket gate). Typecheck clean.

---

## 2026-07-01 — All Orders view: match prototype

Aligned the All Orders table with `t-card.html`'s `renderOrders`.

**Done** (`Orders.tsx`)
- **Items** column now shows coloured type pills (`Slide (Assembly) ×1`, `Slide ×2`,
  `Raw Stock ×1`) instead of plain text, using the prototype's tb-* colours.
- **Progress** column is now a coloured % badge (red 0% → green 100% via HSL hue),
  replacing the progress bar — matches `progBar`.
- **Deadline / Despatched** column: two lines (ISO date + countdown like "8 days",
  "Tomorrow", "⚠ N days overdue" with red/amber/teal), or "✓ Despatched" for
  despatched/completed orders. Header renamed to "Deadline / Despatched".
- **Toolbar** reordered to Search · "Show completed & despatched" · status dropdown ·
  **Export CSV** (moved out of the page header, right-aligned).
- Order # rendered as a teal link; pagination is always shown
  ("← Prev · Page X of Y · N orders · Next →").
- Web typecheck clean.

---

## 2026-07-01 — Manager PIN input visibility

The PIN modal used a `••••` placeholder that looked identical to typed password dots,
so you couldn't tell whether anything had been entered.

**Done** (`ManagerPinGate.tsx`)
- Placeholder changed to a clear **"Enter PIN"** (grey, normal spacing) so empty vs
  typed is obvious — matches the prototype's Unlock-scroll field.
- Typed characters are now dark/bold/spaced with explicit text colour (were hard to see).
- Added a **Show / Hide** toggle so the user can reveal the digits to confirm input.
- Web typecheck clean.

---

## 2026-07-01 — Schedule → Production Planner (match prototype, dynamic data)

Replaced the simple weekly-summary Schedule with the prototype's Production Planner,
driven entirely by live operatives + tickets.

**Done** (`Schedule.tsx`, rewritten)
- **Planner / History tabs.**
- **Capacity grid** — operatives × the next 8 weeks (+ any weeks that have tickets),
  each week split into Mon–Fri day cells showing the operative's standard hours (from
  `dayPattern`, else `defaultHrs`/7.5). Current week highlighted; horizontal scroll;
  Skills column with chips + an **Edit** button (opens the operative form). A **Week
  total** footer shows `Xh avail` (+ `Yh booked` when committed).
- **Editable day cells** — clicking a cell opens an hours editor (number + presets
  Off/3.75/4/7.5/10/12) that saves to the operative's `dayPattern` via
  `useUpdateOperative` — persisted, so the grid updates live.
- **Weekly Schedule** — per-week cards with an availability bar and ticket minicards
  (`#tn`, type badge, M2 flag, hrs, detail, order #, status pill). Tickets are grouped
  by their `wc` (falling back to the deadline-derived week); clicking a card opens the
  ticket detail modal. Committed = Σ ticket hrs × remaining-fraction.
- **History tab** keeps the by-week utilisation summary (from `/api/schedule`).

**Verified**
- Web typecheck clean; production build succeeds.
- Note: cell edits change the operative's *standard* weekday hours (all weeks). The
  prototype also supports one-off per-week overrides, which would need a new
  `operatives.dayHrs` field — deferred.

---

## 2026-07-01 — Moulds view: status bar + board-first tabs

Ours opened on a plain Register table; the prototype leads with a metrics status bar and
the Mould Board.

**Done** (`Moulds.tsx`)
- Added the prototype's **4-metric status bar**: Total Moulds, In Use (red when >0),
  Available (teal), and No Mould Assigned (amber, click → Unassigned tab).
- Tabs moved into the content as **underline tabs** and reordered/renamed:
  **🗂 Mould Board** (now the default), **⚠ Tickets Without Mould (N)**, **📋 Register**.
- `+ New Mould` stays in the page header; Board/Register/Unassigned tab bodies unchanged.
- Web typecheck clean.

**Next up (optional):** the prototype also has "📅 Schedule" and "🔗 Unlinked Catalogue"
mould tabs — not yet ported.

**Follow-up (same day) — added the two remaining mould tabs**
- **📅 Schedule** (`ScheduleTab`) — 3-week mould-usage calendar (prev/this/next) with
  ← Earlier / Later → navigation. Each mould is a row; per week it shows the tickets
  assigned to that mould (colour-coded: Gel Coat orange, Laminating purple), else "free"
  or "⚠ Maintenance". A ticket lands in its `wc` week (falling back to the current week
  when actively assigned). Current week header highlighted; sticky mould column.
- **🔗 Unlinked Catalogue** (`UnlinkedTab`) — catalogue parts with no default `mouldId`,
  grouped per product (part / drawing / hrs); shows an "all linked ✓" state when none.
  Tab labels show live counts.
- Web typecheck + production build clean.

---

## 2026-07-01 — Product Catalogue view: match prototype

**Done** (`Catalogue.tsx`)
- Added the prototype's **toolbar** (right-aligned): **⭱ Import CSV · ⭳ Export CSV ·
  + New template** (was just a header "+ New Product"). Global create buttons hidden on
  this page (`globalActions={false}`) — catalogue has its own toolbar.
- Table now has a **Spec** column (📄 link when a spec doc is on file, else ✕) and
  inline **Edit / Delete** action buttons per row (row click still opens the detail).
- **Type** badge coloured (Assembly purple / Single Slide teal); **Hours** now matches
  the prototype (single = whole-slide hrs; assembly = Σ part hrs + assembly hrs).
- **Export CSV** — flattened template + part rows (`product_code,name,sku,type,
  sell_price,assembly_hrs,part_detail,part_code,part_hrs`), matching the prototype so it
  round-trips.
- **Import CSV** — parses that format (a `product_code` row starts a template; blank
  rows add parts) and creates templates via `useCreateCatalogue`.
- Web typecheck clean.

---

## 2026-07-01 — Header cleanup + Operatives & Settings rebuild

- **Global create buttons** (Import CSV / +Ticket / +Order) now hidden on the
  Customers and Operatives pages too (`globalActions={false}`), matching the prototype
  (Schedule/Moulds/Catalogue already were).
- **Header ordering** — page actions now render *after* the search box (search →
  page action → global buttons → Saved), via a `leading` slot on `GlobalBar`. So e.g.
  Customers reads `[search] [+ New Customer] [✓ Saved]`.
- **Operatives & Settings** (`Operatives.tsx`, rebuilt to match `t-card.html`):
  - Hint line "Click an operative to edit…" + **+ Add operative** in the content.
  - Full-width operative rows: avatar, name, "Xh standard week · N active tickets"
    (live count of assigned non-despatched tickets), skills tags / "No skills set",
    "Click to edit →", and a Mon–Sun day-hours strip (red 0h / amber <7.5 / teal).
  - **Stage Completion Weightings** panel (read-only) — each stage's remaining-% with a
    bar, from `STAGE_HRS_REMAINING`, with the explanatory text.
  - **Manager PIN** info card (shows the configured PIN).
- Web typecheck clean.

Note: weightings + PIN are read-only for now (no settings-persistence backend yet); the
prototype makes them editable via localStorage.

---

## 2026-07-01 — Settings backend (editable stage weightings + manager PIN)

Made the Operatives & Settings weightings and manager PIN editable + persisted.

**Done**
- **DB:** new key/value `settings` table (`key`, `value jsonb`, `updatedAt`) — added to
  `schema.sql` (+ RLS list) and a `scripts/migrate-settings.ts` migration (SSL-first
  connect with fall-through).
- **API:** `/api/settings` — `GET` merges stored values over defaults
  (`STAGE_HRS_REMAINING` + PIN `1234`); `PUT` upserts `stageWeights` / `managerPin`
  (manager-gated by the existing role hook). Registered in `index.ts`.
- **Web:** `useSettings` / `useUpdateSettings` hooks + `apiClient.put`. Operatives page
  weightings are now editable inputs with **Save / Reset**; a **Manager PIN** change
  form (current/new/confirm) persists the PIN. `ManagerPinGate` now validates against the
  stored PIN (falls back to the config constant while loading). Schedule Planner's
  committed-hours calc uses the stored weights.
- Typecheck clean (web + api).

**Blocked (infra):** could not create the table from here — the direct Postgres port
(51.81.93.33:5502) accepts TCP but resets the protocol handshake (Coolify likely
IP-whitelists DB connections). The table must be created once via Supabase Studio SQL
(see hand-off). Until then, GET falls back to defaults so the PIN gate still works (1234)
and the UI renders; saving needs the table.

---

## 2026-07-01 — Remove Activity Log; sidebar order/ticket totals

- Removed the **Activity Log** section: dropped the nav item (`nav.ts`), the `/audit`
  route + import (`App.tsx`), and deleted `pages/Audit.tsx`.
- Added a **"N orders · N tickets"** totals line to the sidebar footer (`SidebarStats`
  in `Layout.tsx`), matching the prototype's footer counter.
- Web typecheck clean.

---

## 2026-07-01 — Fix: all DELETE requests failed from the browser (400)

**Symptom:** "Yes — abandon" (and any delete) did nothing — the modal stayed open.

**Cause:** `api.ts` set `Content-Type: application/json` on every request. DELETE/GET
send no body, and Fastify rejects an empty body when the content-type claims JSON →
`400 "Body cannot be empty when content-type is set to 'application/json'"`. (curl tests
passed because curl sent no content-type header.)

**Fix:** only add the JSON content-type header when there is a request body. Verified via
Playwright: abandon now `DELETE → 204` and the modal closes. Affected every delete
(orders, tickets, catalogue, customers, operatives, moulds).

**Also:** global `cursor: pointer` for buttons/selects/label-checkboxes (Tailwind v4
Preflight sets buttons to `cursor:default`); disabled buttons get `not-allowed`.

---

## 2026-07-08 — Parity audit vs t-card.html: gap list + fix plan agreed

**Done**
- Full feature-parity audit of the rebuild against the original `t-card.html`
  prototype (all ~330 prototype functions mapped; every suspected gap verified
  in the rebuild's code, not just assumed).
- Result: core CRUD, board, timers, moulds, catalogue, imports and settings are
  faithful — but **5 critical workflows and ~13 major features are missing**.
- Agreed a 5-phase fix plan with the user (est. 11–15h total). **Next session
  starts Phase 1.**

**Missing — critical**
1. **Despatch pipeline** — `/ready` is a read-only list. Missing: ticket
   selection + "Despatch selected", COMP family-ready gating (+ manager-PIN
   override), partial-despatch warning/flag, printable **Delivery Note** and
   **Invoice** documents (prototype `_buildDespatchHtml` L7287 /
   `_buildInvoiceHtml` L7338), per-ticket override despatch, despatch banner.
2. **Despatched view actions** — reprint Delivery Note, Print Invoice → order
   becomes **Completed**, Copy Invoice (prototype L2503).
3. **Pending release flow + tn BUG** — no "Review & Advance" release; tickets
   created while order is Pending get `tn=null` forever (API
   `orders.ts` L122 only assigns tn when order not Pending; nothing back-fills;
   `POST /api/tickets` never sets tn at all).
4. **Packing checklist gate** on advance into Packing (hardware from order /
   catalogue, tick + qty + notes, saved to order) — prototype L3951.
5. **Family-ready gating on status changes** to Despatched (prototype
   `doAdvance` L4039) — rebuild dropdowns allow ungated jumps.

**Missing — major**
6. Bulk ops on All Tickets (advance selected / to stage, bulk status modal,
   bulk assign operative, inline row advance, per-order expand groups).
7. In Production row actions (advance/reverse, parts-pending block, Qty/Spec/
   Days-left columns, Export CSV).
8. Per-column filter inputs on Orders / Tickets / In Prod tables.
9. Dashboard: "Cannot Produce" blocker alerts (mould maintenance / no mould) +
   Overdue Orders table.
10. Schedule: per-week day-hour overrides (rebuild edits standard pattern for
    ALL weeks — `Schedule.tsx` uses one `weekCapacity` for every week);
    16-week planner (now 8); Export Hours CSV; current-week proration.
11. Manager return-to-production override on despatched tickets.
12. Delete order / delete ticket UI on existing records (PIN-gated).
13. Edit existing ticket fields after creation (detail/spec/hrs/price).
14. Order detail: bulk advance within order, schedule suggestion on existing
    orders, quick add-to-catalogue.
15. Board: right-click context menu (ops toggle, stop all timers), bulk stage
    move, cure prompt on drag into Gel/Lam + "needs more time" modal, 10 order
    colour palettes on cards, view spec from card.
16. Catalogue SKU generator (auto-build + preview + bulk save).
17. Moulds "Unlinked Catalogue" tab: link part → mould directly from the tab.

**Decisions**
- Fix order (phases, commit after each):
  **P1** Despatch pipeline + documents + Despatched actions (#1 #2, ~3–4h) —
  needs ticket fields `despatchDate`/`partialDespatch`/`managerOverride` + a
  despatch endpoint + SQL migration.
  **P2** Release flow + tn back-fill bug + packing checklist + family gating
  (#3 #4 #5, ~2–3h) — needs `packingChecklist`/`packingNotes` on orders.
  **P3** Bulk ops + table actions/filters + delete/edit (#6 #7 #8 #11 #12 #13,
  ~2–3h).
  **P4** Dashboard blockers + Schedule overrides/16wk/hours CSV (#9 #10, ~2h) —
  needs week-overrides table.
  **P5** Board extras + order-detail extras + SKU gen + unlinked linking
  (#14–#17 + minors, ~2–3h).
- Documents ported 1:1 from prototype print HTML — no redesign.
- Intentionally NOT porting: save-to-HTML-file snapshot, localStorage
  persistence (replaced by Supabase).

**Next up**
- **Phase 1: Despatch pipeline** — schema migration (despatch fields), despatch
  API endpoint (bulk, family gate, partial flag), Ready view selection UI +
  gating modals, Delivery Note + Invoice printable docs, Despatched view
  buttons (reprint / invoice→Completed / copy invoice). Then P2 → P5 in order.
