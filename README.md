# Bowson GRP

Production-management system for GRP / fibreglass (water-slide) manufacturing.
Full rebuild of the original single-file prototype (`t-card.html`) into a real,
multi-user web application backed by Supabase.

## Stack

| Layer | Tech |
|-------|------|
| Platform | **Supabase** — Postgres, Auth (roles via RLS), Realtime, Storage |
| Backend | **Node + Fastify + TypeScript** — owns all writes & domain logic, data access via `@supabase/supabase-js`, Zod validation |
| Frontend | **React + TypeScript + Vite + Tailwind** — TanStack Query, Zustand, dnd-kit, React Router |
| Repo | **pnpm monorepo** |

**Write path:** client → Fastify (validate + run domain logic + write) → Postgres
→ Supabase Realtime broadcast → all clients update. The backend is the single
source of truth for the workflow; live reads (Kanban, timers) subscribe to
Supabase Realtime directly.

## Packages

```
packages/
├─ shared/   # Zod schemas, shared TS types, domain constants (stages, %, capacity)
├─ api/      # Fastify server, Supabase data client, REST routes, domain services
└─ web/      # React + Vite SPA
supabase/
├─ schema.sql  # run once in the Supabase SQL Editor to create the tables
└─ seed.sql    # run after schema.sql to load operatives + catalogue + demo data
```

## Getting started

```bash
# 1. Install deps
pnpm install

# 2. Configure environment
cp .env.example .env
#   ...fill in Supabase URL + keys (Supabase dashboard → Settings → API)

# 3. Set up the database — two options:
#   a) Automatic: set DATABASE_URL in .env, then:
#        pnpm --filter @bowson/api db:setup   # creates tables + seeds + reloads PostgREST
#   b) Manual: in the Supabase dashboard → SQL Editor, paste & run
#        supabase/schema.sql  then  supabase/seed.sql

# 4. Run everything
pnpm dev            # api on :4000, web on :5173
```

## The domain (ported 1:1 from `t-card.html`)

- **Orders** → **Tickets** (RAW / MADE / COMP / PART)
- **11-stage manufacturing pipeline:** Spec → Materials → Queue (Awaiting Mould)
  → Gel Coat → Laminating → Trim & Finish → Assembly → QC → Packing →
  Ready to Despatch → Despatched
- **Moulds** (occupancy / capacity planning), **Operatives** (skills + live time
  tracking), **Catalogue** (product templates), **Customers**, **Audit log**
- COMP/PART status roll-ups, auto progress %, deadline/overdue logic, gel-coat
  cure timers, weekly capacity planning (7.5 hrs/day)

## Enabling authentication (optional, off by default)

The app runs without login by default. To turn on Supabase Auth + roles:

1. **Create a user** in Supabase (Studio → Authentication → Add user), or enable sign-ups.
2. In `.env`, set `SUPABASE_JWT_SECRET` (self-hosted: the `JWT_SECRET` from your
   Coolify Supabase env) and flip both flags:
   ```
   AUTH_REQUIRED=true          # backend verifies JWTs on /api/*
   VITE_REQUIRE_AUTH=true      # web app shows a login wall
   ```
3. Run **`supabase/rls.sql`** in the SQL Editor — grants logged-in users read
   access (writes stay backend-only) and publishes the live tables for Realtime.
4. Restart `pnpm dev`. Users now sign in; the API rejects unauthenticated calls.

## Build phases

1. **Scaffold** — monorepo, Prisma schema, Fastify + Vite shells, seed *(current)*
2. **Core CRUD + read views** — customers, operatives, moulds, catalogue, orders, tickets
3. **Workflow engine** — stage state machine, roll-ups, capacity, mould auto-advance
4. **Kanban + real-time** — T-card board, time tracking, cure timers, Realtime sync
5. **Planning + extras** — schedule, mould planner, CSV import/export, search
6. **Auth/roles polish + deploy**
