-- Stripe subscription state is written only by the verified backend webhook.
begin;

alter table public.subscriptions
  add column if not exists workspace_type text,
  add column if not exists workspace_id uuid,
  add column if not exists stripe_price_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

update public.subscriptions
set workspace_type = 'personal', workspace_id = user_id
where workspace_type is null or workspace_id is null;

alter table public.subscriptions
  add constraint subscriptions_workspace_type_check
  check (workspace_type is null or workspace_type = 'personal'),
  add constraint subscriptions_personal_workspace_check
  check (workspace_id is null or workspace_id = user_id);

create unique index if not exists subscriptions_stripe_customer_unique
  on public.subscriptions(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists subscriptions_stripe_subscription_unique
  on public.subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;

create table if not exists public.cashflow_stripe_events (
  event_id text primary key check (length(event_id) between 1 and 255),
  event_type text not null check (length(event_type) between 1 and 255),
  object_id text not null check (length(object_id) between 1 and 255),
  processed_at timestamptz not null default now()
);
alter table public.cashflow_stripe_events enable row level security;
revoke all on public.cashflow_stripe_events from public, anon, authenticated;
grant all on public.cashflow_stripe_events to service_role;

create or replace function public.cashflow_sync_subscription(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  if p_workspace_id <> p_user_id then raise exception 'invalid_workspace'; end if;
  if p_event_id is null or p_event_type is null or p_object_id is null
    or p_subscription_id is null or p_price_id is null then raise exception 'missing_subscription_field'; end if;
  if p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    then raise exception 'invalid_subscription_status'; end if;
  if p_status in ('active','trialing') and p_period_end is null then raise exception 'missing_period_end'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into public.cashflow_stripe_events(event_id,event_type,object_id)
    values(p_event_id,p_event_type,p_object_id)
    on conflict(event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  insert into public.subscriptions(
    user_id,workspace_type,workspace_id,stripe_customer_id,stripe_subscription_id,
    stripe_price_id,status,plan,current_period_end,cancel_at_period_end,updated_at
  ) values(
    p_user_id,'personal',p_workspace_id,p_customer_id,p_subscription_id,
    p_price_id,p_status,'pro_monthly',p_period_end,p_cancel_at_period_end,now()
  )
  on conflict(user_id) do update set
    workspace_type = 'personal',
    workspace_id = excluded.workspace_id,
    stripe_customer_id = coalesce(excluded.stripe_customer_id,public.subscriptions.stripe_customer_id),
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    plan = case when public.subscriptions.plan = 'admin_revoked' then 'admin_revoked' else 'pro_monthly' end,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.cashflow_sync_subscription(text,text,text,uuid,uuid,text,text,text,text,timestamptz,boolean)
  from public, anon, authenticated;
grant execute on function public.cashflow_sync_subscription(text,text,text,uuid,uuid,text,text,text,text,timestamptz,boolean)
  to service_role;

commit;
