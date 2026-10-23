-- Return stale personal-save conflicts as a normal RPC result instead of
-- emitting a PostgreSQL ERROR for every expected optimistic-lock collision.
-- A conflict rolls back the entire batch and returns false; the API still
-- responds with HTTP 409 so the client cannot overwrite newer data.
begin;

drop function if exists public.cashflow_apply_changes(uuid, jsonb);

create function public.cashflow_apply_changes(p_user_id uuid,p_changes jsonb)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; t text; n int; expected bigint;
begin
  begin
    if jsonb_typeof(p_changes) is distinct from 'array'
      or jsonb_array_length(p_changes)>10000 then
      raise exception 'too_many_changes';
    end if;
    for c in select value from jsonb_array_elements(p_changes) loop
      t:=c->>'table';
      if t not in ('cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents') then
        raise exception 'invalid_table';
      end if;
      expected:=(c->>'version')::bigint;
      if c->>'op'='delete' then
        execute format('delete from public.%I where user_id=$1 and id=$2 and version=$3',t)
          using p_user_id,c->>'id',expected;
      elsif c->>'op'='set' and expected is null then
        execute format('insert into public.%I(user_id,id,data) values($1,$2,$3) on conflict do nothing',t)
          using p_user_id,c->>'id',c->'data';
      elsif c->>'op'='set' then
        execute format('update public.%I set data=$3, version=version+1,updated_at=now() where user_id=$1 and id=$2 and version=$4',t)
          using p_user_id,c->>'id',c->'data',expected;
      else
        raise exception 'invalid_operation';
      end if;
      get diagnostics n=row_count;
      if n<>1 then
        raise exception 'version_conflict' using errcode='40001';
      end if;
    end loop;
  exception
    when sqlstate '40001' then
      -- An exception block is a subtransaction: no earlier row in this batch
      -- remains changed when a stale version is encountered.
      return false;
  end;
  return true;
end $$;

revoke all on function public.cashflow_apply_changes(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.cashflow_apply_changes(uuid,jsonb)
  to service_role;

commit;
