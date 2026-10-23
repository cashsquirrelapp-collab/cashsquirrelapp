begin;
alter table public.subscriptions add column if not exists card_subscription_id text;
alter table public.cashflow_prepaid_orders drop constraint cashflow_prepaid_orders_status_check;
alter table public.cashflow_prepaid_orders add constraint cashflow_prepaid_orders_status_check
  check(status in ('reserved','open','expired','paid','refunded','subscribed'));
create table public.cashflow_card_subscriptions (
  subscription_id text primary key,order_id text not null unique references public.cashflow_prepaid_orders(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  cancel_at_period_end boolean not null default false, created_at timestamptz not null default now()
);
create unique index cashflow_one_open_card_subscription on public.cashflow_card_subscriptions(user_id)
  where status not in ('canceled','incomplete_expired');
create table public.cashflow_card_cycles (
  invoice_id text primary key,payment_id text not null unique,
  subscription_id text not null references public.cashflow_card_subscriptions(subscription_id),
  order_id text not null references public.cashflow_prepaid_orders(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,period_end timestamptz not null,refunded boolean not null default false,
  check(period_end>period_start)
);
create index cashflow_card_cycles_user on public.cashflow_card_cycles(user_id,period_end);
alter table public.cashflow_card_subscriptions enable row level security;
alter table public.cashflow_card_cycles enable row level security;
revoke all on public.cashflow_card_subscriptions,public.cashflow_card_cycles from public,anon,authenticated;
grant select,insert,update,delete on public.cashflow_card_subscriptions,public.cashflow_card_cycles to service_role;
create or replace function public.cashflow_prepare_prepaid_checkout(p_order_id text,p_user_id uuid,p_customer_id text,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; s public.subscriptions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'missing_order'; end if;
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if s.stripe_checkout_reservation_id is distinct from p_order_id or s.stripe_customer_id is distinct from p_customer_id
    or p_customer_id is null or s.stripe_livemode is distinct from o.livemode then raise exception 'order_owner_mismatch'; end if;
  if o.request is not null then return o.request; end if;
  if o.expires_at<=now() or o.status<>'reserved' or p_request is null
    or (p_request->>'mode' is distinct from 'payment' and not coalesce((p_request->>'mode'='subscription'
      and p_request#>>'{metadata,auto_renew}'='true' and p_request#>>'{metadata,save_card}'='true'
      and p_request#>>'{metadata,consent_version}'='krarok-card-20261021-v1'
      and p_request#>>'{metadata,payment_flow}'='custom_card'
      and length(p_request#>>'{metadata,consent_text}')>30
      and p_request#>'{subscription_data,metadata}'=p_request->'metadata' and o.method='card'),false))
    or p_request->>'customer' is distinct from p_customer_id
    or p_request->>'client_reference_id' is distinct from p_user_id::text
    or p_request#>>'{metadata,period}' is distinct from o.period
    or p_request#>>'{metadata,months}' is distinct from o.months::text
    or p_request#>>'{metadata,checkout_reservation_id}' is distinct from o.id
    or p_request#>>'{line_items,0,price}' is distinct from o.price_id
    or p_request#>>'{line_items,0,quantity}' is distinct from '1'
    or jsonb_array_length(p_request->'line_items')<>1 then raise exception 'order_request_mismatch'; end if;
  update public.cashflow_prepaid_orders set customer_id=p_customer_id,request=p_request where id=p_order_id;
  update public.subscriptions set stripe_checkout_request=p_request where user_id=p_user_id;
  return p_request;
end; $$;

create or replace function public.cashflow_refresh_effective_subscription(p_user_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.subscriptions; effective_end timestamptz; prepaid_end timestamptz; card_end timestamptz;
begin
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if not found then return; end if;
  select max(c.period_end) into card_end from public.cashflow_card_cycles c
    join public.cashflow_prepaid_orders o on o.id=c.order_id
    where c.user_id=p_user_id and not c.refunded
      and (s.pro_access_reset_at is null or o.created_at>s.pro_access_reset_at);
  if s.pro_access_reset_at is not null then
    -- Old payment replays/refunds must never restore a revoked entitlement.
    select max(entitled_until) into prepaid_end from public.cashflow_prepaid_orders
      where user_id=p_user_id and status='paid' and created_at>s.pro_access_reset_at;
    prepaid_end := greatest(prepaid_end,card_end);
    effective_end := prepaid_end;
  else
    select max(entitled_until) into prepaid_end from public.cashflow_prepaid_orders where user_id=p_user_id and status='paid';
    prepaid_end := greatest(prepaid_end,card_end);
    effective_end := greatest(s.manual_current_period_end,s.legacy_current_period_end,s.stripe_entitled_until,s.promptpay_entitled_until,prepaid_end);
  end if;
  update public.subscriptions set
    prepaid_entitled_until=prepaid_end,
    current_period_end=case when s.plan='admin_revoked' then null else effective_end end,
    plan=case
      when s.plan in ('admin_grant','admin_revoked') then s.plan
      when prepaid_end>now() then 'pro_prepaid'
      when s.pro_access_reset_at is not null then 'admin_removed'
      when s.manual_current_period_end>now() then 'pro_manual'
      when effective_end is not null or s.stripe_subscription_id is not null then 'pro_monthly'
      else s.plan end,
    status=case
      when s.plan='admin_revoked' then 'canceled'
      when s.plan='admin_grant' then 'active'
      when effective_end>now() then 'active'
      when s.pro_access_reset_at is not null then 'canceled'
      when s.card_subscription_id=s.stripe_subscription_id then case when s.stripe_subscription_status in ('active','trialing') then 'incomplete' else s.stripe_subscription_status end
      when s.stripe_subscription_status is not null then s.stripe_subscription_status
      when effective_end is not null or s.plan in ('pro_monthly','pro_prepaid') then 'canceled'
      else coalesce(s.status,'inactive') end,
    updated_at=now() where user_id=p_user_id;
end; $$;

create function public.cashflow_sync_card_subscription(
  p_order_id text,p_user_id uuid,p_subscription_id text,p_customer_id text,p_livemode boolean,
  p_status text,p_created bigint,p_cancel boolean,p_period_end timestamptz
) returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; s public.subscriptions; old public.cashflow_card_subscriptions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if o.id is null or s.user_id is null or o.method<>'card'
    or o.request#>>'{metadata,auto_renew}' is distinct from 'true'
    or o.request#>>'{metadata,consent_version}' is distinct from 'krarok-card-20261021-v1'
    or o.customer_id is distinct from p_customer_id or s.stripe_customer_id is distinct from p_customer_id
    or o.livemode is distinct from p_livemode or s.stripe_livemode is distinct from p_livemode
    or p_subscription_id is null or p_subscription_id not like 'sub_%'
    or p_status is null or p_created is null or p_created<extract(epoch from o.created_at-interval '5 minutes')
    or p_created>extract(epoch from now()+interval '5 minutes') or p_cancel is null
    or p_period_end is null or not isfinite(p_period_end) then raise exception 'card_subscription_mismatch'; end if;
  select * into old from public.cashflow_card_subscriptions where subscription_id=p_subscription_id for update;
  if old.subscription_id is not null and (old.order_id<>p_order_id or old.user_id<>p_user_id) then raise exception 'card_owner_mismatch'; end if;
  insert into public.cashflow_card_subscriptions(subscription_id,order_id,user_id,status,cancel_at_period_end)
    values(p_subscription_id,p_order_id,p_user_id,p_status,p_cancel)
    on conflict(subscription_id) do update set
      status=case when cashflow_card_subscriptions.status in ('canceled','incomplete_expired') then cashflow_card_subscriptions.status else excluded.status end,
      cancel_at_period_end=case when cashflow_card_subscriptions.status in ('canceled','incomplete_expired') then cashflow_card_subscriptions.cancel_at_period_end else excluded.cancel_at_period_end end;
  select * into old from public.cashflow_card_subscriptions where subscription_id=p_subscription_id;
  -- Old subscription deliveries may update their own ledger, never replace a newer subscription.
  if s.stripe_subscription_id is null or s.stripe_subscription_id=p_subscription_id
    or (s.stripe_subscription_status in ('canceled','incomplete_expired') and p_created>coalesce(s.stripe_subscription_created,-1)) then
    update public.subscriptions set card_subscription_id=p_subscription_id,stripe_subscription_id=p_subscription_id,
      stripe_subscription_created=p_created,stripe_price_id=o.price_id,stripe_subscription_status=old.status,
      stripe_billing_period_end=p_period_end,cancel_at_period_end=old.cancel_at_period_end,updated_at=now() where user_id=p_user_id;
  end if;
  update public.cashflow_prepaid_orders set status='subscribed' where id=p_order_id and status in ('reserved','open');
  perform public.cashflow_release_billing_checkout(p_user_id,p_order_id);
  perform public.cashflow_refresh_effective_subscription(p_user_id);
end; $$;
create function public.cashflow_record_card_cycle(
  p_order_id text,p_user_id uuid,p_subscription_id text,p_invoice_id text,p_payment_id text,
  p_amount bigint,p_currency text,p_livemode boolean,p_start timestamptz,p_end timestamptz,p_refunded boolean
) returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; c public.cashflow_card_cycles;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if o.id is null or o.request#>>'{metadata,auto_renew}' is distinct from 'true'
    or o.amount is distinct from p_amount or p_currency is distinct from 'thb' or o.livemode is distinct from p_livemode
    or not exists(select 1 from public.cashflow_card_subscriptions where subscription_id=p_subscription_id and order_id=p_order_id and user_id=p_user_id)
    or p_invoice_id is null or p_invoice_id not like 'in_%' or p_payment_id is null or p_payment_id not like 'pi_%'
    or p_refunded is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_start<o.created_at-interval '5 minutes' or p_start>now()+interval '5 minutes'
    or p_end-p_start<make_interval(days=>28*o.months) or p_end-p_start>make_interval(days=>31*o.months)
    then raise exception 'card_cycle_mismatch'; end if;
  select * into c from public.cashflow_card_cycles where invoice_id=p_invoice_id for update;
  if c.invoice_id is not null and (c.order_id<>p_order_id or c.user_id<>p_user_id or c.subscription_id<>p_subscription_id
    or c.payment_id<>p_payment_id or c.period_start<>p_start or c.period_end<>p_end) then raise exception 'card_cycle_conflict'; end if;
  insert into public.cashflow_card_cycles(invoice_id,payment_id,subscription_id,order_id,user_id,period_start,period_end,refunded)
    values(p_invoice_id,p_payment_id,p_subscription_id,p_order_id,p_user_id,p_start,p_end,p_refunded)
    on conflict(invoice_id) do update set refunded=cashflow_card_cycles.refunded or excluded.refunded;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
end; $$;
revoke all on function public.cashflow_sync_card_subscription(text,uuid,text,text,boolean,text,bigint,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.cashflow_sync_card_subscription(text,uuid,text,text,boolean,text,bigint,boolean,timestamptz) to service_role;
revoke all on function public.cashflow_record_card_cycle(text,uuid,text,text,text,bigint,text,boolean,timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.cashflow_record_card_cycle(text,uuid,text,text,text,bigint,text,boolean,timestamptz,timestamptz,boolean) to service_role;
commit;
