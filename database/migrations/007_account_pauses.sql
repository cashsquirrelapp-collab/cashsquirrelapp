-- Durable 30-day account closure countdown. Only the service role may read or write it.
begin;

create table if not exists public.cashflow_account_pauses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paused_at timestamptz not null default now(),
  delete_after timestamptz not null,
  state text not null default 'paused' check (state in ('paused', 'deleting')),
  deletion_lease_until timestamptz,
  check (delete_after >= paused_at + interval '30 days')
);

create index if not exists cashflow_account_pauses_due
  on public.cashflow_account_pauses(delete_after)
  where state = 'paused';

-- Accounts paused by the previous release get a fresh 30-day window.
insert into public.cashflow_account_pauses(user_id, paused_at, delete_after)
select id, now(), now() + interval '30 days'
from auth.users
where raw_app_meta_data->>'account_paused' = 'true'
on conflict (user_id) do nothing;

alter table public.cashflow_account_pauses enable row level security;
revoke all on public.cashflow_account_pauses from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_account_pauses to service_role;

commit;
