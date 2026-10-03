-- Keep active recovery links available to admins and record
-- the account recovered with a one-time link. The raw bearer token is encrypted
-- with the server-side session secret; validation continues to use token_hash.
begin;

alter table public.cashflow_account_recovery_links
  add column if not exists token_ciphertext text,
  add column if not exists recovered_user_id uuid references auth.users(id) on delete set null,
  add column if not exists recovered_email text;

create index if not exists cashflow_account_recovery_links_expiry_created
  on public.cashflow_account_recovery_links(expires_at, created_at desc);

commit;
