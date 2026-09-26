-- A verified backup mailbox is required before scheduling account deletion.
begin;

alter table public.cashflow_account_pauses
  add column if not exists closure_kind text not null default 'pause'
  check (closure_kind in ('pause', 'deletion'));

create table if not exists public.cashflow_backup_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_email text unique,
  verified_at timestamptz,
  pending_email text,
  pending_hash text,
  pending_expires_at timestamptz,
  pending_attempts integer not null default 0
);

alter table public.cashflow_backup_emails enable row level security;
revoke all on public.cashflow_backup_emails from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_backup_emails to service_role;

alter table public.cashflow_challenges drop constraint if exists cashflow_challenges_purpose_check;
alter table public.cashflow_challenges add constraint cashflow_challenges_purpose_check
  check (purpose in ('reset', 'link', 'account-recover'));

commit;
