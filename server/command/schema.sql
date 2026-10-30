-- IOCF Command Center — database schema (Supabase / PostgreSQL).
-- Run once in the Supabase SQL editor (or `psql`) for the project the site's server uses.
--
-- SECURITY MODEL
--   * Every table has Row Level Security ENABLED and NO policies, and all privileges are revoked from the `anon` and
--     `authenticated` roles. That means the public (anon) key — and any signed-in Supabase user — can read and write
--     NOTHING here. Only the server, using the service-role key (which bypasses RLS), can touch these tables.
--   * The service-role key lives only in server environment variables (Vercel / Fly secrets) and on the administrator's own
--     computer for the local credential tool. It must never be put in front-end code or committed.
--   * Passwords are stored only as salted scrypt hashes.

create extension if not exists pgcrypto;

create table if not exists public.command_accounts (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null unique,              -- IOCF-ADM-001, IOCF-BRD-001 … IOCF-BRD-026
  role            text not null check (role in ('admin', 'board')),
  board_slug      text,                              -- null for the administrator
  board_name      text,
  username        text not null unique check (username = lower(username)),
  password_hash   text not null,                     -- scrypt$N$r$p$salt$hash
  status          text not null default 'active' check (status in ('active', 'inactive')),
  chairman_name   text,
  session_version integer not null default 1,        -- raised on deactivation / reset: ends every open session
  failed_logins   integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint board_accounts_have_a_board check ((role = 'admin') = (board_slug is null)),
  constraint one_account_per_board unique (board_slug)
);

create table if not exists public.command_board_modules (
  board_slug text not null,
  module_id  text not null,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (board_slug, module_id)
);

create table if not exists public.command_audit_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  action     text not null,
  actor      text,                                   -- username, or 'local-cli'
  actor_role text,
  target     text,                                   -- account id / board slug
  ip         text,
  detail     jsonb
);
create index if not exists command_audit_log_at on public.command_audit_log (at desc);

create table if not exists public.command_rate_limits (
  key      text primary key,
  count    integer not null,
  reset_at bigint not null                           -- epoch milliseconds
);

alter table public.command_accounts      enable row level security;
alter table public.command_board_modules enable row level security;
alter table public.command_audit_log     enable row level security;
alter table public.command_rate_limits   enable row level security;

revoke all on public.command_accounts, public.command_board_modules, public.command_audit_log, public.command_rate_limits from anon, authenticated;
-- (no policies are created on purpose: with RLS on and no policy, non-service roles are denied everything)
