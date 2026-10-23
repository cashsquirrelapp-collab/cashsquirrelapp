-- Run once with the trusted postgres/migration role AFTER migration 004.
-- Replace the nil UUID below with the intended, email-confirmed auth.users ID.
-- Subsequent role changes belong in the authenticated admin UI.
begin;
set local cashflow.bootstrap_admin_id = '00000000-0000-0000-0000-000000000000';
do $$
declare target uuid := current_setting('cashflow.bootstrap_admin_id')::uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('cashflow-system-roles',0));
  if target='00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace cashflow.bootstrap_admin_id with the intended auth.users ID';
  end if;
  if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null) then
    raise exception 'Target account is missing or its email is unconfirmed';
  end if;
  if exists(select 1 from public.cashflow_user_roles where role='admin') then
    raise exception 'An admin already exists; use the admin UI for subsequent role changes';
  end if;
  insert into public.cashflow_user_roles(user_id,role) values(target,'admin')
    on conflict(user_id) do update set role='admin',updated_at=now();
  insert into public.cashflow_role_audit(actor_id,target_id,old_role,new_role) values(null,target,'user','admin');
end $$;
commit;
