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

-- Series Announcement
create table if not exists public.command_series (
  id          text primary key,
  name        text not null,
  series_type text not null,                 -- bilateral | trilateral | quadrilateral
  host        text not null,                 -- board slug
  opponents   jsonb not null default '[]',   -- board slugs
  accepted    jsonb not null default '[]',   -- the opponents that have accepted
  matches     integer not null,
  stadiums    jsonb not null default '[]',
  dates       jsonb not null default '[]',   -- the date (YYYY-MM-DD) of each scheduled match
  bet         integer not null,
  format      text not null,
  club_format text,
  status      text not null default 'pending', -- pending | accepted
  deadline_at bigint not null,               -- epoch milliseconds (11:59 PM IST on the announcement day)
  created_at  bigint not null,
  updated_at  bigint not null,
  accepted_at bigint,
  result_winner text,                        -- board slug, or 'draw'; set by the administrator after the series
  result_note  text,
  result_at    bigint,
  declined_by  text,                         -- board slug that turned the invitation down
  declined_at  bigint,
  credits_applied_at bigint                  -- when the administrator entered this series' credit settlement in the IOCF sheet
);
-- (for a table created before match dates existed)
alter table public.command_series add column if not exists dates jsonb not null default '[]';
alter table public.command_series add column if not exists result_winner text;
alter table public.command_series add column if not exists result_note text;
alter table public.command_series add column if not exists result_at bigint;
alter table public.command_series add column if not exists declined_by text;
alter table public.command_series add column if not exists declined_at bigint;
alter table public.command_series add column if not exists credits_applied_at bigint;
alter table public.command_series add column if not exists matches_per_day integer not null default 1;
alter table public.command_series enable row level security;
revoke all on public.command_series from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';

-- Board Credits
create table if not exists public.command_credit_adjustments (
  id         text primary key,
  board      text not null,                  -- board slug
  amount     integer not null,               -- positive adds credit, negative deducts
  reason     text not null,
  created_by text,
  created_at bigint not null,                -- epoch milliseconds
  applied_at bigint                          -- when the administrator entered it in the IOCF sheet
);
alter table public.command_credit_adjustments add column if not exists applied_at bigint;
alter table public.command_credit_adjustments enable row level security;
revoke all on public.command_credit_adjustments from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';

-- Series statistics
create table if not exists public.command_series_stats (
  key         text primary key,              -- site-<series id>, or rec-<name>-<host> for an earlier series
  kind        text not null,                 -- site | record
  name        text not null,
  title       text,
  tour        text,
  players     integer not null default 0,
  fields      jsonb not null default '[]',
  rows        jsonb not null default '[]',
  uploaded_at bigint not null,               -- epoch milliseconds
  uploaded_by text
);
create table if not exists public.command_series_meta (
  key         text primary key,              -- rec-<name>-<host>
  format      text not null,
  updated_at  bigint not null,
  updated_by  text
);
alter table public.command_series_stats enable row level security;
alter table public.command_series_meta enable row level security;
revoke all on public.command_series_stats, public.command_series_meta from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach these tables)
notify pgrst, 'reload schema';

-- Rank movement
create table if not exists public.command_rank_state (
  key        text primary key,               -- a ranking, e.g. boards.Overall or players.board.batting.runs.all
  state      jsonb not null,                 -- where each entry stood when its rank last changed
  updated_at bigint not null                 -- epoch milliseconds
);
alter table public.command_rank_state enable row level security;
revoke all on public.command_rank_state from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';

-- Stadium requests (Build a Stadium)
create table if not exists public.command_stadiums (
  key           text primary key,            -- the request id
  board         text not null,               -- board slug
  name          text not null,               -- the stadium's name
  place         text not null,               -- the city or town, in the board's home country
  venue         text not null,               -- place + country, as shown ("Mumbai, India")
  country       text not null,
  level         integer not null default 3,  -- always 3 (set by the server, never by the board)
  cost          integer not null default 30000, -- credits the administrator deducts in the sheet when the request is accepted
  status        text not null default 'pending', -- pending | accepted | declined
  requested_by  text,                        -- the chairman's username
  requested_at  bigint not null,             -- epoch milliseconds
  decided_by    text,                        -- the administrator who accepted or declined
  decided_at    bigint,
  decline_reason text,
  adjustment_id text,                        -- (not used: the cost is deducted in the sheet by hand)
  acknowledged_at bigint                     -- when the board dismissed the "not accepted" message
);
alter table public.command_stadiums enable row level security;
revoke all on public.command_stadiums from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';

-- IOCF 2.0 – Player Salary Program (PSP 2027)
create table if not exists public.command_psp_months (
  key                  text primary key,        -- 2027-01
  year                 integer not null,
  month                integer not null,
  status               text not null default 'not_started', -- not_started | active | submission_open | under_review | approved | completed | closed
  activated_by         text,
  activated_at         bigint,
  deadline_at          bigint,                  -- the submission deadline, when the administrator moved it
  note                 text,
  rankings_published_at bigint,
  rankings_published_by text,
  updated_by           text,
  updated_at           bigint not null
);

-- which board sits in which seat of which council (a board has one seat; a seat has one board)
create table if not exists public.command_psp_seats (
  key         text primary key,                 -- champions-1
  council     text not null,                    -- champions | established | challengers | origins
  seat        integer not null,
  board       text not null unique,             -- board slug
  assigned_by text,
  assigned_at bigint not null
);

-- the monthly ranking of the boards of each council, and the funding that rank brings
create table if not exists public.command_psp_rankings (
  key       text primary key,                   -- 2027-01:champions:1
  month_key text not null,
  council   text not null,
  rank      integer not null,
  board     text not null,
  credits   bigint not null,                    -- the official funding of that council and rank, in whole credits
  set_by    text,
  set_at    bigint not null,
  unique (month_key, board)
);

-- the administrator's salary settings (the category percentages), one row
create table if not exists public.command_psp_config (
  key        text primary key,                  -- salary-weights
  weights    jsonb not null,                    -- { special_contract: 2500, … } in hundredths of a percent, totalling 10000
  updated_by text,
  updated_at bigint not null
);

-- a board's salary request, one row per version (a rejected one is kept; a corrected one is a new version)
create table if not exists public.command_psp_submissions (
  key         text primary key,                 -- 2027-01:india:v1
  month_key   text not null,
  board       text not null,
  version     integer not null,
  status      text not null default 'draft',    -- draft | submitted | under_review | approved | rejected | credited
  council     text,
  rank        integer,
  allocation  bigint not null default 0,        -- the board's monthly credits when the request was made
  weights     jsonb,                            -- the category percentages used for the calculation
  lines       jsonb not null default '[]',      -- [{ category, key, name, designation, umpire, salary }]
  total       bigint not null default 0,
  late        boolean not null default false,   -- submitted after the deadline
  created_by  text,
  created_at  bigint not null,
  submitted_by text,
  submitted_at bigint,
  reviewed_by text,
  reviewed_at bigint,
  decided_by  text,
  decided_at  bigint,
  decision_reason text,                         -- the rejection reason
  credited_at bigint
);

-- the verified salary record of each player each month (written only when a request is approved and credited; never changed afterwards)
create table if not exists public.command_psp_records (
  key            text primary key,              -- 2027-01:india:harshdubey
  month_key      text not null,
  year           integer not null,
  month          integer not null,
  board          text not null,
  player_key     text not null,
  player_name    text not null,
  designation    text,
  category       text not null,
  salary         bigint not null,
  status         text not null default 'credited',
  credited_at    bigint not null,
  transaction_ref text not null,
  submission_key text not null
);

-- the virtual salary credit transactions (the reference is the key: crediting twice cannot create a second transaction)
create table if not exists public.command_psp_transactions (
  key            text primary key,              -- PSP-202701-india-harshdubey
  month_key      text not null,
  board          text not null,
  player_key     text not null,
  player_name    text not null,
  amount         bigint not null,
  kind           text not null default 'salary_credit',
  submission_key text not null,
  created_by     text,
  created_at     bigint not null
);

alter table public.command_psp_months enable row level security;
alter table public.command_psp_seats enable row level security;
alter table public.command_psp_rankings enable row level security;
alter table public.command_psp_config enable row level security;
alter table public.command_psp_submissions enable row level security;
alter table public.command_psp_records enable row level security;
alter table public.command_psp_transactions enable row level security;
revoke all on public.command_psp_months, public.command_psp_seats, public.command_psp_rankings, public.command_psp_config, public.command_psp_submissions, public.command_psp_records, public.command_psp_transactions from anon, authenticated;
notify pgrst, 'reload schema';
