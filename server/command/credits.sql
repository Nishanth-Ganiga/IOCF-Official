-- Manual credit adjustments for Board Credits & Finance. Run once in Supabase → SQL Editor (safe to run again).
create table if not exists public.command_credit_adjustments (
  id         text primary key,
  board      text not null,                  -- board slug
  amount     integer not null,               -- positive adds credit, negative deducts
  reason     text not null,
  created_by text,
  created_at bigint not null                 -- epoch milliseconds
);
alter table public.command_credit_adjustments enable row level security;
revoke all on public.command_credit_adjustments from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';
