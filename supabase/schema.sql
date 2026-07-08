-- ════════════════════════════════════════════════════════════════════════════
-- Bowson GRP — database schema
-- Run this ONCE in the Supabase dashboard → SQL Editor → New query → Run.
-- Then run seed.sql to load the operatives + catalogue.
--
-- Notes:
--  • Column names are camelCase (quoted) so they match the API/UI exactly.
--  • Domain statuses/types are plain text, validated by the API (Zod).
--  • RLS is enabled with NO policies → anon/public access is denied; the backend
--    uses the service-role key which bypasses RLS. Direct-read policies are added
--    later (Phase 6) when the browser subscribes to Realtime.
-- ════════════════════════════════════════════════════════════════════════════

-- Clean slate (safe to re-run during development)
drop table if exists "audit_log"          cascade;
drop table if exists "time_sessions"      cascade;
drop table if exists "ticket_assignments" cascade;
drop table if exists "catalogue_hardware" cascade;
drop table if exists "catalogue_parts"    cascade;
drop table if exists "catalogue"          cascade;
drop table if exists "tickets"            cascade;
drop table if exists "orders"             cascade;
drop table if exists "moulds"             cascade;
drop table if exists "operatives"         cascade;
drop table if exists "customers"          cascade;
drop table if exists "users"              cascade;

-- ─── Customers ──────────────────────────────────────────────────────────────
create table "customers" (
  "id"        bigint generated always as identity primary key,
  "name"      text not null,
  "contact"   text,
  "phone"     text,
  "email"     text,
  "address"   text,
  "region"    text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "deletedAt" timestamptz
);

-- ─── Operatives ─────────────────────────────────────────────────────────────
create table "operatives" (
  "id"         bigint generated always as identity primary key,
  "name"       text not null,
  "skills"     text[] not null default '{}',
  "defaultHrs" double precision,
  "dayPattern" double precision[] not null default '{}',
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),
  "deletedAt"  timestamptz
);

-- ─── Moulds ─────────────────────────────────────────────────────────────────
create table "moulds" (
  "id"        bigint generated always as identity primary key,
  "ref"       text not null unique,
  "name"      text,
  "qty"       integer not null default 1,
  "status"    text not null default 'Active',
  "notes"     text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "deletedAt" timestamptz
);

-- ─── Orders ─────────────────────────────────────────────────────────────────
create table "orders" (
  "id"          bigint generated always as identity primary key,
  "orderNumber" text not null unique,
  "customerId"  bigint references "customers"("id") on delete set null,
  "siteName"    text,
  "status"      text not null default 'Pending',
  "deadline"    timestamptz,
  "despatch"    text,
  "wc"          text,
  "resinType"   text not null default 'Standard',
  "themeImage"  text,
  "notes"       text,
  "value"       double precision not null default 0,
  "packingChecklist" jsonb,
  "packingNotes"     text,
  "isDraft"     boolean not null default true,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "deletedAt"   timestamptz
);
create index on "orders" ("customerId");

-- ─── Tickets ────────────────────────────────────────────────────────────────
create table "tickets" (
  "id"              bigint generated always as identity primary key,
  "tn"              integer,
  "orderId"         bigint not null references "orders"("id") on delete cascade,
  "type"            text not null,                 -- RAW | MADE | COMP | PART
  "compParentId"    bigint references "tickets"("id") on delete set null,
  "detail"          text not null,
  "spec"            text,
  "drawing"         text,
  "status"          text not null default '1. Spec Required',
  "pct"             integer not null default 0,
  "wc"              text,
  "hrs"             double precision not null default 0,
  "qty"             integer not null default 1,
  "unitPrice"       double precision not null default 0,
  "netPrice"        double precision not null default 0,
  "mouldId"         bigint references "moulds"("id") on delete set null,
  "resinType"       text,
  "cureTargetStage" text,
  "cureStart"       timestamptz,
  "cureMins"        integer,
  "cureCleared"     boolean not null default false,
  "dead"            timestamptz,
  "completed"       timestamptz,
  "qcRef"           text,
  "despatchDate"    date,
  "partialDespatch" boolean not null default false,
  "managerOverride" boolean not null default false,
  "themeImage"      text,
  "migrated"        boolean not null default false,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),
  "deletedAt"       timestamptz
);
create index on "tickets" ("orderId");
create index on "tickets" ("compParentId");
create index on "tickets" ("mouldId");
create index on "tickets" ("status");

-- ─── Ticket assignments (operatives ↔ tickets) ──────────────────────────────
create table "ticket_assignments" (
  "id"          bigint generated always as identity primary key,
  "ticketId"    bigint not null references "tickets"("id") on delete cascade,
  "operativeId" bigint not null references "operatives"("id") on delete cascade,
  "createdAt"   timestamptz not null default now(),
  unique ("ticketId", "operativeId")
);

-- ─── Time sessions ──────────────────────────────────────────────────────────
create table "time_sessions" (
  "id"          bigint generated always as identity primary key,
  "ticketId"    bigint not null references "tickets"("id") on delete cascade,
  "operativeId" bigint not null references "operatives"("id") on delete cascade,
  "start"       timestamptz not null,
  "end"         timestamptz
);
create index on "time_sessions" ("ticketId");
create index on "time_sessions" ("operativeId");

-- ─── Catalogue (templates) ──────────────────────────────────────────────────
create table "catalogue" (
  "id"          bigint generated always as identity primary key,
  "productCode" text not null,
  "name"        text not null,
  "code"        text,
  "drawing"     text,
  "unitPrice"   double precision not null default 0,
  "singlePiece" boolean not null default false,
  "assemblyHrs" double precision not null default 0,
  "gelCureMins" integer,
  "lamCureMins" integer,
  "specUrl"     text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "deletedAt"   timestamptz
);

create table "catalogue_parts" (
  "id"          bigint generated always as identity primary key,
  "catalogueId" bigint not null references "catalogue"("id") on delete cascade,
  "detail"      text not null,
  "spec"        text,
  "hrs"         double precision not null default 0,
  "price"       double precision not null default 0,
  "drawing"     text,
  "mouldId"     bigint references "moulds"("id") on delete set null
);
create index on "catalogue_parts" ("catalogueId");

create table "catalogue_hardware" (
  "id"          bigint generated always as identity primary key,
  "catalogueId" bigint not null references "catalogue"("id") on delete cascade,
  "name"        text not null,
  "qty"         integer not null default 1,
  "notes"       text
);
create index on "catalogue_hardware" ("catalogueId");

-- ─── Audit log ──────────────────────────────────────────────────────────────
create table "audit_log" (
  "id"         bigint generated always as identity primary key,
  "entityType" text not null,            -- ticket | order
  "entityId"   bigint not null,
  "field"      text,
  "fromValue"  text,
  "toValue"    text,
  "note"       text,
  "userId"     uuid,
  "at"         timestamptz not null default now()
);
create index on "audit_log" ("entityType", "entityId");

-- ─── App settings (key/value: stage weightings, manager PIN) ────────────────
create table "settings" (
  "key"       text primary key,
  "value"     jsonb not null,
  "updatedAt" timestamptz not null default now()
);

-- ─── Users (mirrors Supabase auth.users) ────────────────────────────────────
create table "users" (
  "id"          uuid primary key,
  "email"       text not null unique,
  "role"        text not null default 'OPERATIVE',  -- ADMIN | MANAGER | OPERATIVE
  "operativeId" bigint unique references "operatives"("id") on delete set null,
  "createdAt"   timestamptz not null default now()
);

-- ─── updatedAt auto-touch trigger ───────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['customers','operatives','moulds','orders','tickets','catalogue']
  loop
    execute format(
      'create trigger trg_%1$s_updated before update on %1$I
       for each row execute function set_updated_at()', t);
  end loop;
end$$;

-- ─── Row-Level Security: enable everywhere, no policies (backend-only access) ─
do $$
declare t text;
begin
  foreach t in array array[
    'customers','operatives','moulds','orders','tickets','ticket_assignments',
    'time_sessions','catalogue','catalogue_parts','catalogue_hardware','audit_log','users','settings'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end$$;
