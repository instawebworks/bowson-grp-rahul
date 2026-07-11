# Bowson GRP

Production-management system for GRP / fibreglass (water-slide) manufacturing.
Full rebuild of the original single-file prototype (`t-card.html`) into a real,
multi-user web application backed by Supabase.

## Stack

| Layer    | Tech                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Platform | **Supabase** — Postgres, Auth (roles via RLS), Realtime, Storage                                                          |
| Backend  | **Node + Fastify + TypeScript** — owns all writes & domain logic, data access via `@supabase/supabase-js`, Zod validation |
| Frontend | **React + TypeScript + Vite + Tailwind** — TanStack Query, Zustand, dnd-kit, React Router                                 |
| Repo     | **pnpm monorepo**                                                                                                         |

**Write path:** client → Fastify (validate + run domain logic + write) → Postgres
→ Supabase Realtime broadcast → all clients update. The backend is the single
source of truth for the workflow; live reads (Kanban, timers) subscribe to
Supabase Realtime directly.

## Packages

```
packages/
├─ shared/ # Zod schemas, shared TS types, domain constants (stages, %, capacity)
├─ api/ # Fastify server, Supabase data client, REST routes, domain services
└─ web/ # React + Vite SPA
supabase/
├─ schema.sql # run once in the Supabase SQL Editor to create the tables
└─ seed.sql # run after schema.sql to load operatives + catalogue + demo data

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

## Authentication — factory PIN sign-in

Login is PIN-based (no email/password accounts, ported from the prototype's
unified login). The sign-in screen lists every operative by name plus a
**Manager Login** button; whoever is selected types their PIN:

- **Manager** — PIN `1234` by default, changeable in *Operatives & Settings →
  Manager PIN*. Gets the full management app with a `[→ Log out` button top-right.
- **Operatives** — each has their own PIN (default `1234`), set by the manager in
  the operative's profile ("Login PIN"). They get the dark shop-floor view only:
  **My Tickets** (live timers, Stage Done) / **Available** (join work at their
  skill stages) / **Board** (read-only).

`POST /api/auth/login` verifies the PIN and signs a 30-day JWT with
`SUPABASE_JWT_SECRET`; roles are enforced server-side (operatives get shop-floor
actions only, and PINs are hidden from them). To require login, set:
```
AUTH_REQUIRED=true          # backend verifies JWTs on /api/*
VITE_REQUIRE_AUTH=true      # web app shows the PIN sign-in screen
```

## Build phases

1. **Scaffold** — monorepo, Prisma schema, Fastify + Vite shells, seed _(current)_
2. **Core CRUD + read views** — customers, operatives, moulds, catalogue, orders, tickets
3. **Workflow engine** — stage state machine, roll-ups, capacity, mould auto-advance
4. **Kanban + real-time** — T-card board, time tracking, cure timers, Realtime sync
5. **Planning + extras** — schedule, mould planner, CSV import/export, search
6. **Auth/roles polish + deploy**
