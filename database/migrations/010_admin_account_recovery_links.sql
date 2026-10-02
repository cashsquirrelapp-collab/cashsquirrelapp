-- Admin-issued, one-time recovery links for any account scheduled for permanent deletion.
begin;

create table if not exists public.cashflow_account_recovery_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists cashflow_account_recovery_links_active
  on public.cashflow_account_recovery_links(expires_at)
  where consumed_at is null and revoked_at is null;

alter table public.cashflow_account_recovery_links enable row level security;
revoke all on public.cashflow_account_recovery_links from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_account_recovery_links to service_role;

commit;
