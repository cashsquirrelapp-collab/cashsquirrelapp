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
  -- Check every application table, including tables added by newer Supabase migrations.
  -- The API is the only data path, so browser roles must not have direct access to private tables.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and (left(c.relname,9)='cashflow_' or c.relname='subscriptions')
      and c.relname not in ('cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents','subscriptions')
  loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relrowsecurity)
      or has_table_privilege('anon','public.'||t,'select,insert,update,delete')
      or has_table_privilege('authenticated','public.'||t,'select,insert,update,delete') then
      raise exception 'Unsafe private table or missing RLS: %',t;
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
  if not exists(select 1 from storage.buckets where id='document-vault' and public=false and file_size_limit<=10485760) then
    raise exception 'Document vault bucket is missing or not private/limited';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='document_vault_backend_only' and permissive='RESTRICTIVE' and cmd='ALL') then
    raise exception 'Document vault storage isolation policy missing';
  end if;
  if has_schema_privilege('anon','public','create') or has_schema_privilege('authenticated','public','create') then
    raise exception 'Browser roles can create public schema objects';
  end if;
end $$;
commit;
