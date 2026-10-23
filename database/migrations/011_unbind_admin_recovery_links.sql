-- Recovery links are general admin-issued links; the backup email identifies the account.
-- Remove any old account-bound links and their pending OTPs before changing the schema.
begin;

delete from public.cashflow_account_recovery_links;
delete from public.cashflow_challenges where purpose = 'account-recover';

drop index if exists public.cashflow_account_recovery_links_active;
alter table public.cashflow_account_recovery_links drop column if exists user_id;

create index if not exists cashflow_account_recovery_links_active
  on public.cashflow_account_recovery_links(expires_at)
  where consumed_at is null and revoked_at is null;

commit;
