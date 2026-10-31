-- The series table for Series Announcement. Run once in Supabase → SQL Editor (safe to run again).
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
alter table public.command_series enable row level security;
revoke all on public.command_series from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';
