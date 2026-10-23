-- Store only the latest heartbeat for each signed-in account.
begin;

create table if not exists public.cashflow_user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.cashflow_user_presence enable row level security;
revoke all on public.cashflow_user_presence from public, anon, authenticated;
grant all on public.cashflow_user_presence to service_role;

commit;
