# Deploying Bowson GRP

Two services — the **API** (Fastify) and the **web** app (static React served by
nginx) — plus your existing **self-hosted Supabase** (Postgres/Auth/Realtime).

```
[ browser ] ──▶ web (nginx static)
                 │  calls VITE_API_URL
                 ▼
              API (Fastify)  ──▶  Supabase (Postgres / Auth / Realtime)
```

Images:
- `Dockerfile.api` — installs the workspace and runs the API via `tsx`.
- `Dockerfile.web` — `vite build` → static files served by nginx (SPA fallback).

> Build context is the **repo root** for both Dockerfiles.

---

## Option A — Coolify (recommended, matches your setup)

Create **two resources** from this Git repo.

### 1. API service
- **Build pack:** Dockerfile → `Dockerfile.api`
- **Port:** `4000`
- **Health check path:** `/health`
- **Environment variables:**
  ```
  SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...
  SUPABASE_ANON_KEY=...
  SUPABASE_JWT_SECRET=...            # required if AUTH_REQUIRED=true
  CORS_ORIGIN=https://grp.yourdomain.com   # the web app's public URL
  API_PORT=4000
  API_HOST=0.0.0.0
  AUTH_REQUIRED=false                # set true once users exist
  # DATABASE_URL only needed to run db:setup; not used at runtime
  ```
- Note the API's public URL (e.g. `https://grp-api.yourdomain.com`).

### 2. Web service
- **Build pack:** Dockerfile → `Dockerfile.web`
- **Port:** `80`
- **Build args** (Vite bakes these in at build time):
  ```
  VITE_API_URL=https://grp-api.yourdomain.com
  VITE_SUPABASE_URL=...               # same as SUPABASE_URL
  VITE_SUPABASE_ANON_KEY=...
  VITE_REQUIRE_AUTH=false             # set true to match AUTH_REQUIRED
  ```
- After deploy, set the API's `CORS_ORIGIN` to the web app's final URL and redeploy the API.

### One-time DB setup
If the database isn't created yet, run (locally, with `DATABASE_URL` in `.env`):
```bash
pnpm --filter @bowson/api db:setup     # schema + seed + PostgREST reload
```
Or paste `supabase/schema.sql` then `supabase/seed.sql` in the Supabase SQL Editor.
To enable auth later, also run `supabase/rls.sql`.

---

## Option C — Vercel (web + API as one project)

The whole app runs on Vercel: the React app as static files, the Fastify API as a
**serverless function** (`api/[...path].ts` mounts the app for every `/api/*` route).
Supabase stays on Coolify.

Config lives in **`vercel.json`** (build the web → `packages/web/dist`, SPA
rewrites, and the function).

**Setup:**
1. Import the repo in Vercel (root directory = repo root; it auto-detects pnpm).
2. **Environment variables** (Project → Settings → Environment Variables):
   ```
   # Server (function) — runtime
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_ANON_KEY=...
   SUPABASE_JWT_SECRET=...
   AUTH_REQUIRED=true
   DEFAULT_ROLE=admin
   # Web (build-time, baked into the bundle)
   VITE_API_URL=            # leave EMPTY — web calls same-origin /api
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   VITE_REQUIRE_AUTH=true
   ```
   > Web + API share the Vercel domain, so `/api/*` is same-origin — leave
   > `VITE_API_URL` empty (the client defaults to relative `/api`). No CORS needed.
3. Deploy. Routes: `/api/*` → the function; everything else → the SPA.
4. One-time: run `pnpm --filter @bowson/api db:setup` and `create-user` locally
   (they need `DATABASE_URL` / Supabase keys in your local `.env`).

**Notes / caveats:**
- The API runs **serverless** on Vercel (cold starts; each request builds/reuses a
  warm Fastify instance). Fine for this workload. The Docker/Coolify option runs it
  as a persistent server if you prefer.
- `VITE_API_URL` empty → `api.ts` falls back to `http://localhost:4000` in dev and
  to relative `/api` in production builds (set it to `/` if you prefer explicit).
- Health: `/api/health` is open (unauthenticated) for uptime checks.

## Option B — docker-compose (single host / local prod test)

```bash
cp .env.example .env     # fill in Supabase + VITE_ values
docker compose up --build
# web → http://localhost:8080   api → http://localhost:4000
```

---

## Turning on authentication (production)

1. Create users in Supabase (Studio → Authentication).
2. Set `SUPABASE_JWT_SECRET` (self-hosted: the `JWT_SECRET` from your Supabase env).
3. Set `AUTH_REQUIRED=true` (API) **and** `VITE_REQUIRE_AUTH=true` (web build arg), redeploy.
4. Run `supabase/rls.sql` so logged-in users can read + the board gets Realtime.
5. Assign roles via each user's `app_metadata.role` (`admin` | `manager` | `operative`),
   or rows in the `users` table. Unset roles default to `admin` (`DEFAULT_ROLE`).

## Notes
- Colour-theme images are stored as base64 in Postgres today; moving them to
  Supabase Storage is a future optimisation.
- The API runs via `tsx` (TypeScript at runtime) — simple and matches dev. A
  compiled/bundled build can be added later if desired.
