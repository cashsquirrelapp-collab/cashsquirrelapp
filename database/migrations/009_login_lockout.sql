-- Lock password sign-in after six failed attempts for five minutes.
-- Email addresses are stored only as SHA-256 lookup keys.
begin;

create table if not exists public.cashflow_login_protections (
  email_key text primary key check (email_key ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  alert_sent boolean not null default false
);

alter table public.cashflow_login_protections enable row level security;
revoke all on public.cashflow_login_protections from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_login_protections to service_role;

create or replace function public.cashflow_login_lock_status(p_email_key text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.cashflow_login_protections; seconds_left integer;
begin
  if p_email_key !~ '^[0-9a-f]{64}$' then raise exception 'invalid_email_key'; end if;
  select * into c from public.cashflow_login_protections where email_key=p_email_key for update;
  if not found then return 0; end if;
  if c.locked_until > now() then
    return greatest(1,ceil(extract(epoch from c.locked_until-now()))::integer);
  end if;
  if c.locked_until is not null or c.window_started_at <= now()-interval '15 minutes' then
    update public.cashflow_login_protections set attempts=0,window_started_at=now(),locked_until=null,alert_sent=false where email_key=p_email_key;
  end if;
  return 0;
end $$;

create or replace function public.cashflow_record_login_failure(p_email_key text)
returns table(locked_for_seconds integer, notify_user boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.cashflow_login_protections; next_attempt integer; should_notify boolean;
begin
  if p_email_key !~ '^[0-9a-f]{64}$' then raise exception 'invalid_email_key'; end if;
  insert into public.cashflow_login_protections(email_key) values(p_email_key) on conflict(email_key) do nothing;
  select * into c from public.cashflow_login_protections where email_key=p_email_key for update;
  if c.locked_until > now() then
    return query select greatest(1,ceil(extract(epoch from c.locked_until-now()))::integer),false;
    return;
  end if;
  if c.locked_until is not null or c.window_started_at <= now()-interval '15 minutes' then
    c.attempts:=0; c.alert_sent:=false; c.window_started_at:=now();
  end if;
  next_attempt:=c.attempts+1;
  if next_attempt >= 6 then
    should_notify:=not c.alert_sent;
    update public.cashflow_login_protections set attempts=next_attempt,window_started_at=c.window_started_at,
      locked_until=now()+interval '5 minutes',alert_sent=true where email_key=p_email_key;
    return query select 300,should_notify;
  else
    update public.cashflow_login_protections set attempts=next_attempt,window_started_at=c.window_started_at,
      locked_until=null,alert_sent=false where email_key=p_email_key;
    return query select 0,false;
  end if;
end $$;

create or replace function public.cashflow_reset_login_failures(p_email_key text)
returns void language sql security definer set search_path=public,pg_temp as $$
  delete from public.cashflow_login_protections where email_key=p_email_key;
$$;

revoke all on function public.cashflow_login_lock_status(text) from public,anon,authenticated;
revoke all on function public.cashflow_record_login_failure(text) from public,anon,authenticated;
revoke all on function public.cashflow_reset_login_failures(text) from public,anon,authenticated;
grant execute on function public.cashflow_login_lock_status(text) to service_role;
grant execute on function public.cashflow_record_login_failure(text) to service_role;
grant execute on function public.cashflow_reset_login_failures(text) to service_role;

commit;
