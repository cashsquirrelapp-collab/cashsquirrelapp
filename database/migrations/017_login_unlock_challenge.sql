-- Let a user with the correct password complete a locked login by confirming
-- a short-lived code sent to the account's verified primary email.
begin;

alter table public.cashflow_challenges
  drop constraint if exists cashflow_challenges_purpose_check;
alter table public.cashflow_challenges
  add constraint cashflow_challenges_purpose_check
  check (purpose in ('reset', 'link', 'account-recover', 'login-unlock'));

commit;
