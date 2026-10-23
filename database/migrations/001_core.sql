-- Run using the Supabase SQL editor / postgres migration role. No browser secrets.
begin;
create table if not exists public.cashflow_jobs (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (length(id) between 1 and 128), data jsonb not null check (jsonb_typeof(data)='object'),
 version bigint not null default 1, updated_at timestamptz not null default now(), primary key(user_id,id)
);
create table if not exists public.cashflow_expenses (like public.cashflow_jobs including all);
create table if not exists public.cashflow_goals (like public.cashflow_jobs including all);
create table if not exists public.cashflow_invoices (like public.cashflow_jobs including all);
-- LIKE does not copy foreign keys.
alter table public.cashflow_expenses add constraint cashflow_expenses_owner_fk foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.cashflow_goals add constraint cashflow_goals_owner_fk foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.cashflow_invoices add constraint cashflow_invoices_owner_fk foreign key(user_id) references auth.users(id) on delete cascade;
create table public.cashflow_documents (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(id in ('settings','statuses','job_types','notif_settings','avatar_data_url','issuer_profile')),
 data jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now(), primary key(user_id,id)
);
create table public.cashflow_private_state(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null default '{}');
create table public.cashflow_line_links(user_id uuid primary key references auth.users(id) on delete cascade, line_user_id text not null unique);
create table public.cashflow_challenges(user_id uuid not null references auth.users(id) on delete cascade, purpose text not null check(purpose in ('reset','link')), code_hash text not null, expires_at timestamptz not null, attempts int not null default 0, primary key(user_id,purpose));
create index cashflow_challenge_lookup on public.cashflow_challenges(purpose,code_hash);
create table public.cashflow_rate_limits(key text primary key, window_start timestamptz not null, count int not null);
create table public.cashflow_revoked_sessions(session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create table public.cashflow_webhook_events(key text primary key,status text not null,lease_until timestamptz not null);
create table public.cashflow_delivery_claims(key text primary key,created_at timestamptz not null default now());
create table if not exists public.subscriptions(user_id uuid primary key references auth.users(id) on delete cascade, stripe_customer_id text, stripe_subscription_id text, status text not null default 'inactive',plan text,current_period_end timestamptz,updated_at timestamptz not null default now());
create table public.cashflow_payment_events(event_id text primary key,created_at timestamptz not null default now());
create table public.cashflow_payments(payment_id text primary key,user_id uuid not null references auth.users(id) on delete cascade,amount bigint not null,currency text not null,paid_at timestamptz not null,refunded boolean not null default false);
do $$ declare t text; pol record; begin
 foreach t in array array['cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents','subscriptions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',pol.policyname,t);
  end loop;
  execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 end loop;
 foreach t in array array['cashflow_webhook_events','cashflow_private_state','cashflow_line_links','cashflow_challenges','cashflow_rate_limits','cashflow_revoked_sessions','cashflow_delivery_claims','cashflow_payment_events','cashflow_payments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create view public.cashflow_account_snapshot as
select u.id user_id,u.email,
 coalesce((select jsonb_agg(j.data order by j.id) from public.cashflow_jobs j where j.user_id=u.id),'[]') jobs,
 coalesce((select jsonb_agg(j.data order by j.id) from public.cashflow_expenses j where j.user_id=u.id),'[]') expenses,
 coalesce((select jsonb_agg(j.data order by j.id) from public.cashflow_goals j where j.user_id=u.id),'[]') goals,
 coalesce((select jsonb_agg(j.data order by j.id) from public.cashflow_invoices j where j.user_id=u.id),'[]') invoices,
 (select data from public.cashflow_documents where user_id=u.id and id='settings') settings,
 (select data from public.cashflow_documents where user_id=u.id and id='statuses') statuses,
 (select data from public.cashflow_documents where user_id=u.id and id='job_types') job_types,
 (select data from public.cashflow_documents where user_id=u.id and id='avatar_data_url') avatar_data_url,
 (select data from public.cashflow_documents where user_id=u.id and id='issuer_profile') issuer_profile,
 coalesce((select data from public.cashflow_documents where user_id=u.id and id='notif_settings'),'{}')
 ||coalesce((select data from public.cashflow_private_state where user_id=u.id),'{}')
 ||jsonb_build_object('lineUserId',(select line_user_id from public.cashflow_line_links where user_id=u.id)) notif_settings,
 jsonb_build_object('cashflow_jobs',coalesce((select jsonb_object_agg(id,version) from public.cashflow_jobs where user_id=u.id),'{}'),'cashflow_expenses',coalesce((select jsonb_object_agg(id,version) from public.cashflow_expenses where user_id=u.id),'{}'),'cashflow_goals',coalesce((select jsonb_object_agg(id,version) from public.cashflow_goals where user_id=u.id),'{}'),'cashflow_invoices',coalesce((select jsonb_object_agg(id,version) from public.cashflow_invoices where user_id=u.id),'{}'),'cashflow_documents',coalesce((select jsonb_object_agg(id,version) from public.cashflow_documents where user_id=u.id),'{}')) versions
from auth.users u;
revoke all on public.cashflow_account_snapshot from public,anon,authenticated;
grant select on public.cashflow_account_snapshot to service_role;
create function public.cashflow_apply_changes(p_user_id uuid,p_changes jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; t text; n int; expected bigint; begin
 if jsonb_array_length(p_changes)>10000 then raise exception 'too_many_changes'; end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  t:=c->>'table';
  if t not in ('cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents') then raise exception 'invalid_table'; end if;
  expected:=(c->>'version')::bigint;
  if c->>'op'='delete' then
   execute format('delete from public.%I where user_id=$1 and id=$2 and version=$3',t) using p_user_id,c->>'id',expected;
  elsif c->>'op'='set' and expected is null then
   execute format('insert into public.%I(user_id,id,data) values($1,$2,$3) on conflict do nothing',t) using p_user_id,c->>'id',c->'data';
  elsif c->>'op'='set' then
   execute format('update public.%I set data=$3, version=version+1,updated_at=now() where user_id=$1 and id=$2 and version=$4',t) using p_user_id,c->>'id',c->'data',expected;
  else raise exception 'invalid_operation'; end if;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'version_conflict' using errcode='40001'; end if;
 end loop;
end $$;
create function public.cashflow_patch_private(p_user_id uuid,p_patch jsonb,p_remove text[] default '{}') returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into public.cashflow_private_state(user_id,data) values(p_user_id,p_patch-p_remove)
 on conflict(user_id) do update set data=(cashflow_private_state.data||p_patch)-p_remove;
$$;
create function public.cashflow_rate_limit(p_key text,p_limit int,p_seconds int) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n int; begin
 insert into public.cashflow_rate_limits(key,window_start,count) values(p_key,now(),1)
 on conflict(key) do update set count=case when cashflow_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then 1 else cashflow_rate_limits.count+1 end,
 window_start=case when cashflow_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then now() else cashflow_rate_limits.window_start end returning count into n;
 return n<=p_limit;
end $$;
create function public.cashflow_consume_challenge(p_user_id uuid,p_purpose text,p_hash text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.cashflow_challenges; begin
 select * into c from public.cashflow_challenges where user_id=p_user_id and purpose=p_purpose for update;
 if not found or c.expires_at<=now() or c.attempts>=5 then return false; end if;
 if c.code_hash<>p_hash then update public.cashflow_challenges set attempts=attempts+1 where user_id=p_user_id and purpose=p_purpose; return false; end if;
 delete from public.cashflow_challenges where user_id=p_user_id and purpose=p_purpose;
 return true;
end $$;
create function public.cashflow_claim_line(p_hash text,p_line_user_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; begin
 select user_id into owner from public.cashflow_challenges where purpose='link' and code_hash=p_hash and expires_at>now() for update;
 if owner is null then return false; end if;
 insert into public.cashflow_line_links(user_id,line_user_id) values(owner,p_line_user_id) on conflict(user_id) do update set line_user_id=excluded.line_user_id;
 delete from public.cashflow_challenges where user_id=owner and purpose='link'; return true;
end $$;
create function public.cashflow_session_active(p_user_id uuid,p_session_id uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id) and not exists(select 1 from public.cashflow_revoked_sessions where session_id=p_session_id);
$$;
create function public.cashflow_follow_up(p_user_id uuid,p_id text,p_date text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update public.cashflow_jobs set data=data||jsonb_build_object('followUpCount',coalesce((data->>'followUpCount')::int,0)+1,'lastFollowUpDate',p_date),version=version+1,updated_at=now() where user_id=p_user_id and id=p_id;
$$;
create function public.cashflow_process_payment(p_event_id text,p_payment_id text,p_user_id uuid,p_amount bigint,p_currency text,p_paid_at timestamptz,p_refund boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare n int; end_at timestamptz; begin
 -- Serialize different events affecting the same account.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 insert into public.cashflow_payment_events values(p_event_id,now()) on conflict do nothing;
 get diagnostics n=row_count; if n=0 then return; end if;
 if p_refund then
  -- Store a tombstone even when the refund arrives before checkout completion.
  insert into public.cashflow_payments values(p_payment_id,p_user_id,p_amount,p_currency,p_paid_at,true)
  on conflict(payment_id) do update set refunded=true;
 else
  insert into public.cashflow_payments values(p_payment_id,p_user_id,p_amount,p_currency,p_paid_at,false) on conflict do nothing;
 end if;
 -- Recompute from the immutable payment time: retries cannot extend membership.
 select max(paid_at+interval '30 days') into end_at from public.cashflow_payments where user_id=p_user_id and not refunded;
 insert into public.subscriptions(user_id,status,plan,current_period_end) values(p_user_id,case when end_at>now() then 'active' else 'canceled' end,'pro_monthly',end_at)
 on conflict(user_id) do update set status=excluded.status,plan=excluded.plan,current_period_end=excluded.current_period_end,updated_at=now();
end $$;
create function public.cashflow_revoke_user_sessions(p_user_id uuid) returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into public.cashflow_revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=p_user_id on conflict do nothing;
$$;
create function public.cashflow_claim_webhook(p_key text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare event public.cashflow_webhook_events; begin
 insert into public.cashflow_webhook_events values(p_key,'processing',now()+interval '90 seconds') on conflict do nothing;
 if found then return 'claimed'; end if;
 select * into event from public.cashflow_webhook_events where key=p_key for update;
 if event.status='done' then return 'done'; end if;
 if event.lease_until>now() then return 'busy'; end if;
 update public.cashflow_webhook_events set lease_until=now()+interval '90 seconds' where key=p_key;
 return 'claimed';
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'cashflow_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
