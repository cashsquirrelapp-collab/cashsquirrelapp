-- Apply after 001/002. Review preflight output and back up privileges first.
-- This app's privileged functions are backend-only, including legacy RPCs.
begin;
revoke create on schema public from public,anon,authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;

-- Supabase Storage exists on hosted projects. Keep local SQL tests portable.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('monthly-reports','monthly-reports',false,4194304,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
        allowed_mime_types=excluded.allowed_mime_types;
  end if;
  if to_regclass('storage.objects') is not null then
    -- Supabase owns this table and enables RLS itself. Hosted postgres cannot
    -- ALTER it; verify the prerequisite rather than changing managed metadata.
    if not exists(select 1 from pg_class
      where oid=to_regclass('storage.objects') and relrowsecurity) then
      raise exception 'Storage objects RLS is disabled; restore it through the Storage administrator before applying this migration';
    end if;
    drop policy if exists monthly_reports_backend_only on storage.objects;
    -- RESTRICTIVE combines with any legacy permissive policy using AND.
    -- It blocks browser access to this bucket even if an old policy allows all.
    create policy monthly_reports_backend_only on storage.objects as restrictive
      for all to anon,authenticated
      using(bucket_id <> 'monthly-reports')
      with check(bucket_id <> 'monthly-reports');
  end if;
end $$;
commit;
