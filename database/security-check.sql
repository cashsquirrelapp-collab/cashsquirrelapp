-- Read-only deployment check. Run after migrations on the actual Supabase DB.
begin transaction read only;
do $$
declare t text; f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
  loop
    raise exception 'Browser-executable privileged function remains: %', f.signature;
  end loop;
  foreach t in array array['cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents','subscriptions'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity) then
      raise exception 'Missing table or RLS disabled: %',t;
    end if;
    if has_table_privilege('anon','public.'||t,'select,insert,update,delete')
      or has_table_privilege('authenticated','public.'||t,'insert,update,delete') then
      raise exception 'Unsafe browser table privileges: %',t;
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner_read' and cmd='SELECT')
      or exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname<>'owner_read') then
      raise exception 'Unexpected owner policies: %',t;
    end if;
  end loop;
  foreach t in array array['cashflow_private_state','cashflow_line_links','cashflow_challenges','cashflow_rate_limits','cashflow_revoked_sessions','cashflow_payment_events','cashflow_payments','cashflow_webhook_events','cashflow_delivery_claims','cashflow_user_roles','cashflow_groups','cashflow_group_members','cashflow_group_invitations','cashflow_group_audit','cashflow_role_audit','cashflow_group_finance'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity)
      or has_table_privilege('anon','public.'||t,'select,insert,update,delete')
      or has_table_privilege('authenticated','public.'||t,'select,insert,update,delete') then
      raise exception 'Unsafe private table: %',t;
    end if;
  end loop;
  if exists(select 1 from public.cashflow_groups g where not exists(
    select 1 from public.cashflow_group_members m where m.group_id=g.id and m.role='leader')) then
    raise exception 'A group has no leader';
  end if;
  if not exists(select 1 from storage.buckets where id='monthly-reports' and public=false and file_size_limit<=4194304) then
    raise exception 'Reports bucket is missing or not private/limited';
  end if;
  if not exists(select 1 from pg_class where oid=to_regclass('storage.objects') and relrowsecurity) then
    raise exception 'Storage objects RLS is missing or disabled';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='monthly_reports_backend_only' and permissive='RESTRICTIVE' and cmd='ALL') then
    raise exception 'Reports storage isolation policy missing';
  end if;
  if has_schema_privilege('anon','public','create') or has_schema_privilege('authenticated','public','create') then
    raise exception 'Browser roles can create public schema objects';
  end if;
end $$;
commit;
