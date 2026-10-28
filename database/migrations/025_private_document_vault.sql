-- Keep the document vault inaccessible through browser Supabase keys, even if another
-- permissive Storage policy exists. The application reads and writes files through its
-- authenticated backend using the service role, which bypasses Storage RLS.
begin;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage is required for the private document vault';
  end if;
  if not exists(select 1 from pg_class where oid=to_regclass('storage.objects') and relrowsecurity) then
    raise exception 'Storage objects RLS is disabled; restore it through the Storage administrator before applying this migration';
  end if;

  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values('document-vault', 'document-vault', false, 10485760,
      array['application/pdf','image/jpeg','image/png','image/webp'])
    on conflict(id) do update set
      name=excluded.name,
      public=false,
      file_size_limit=excluded.file_size_limit,
      allowed_mime_types=excluded.allowed_mime_types;

  drop policy if exists document_vault_backend_only on storage.objects;
  create policy document_vault_backend_only on storage.objects as restrictive
    for all to anon, authenticated
    using(bucket_id <> 'document-vault')
    with check(bucket_id <> 'document-vault');
end $$;

commit;
