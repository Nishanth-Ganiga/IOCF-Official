-- Series statistics and the formats of earlier series. Run once in Supabase → SQL Editor (safe to run again).
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
