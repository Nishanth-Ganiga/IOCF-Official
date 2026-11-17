-- Stadium requests (Build a Stadium). Run once in Supabase → SQL Editor (safe to run again).
-- Every request a board sends is a row here, and stays here: the accepted ones are the board's new stadiums,
-- the declined ones are kept as a record. The old stadium sheet (stadiums.json) is only the list from before this feature.
create table if not exists public.command_stadiums (
  key           text primary key,            -- the request id
  board         text not null,               -- board slug
  name          text not null,               -- the stadium's name
  place         text not null,               -- the city or town, in the board's home country
  venue         text not null,               -- place + country, as shown ("Mumbai, India")
  country       text not null,
  level         integer not null default 3,  -- always 3 (set by the server, never by the board)
  cost          integer not null default 30000, -- credits taken from the board when the request is accepted
  status        text not null default 'pending', -- pending | accepted | declined
  requested_by  text,                        -- the chairman's username
  requested_at  bigint not null,             -- epoch milliseconds
  decided_by    text,                        -- the administrator who accepted or declined
  decided_at    bigint,
  decline_reason text,
  adjustment_id text,                        -- the credit adjustment (command_credit_adjustments) that took the cost
  acknowledged_at bigint                     -- when the board dismissed the "not accepted" message
);
alter table public.command_stadiums enable row level security;
revoke all on public.command_stadiums from anon, authenticated;
-- (no policies on purpose: only the server's service-role key can reach this table)
notify pgrst, 'reload schema';
