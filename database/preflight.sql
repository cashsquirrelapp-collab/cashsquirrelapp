-- Read-only inventory before installing into an existing Supabase project.
-- Review any pre-existing privileged function reachable by a browser role.
select n.nspname schema,p.proname function_name,p.oid::regprocedure signature,
 p.prosecdef security_definer,
 has_function_privilege('anon',p.oid,'execute') anon_can_execute,
 has_function_privilege('authenticated',p.oid,'execute') authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
order by p.proname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')
order by table_name,grantee;

-- Run on Supabase: private financial reports must not be publicly readable.
select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets where id='monthly-reports';
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='storage' and tablename='objects';
