-- Shared finance belongs to a group, never to its creator's personal account.
begin;
create table public.cashflow_group_finance (
  group_id uuid not null references public.cashflow_groups(id) on delete cascade,
  entity_table text not null check(entity_table in ('cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents')),
  id text not null check(length(id) between 1 and 128 and id not in ('__proto__','prototype','constructor')),
  data jsonb not null,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key(group_id,entity_table,id),
  check(case when entity_table='cashflow_documents' then id in ('settings','statuses','job_types','issuer_profile','notif_settings')
    else jsonb_typeof(data)='object' and data->>'id'=id end)
);
alter table public.cashflow_group_finance enable row level security;
revoke all on public.cashflow_group_finance from public,anon,authenticated;
grant all on public.cashflow_group_finance to service_role;

create function public.cashflow_group_finance_snapshot(p_actor uuid,p_group_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  -- Membership changes lock the same group FOR UPDATE. Hold this lock until
  -- this request finishes so a concurrent removal cannot race authorization.
  perform 1 from cashflow_groups where id=p_group_id for share;
  if not found or not exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor) then
    raise exception 'group_finance_forbidden' using errcode='42501';
  end if;
  with rows as (select * from cashflow_group_finance where group_id=p_group_id)
  select jsonb_build_object('snapshot',jsonb_build_object(
    'jobs',coalesce((select jsonb_agg(data order by id) from rows where entity_table='cashflow_jobs'),'[]'),
    'expenses',coalesce((select jsonb_agg(data order by id) from rows where entity_table='cashflow_expenses'),'[]'),
    'goals',coalesce((select jsonb_agg(data order by id) from rows where entity_table='cashflow_goals'),'[]'),
    'invoices',coalesce((select jsonb_agg(data order by id) from rows where entity_table='cashflow_invoices'),'[]'),
    'settings',(select data from rows where entity_table='cashflow_documents' and id='settings'),
    'statuses',(select data from rows where entity_table='cashflow_documents' and id='statuses'),
    'job_types',(select data from rows where entity_table='cashflow_documents' and id='job_types'),
    'issuer_profile',(select data from rows where entity_table='cashflow_documents' and id='issuer_profile'),
    'notif_settings',coalesce((select data from rows where entity_table='cashflow_documents' and id='notif_settings'),'{}')),
    'versions', (select jsonb_object_agg(t,coalesce((select jsonb_object_agg(id,version) from rows where entity_table=t),'{}'))
      from unnest(array['cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents']) t),
    'workspace',jsonb_build_object('groupId',p_group_id,'name',(select name from cashflow_groups where id=p_group_id))) into result;
  return result;
end $$;

create function public.cashflow_group_finance_apply(p_actor uuid,p_group_id uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; t text; expected bigint; n int;
begin
  -- Serialize group writes and role/removal transactions; every member may edit.
  perform 1 from cashflow_groups where id=p_group_id for update;
  if not found or not exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor) then
    raise exception 'group_finance_forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>10000 then
    raise exception 'invalid_changes' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_changes) as items(value) group by items.value->>'table',items.value->>'id' having count(*)>1) then
    raise exception 'duplicate_changes' using errcode='22023';
  end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    t:=c->>'table'; expected:=(c->>'version')::bigint;
    if t is null or t not in ('cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents')
      or (t='cashflow_documents' and (c->>'id' is null or c->>'id' not in ('settings','statuses','job_types','issuer_profile','notif_settings'))) then
      raise exception 'invalid_table_or_document' using errcode='22023';
    end if;
    if c->>'op'='delete' and expected is not null then
      delete from cashflow_group_finance where group_id=p_group_id and entity_table=t and id=c->>'id' and version=expected;
    elsif c->>'op'='set' and expected is null then
      insert into cashflow_group_finance(group_id,entity_table,id,data,updated_by)
        values(p_group_id,t,c->>'id',c->'data',p_actor) on conflict do nothing;
    elsif c->>'op'='set' then
      update cashflow_group_finance set data=c->'data',version=version+1,updated_at=now(),updated_by=p_actor
        where group_id=p_group_id and entity_table=t and id=c->>'id' and version=expected;
    else raise exception 'invalid_operation' using errcode='22023'; end if;
    get diagnostics n=row_count;
    if n<>1 then raise exception 'version_conflict' using errcode='40001'; end if;
  end loop;
  if (select count(*) from cashflow_group_finance where group_id=p_group_id)>20000
    or (select coalesce(sum(octet_length(data::text)),0) from cashflow_group_finance where group_id=p_group_id)>4194304 then
    raise exception 'group_finance_quota' using errcode='54000';
  end if;
end $$;
revoke all on function public.cashflow_group_finance_snapshot(uuid,uuid),public.cashflow_group_finance_apply(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cashflow_group_finance_snapshot(uuid,uuid),public.cashflow_group_finance_apply(uuid,uuid,jsonb) to service_role;
commit;
