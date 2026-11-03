-- Rank movement for the Rankings profile. Run once in Supabase → SQL Editor (safe to run again).
create table if not exists public.command_rank_state (
  key        text primary key,               -- a ranking, e.g. boards.Overall or players.board.batting.runs.all
  state      jsonb not null,                 -- where each entry stood when its rank last changed
  updated_at bigint not null                 -- epoch milliseconds
);
alter table public.command_rank_state enable row level security;
revoke all on public.command_rank_state from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';
