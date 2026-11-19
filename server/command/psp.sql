-- IOCF 2.0 – Player Salary Program (PSP 2027). Run once in Supabase → SQL Editor (safe to run again).
-- Every table is reachable only with the server's service-role key (no policies on purpose).

-- the salary months an administrator manages (one row per month; a month without a row is "Not Started")
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
