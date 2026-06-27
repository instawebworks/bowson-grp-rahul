# Bowson GRP — Project Plan

> Planning & design document for rebuilding the `t-card.html` prototype into a
> production-grade, multi-user web application. This is the document to review
> and sign off before each phase. Day-to-day progress is tracked in
> [`DEVLOG.md`](../DEVLOG.md).

**Status:** Phase 1 (Scaffold) complete · awaiting Supabase credentials to begin Phase 2
**Last updated:** 2026-06-27

---

## 1. Goal

Replace the single-file prototype (`t-card.html` — ~9,400 lines of vanilla JS,
localStorage only, single-user) with a real, multi-user, cloud-hosted system
that reproduces **every existing feature exactly first**, then iterates.

### Non-negotiables
- 1:1 feature parity with the prototype for v1.
- Domain logic (stages, roll-ups, capacity, timers) ported faithfully — values
  taken from the prototype, never re-guessed.
- Multi-user with real-time updates (shop floor + office on the same data).
- Professional process: tracked worklog, reviewable plan, clean git history.

---

## 2. Tech stack & rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Platform | **Supabase** (hosted) | Managed Postgres + Auth (roles via RLS) + Realtime + Storage in one — removes DB ops, auth, websockets, and file-handling plumbing. It's just Postgres underneath → no lock-in. |
| Backend | **Node + Fastify + TypeScript** | Owns **all writes** and the domain logic so the workflow stays authoritative and unit-testable. Same language as the frontend. |
| Data access / validation | **`@supabase/supabase-js`** + **Zod** | Backend talks to Postgres via the Supabase client (service-role key) — no ORM, no connection strings. Zod schemas shared between API and UI. |
| Schema | **Plain SQL** (`supabase/schema.sql`, `seed.sql`) | Run by hand in the Supabase SQL Editor. Columns are camelCase so API/UI shapes need no mapping. |
| Frontend | **React + TypeScript + Vite + Tailwind v4** | Internal dashboard (no SEO) → SPA. Tailwind maps cleanly from the prototype's styles. |
| Data fetching | **TanStack Query** | Server-state caching, mutations, invalidation. |
| Realtime | **Supabase Realtime** | Live Kanban + timers broadcast to all clients. |
| Drag & drop | **dnd-kit** | T-Card board. |
| Repo | **pnpm monorepo** | `shared` package gives one source of truth for types/constants. |

### Write path
```
client → Fastify (validate + run domain logic + write) → Postgres
       → Supabase Realtime broadcast → all clients update
```
Live reads (Kanban, timers) subscribe to Supabase Realtime directly; everything
that changes state goes through the backend.

---

## 3. Architecture

```
bowson-grp/
├─ packages/
│  ├─ shared/   # Zod schemas, TS types, domain constants (stages, %, palettes)
│  ├─ api/      # Fastify, Prisma schema/client, REST routes, domain services
│  └─ web/      # React + Vite SPA
├─ docs/PROJECT_PLAN.md   # this file
├─ DEVLOG.md              # day-by-day worklog
└─ .env.example
```

---

## 4. Data model (entities)

Relational schema in [`supabase/schema.sql`](../supabase/schema.sql) (run in the Supabase SQL Editor).

| Entity | Notes |
|--------|-------|
| **Customer** | contact directory |
| **Order** | order #, customer, site, status, deadline, despatch method, target week (`wc`), resin type, theme image, value, draft flag |
| **Ticket** | type **RAW / MADE / COMP / PART**; self-FK `compParentId` (PART→COMP); status, pct, hrs, qty, pricing, mould link, inline gel-coat cure timer |
| **Operative** | name, skill list, daily-hours pattern |
| **TicketAssignment** | M:N ticket ↔ operative |
| **TimeSession** | per-operative time tracking on a ticket (start/end) |
| **Mould** | ref, capacity (`qty`), status, notes |
| **Catalogue** (+ Parts, + Hardware) | product templates |
| **AuditLog** | order/ticket change history |
| **User** | maps to Supabase auth UUID; role ADMIN / MANAGER / OPERATIVE |

**Conventions:** soft-delete via `deletedAt`; identity columns replace the
prototype's `nextOid/nextTid/nextTn`; domain statuses stored as **plain strings**
(exact prototype values) validated by shared Zod enums; computed fields
(COMP roll-up, progress %, occupancy) live in **server-side services**; RLS is
enabled on every table with no policies (backend uses the service-role key;
direct-read policies added in Phase 6 for Realtime).

### Ported domain constants (1:1)
- **11-stage GRP pipeline:** Spec → Materials → Queue (Awaiting Mould) → Gel Coat
  → Laminating → Trim & Finish → Assembly → QC → Packing → Ready to Despatch → Despatched
- **RAW stages:** Ordered → Received
- `STAGE_HRS_REMAINING`, `AUTO_PCT`, `HRS_PER_DAY = 7.5`, `STAGE_SKILLS`, 10 colour palettes
- See [`packages/shared/src/constants.ts`](../packages/shared/src/constants.ts)

---

## 5. Planned API surface (REST)

Built out from Phase 2 onward. Indicative routes:

```
GET    /health

# Reference data
GET/POST/PATCH/DELETE   /api/customers[/:id]
GET/POST/PATCH/DELETE   /api/operatives[/:id]
GET/POST/PATCH/DELETE   /api/moulds[/:id]
GET/POST/PATCH/DELETE   /api/catalogue[/:id]

# Orders & tickets
GET/POST/PATCH/DELETE   /api/orders[/:id]
GET/POST/PATCH/DELETE   /api/tickets[/:id]

# Workflow (Phase 3)
POST   /api/tickets/:id/status        # stage transition (validated state machine)
POST   /api/tickets/:id/assign        # set operatives
POST   /api/tickets/:id/mould         # assign/free mould (+ auto-advance)
POST   /api/tickets/:id/cure          # start/clear gel-coat cure timer
POST   /api/tickets/:id/time/start|stop

# Planning (Phase 5)
GET    /api/schedule                  # weekly capacity vs committed
GET    /api/dashboard                 # KPIs/alerts
GET    /api/audit
```

---

## 6. Roadmap (phased, parity-first)

| Phase | Scope | Deliverables | Status |
|-------|-------|--------------|--------|
| **1. Scaffold** | Monorepo, schema, server/UI shells, seed | Builds & typechecks green; nav + routes; seed data | ✅ Done |
| **2. Core CRUD + read views** | Customers, Operatives, Moulds, Catalogue; Orders/Tickets read APIs | Dashboard, All Orders, All Tickets + all admin views live; customer add/edit; order create | ✅ Done |
| **3. Workflow engine** | 11-stage state machine, COMP/PART roll-ups, progress %, order-status derivation, ticket adding (Step 2), status changes, audit log | Domain module + workflow endpoints + order detail page with add-ticket & status controls | ✅ Done |
| **4. Kanban + real-time** | T-Card board (by-stage / by-operative), drag-drop → status/assign, per-operative time tracking, live polling | Working T-Card board ✅. Remaining: cure timers, mould auto-advance, capacity math, true Realtime (→ Phase 6 w/ RLS) | 🟡 Core done |
| **5. Planning + extras** | Schedule view, mould planner (5 tabs), CSV import/export, audit log UI, global search | Feature-complete vs prototype | Planned |
| **6. Auth/roles + deploy** | Supabase Auth, RLS policies, role gating, hosting & CI | Production deployment | Planned |

---

## 7. Open items / decisions pending

- **Supabase credentials** — needed in `.env` (`SUPABASE_URL` + keys, no
  connection strings), then run `supabase/schema.sql` + `seed.sql` in the SQL
  Editor to bring the DB up.
- **Roles & permissions matrix** — confirm what each of admin / manager /
  operative can see and do (to be finalised before Phase 6, ideally noted earlier).
- **Hosting targets** — frontend (Vercel/Netlify/static) and backend (Railway/
  Render/Fly) to be chosen before Phase 6.
- **CSV formats** — confirm the exact import/export column layouts the team uses.

---

## 8. Working process

- **`DEVLOG.md`** updated every session and on any feature add/modify.
- **"Continue from last"** → resume from the latest DEVLOG *Next up* items.
- **"Wrap up"** → finalise, write the DEVLOG entry, commit, and push to GitHub.
- This plan is reviewed/updated at each phase boundary.
