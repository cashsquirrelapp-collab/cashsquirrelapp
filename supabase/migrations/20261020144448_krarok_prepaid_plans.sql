begin;
alter table public.subscriptions add column if not exists prepaid_entitled_until timestamptz;
create table public.cashflow_prepaid_orders (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  period text not null, months smallint not null, amount bigint not null,
  method text not null check(method in ('card','promptpay')),
  price_id text not null, livemode boolean not null,
  customer_id text, session_id text unique, checkout_url text, request jsonb,
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  status text not null default 'reserved' check(status in ('reserved','open','expired','paid','refunded')),
  payment_id text unique, paid_at timestamptz, entitled_until timestamptz,
  check ((period='month' and months=1 and amount=15900)
    or (period='halfYear' and months=6 and amount=84900)
    or (period='year' and months=12 and amount=149000)),
  check ((paid_at is null and entitled_until is null) or (paid_at is not null and entitled_until is not null))
);
create index cashflow_prepaid_orders_user on public.cashflow_prepaid_orders(user_id,created_at desc);
alter table public.cashflow_prepaid_orders enable row level security;
revoke all on public.cashflow_prepaid_orders from public, anon, authenticated;
grant select,insert,update,delete on public.cashflow_prepaid_orders to service_role;

create function public.cashflow_reserve_prepaid_checkout(
  p_user_id uuid,p_order_id text,p_period text,p_method text,p_price_id text,p_livemode boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; o public.cashflow_prepaid_orders; m smallint; a bigint; expiry timestamptz := now()+interval '45 minutes';
begin
  if p_period is null or p_method is null or p_price_id is null or p_livemode is null
    or p_order_id is null or p_user_id is null or p_method not in ('card','promptpay') then raise exception 'invalid_plan'; end if;
  select months,amount into m,a from (values ('month',1,15900),('halfYear',6,84900),('year',12,149000)) as plans(period,months,amount) where period=p_period;
  if not found then raise exception 'invalid_plan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if exists(select 1 from public.subscriptions where user_id=p_user_id and prepaid_entitled_until>now()) then
    return jsonb_build_object('result','prepaid_active'); end if;
  select * into o from public.cashflow_prepaid_orders where user_id=p_user_id
    and status in ('reserved','open') and request is not null order by created_at limit 1 for update;
  if found then
    if o.period<>p_period or o.method<>p_method then return jsonb_build_object('result','period_mismatch'); end if;
    return jsonb_build_object('result','resumed','order_id',o.id);
  end if;
  r := public.cashflow_reserve_billing_checkout(p_user_id,p_order_id,p_method,expiry,expiry+interval '5 minutes',p_livemode);
  if r->>'result'='reserved' then
    insert into public.cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,customer_id,expires_at)
      values(p_order_id,p_user_id,p_period,m,a,p_method,p_price_id,p_livemode,r->>'customer_id',expiry);
    return jsonb_build_object('result','reserved','order_id',p_order_id);
  elsif r->>'result'='resumed' then
    select * into o from public.cashflow_prepaid_orders where id=r->>'reservation_id' and user_id=p_user_id;
    if not found then return jsonb_build_object('result','pending'); end if;
    if o.period<>p_period or o.method<>p_method then return jsonb_build_object('result','period_mismatch'); end if;
    return jsonb_build_object('result','resumed','order_id',o.id);
  end if;
  return r;
end; $$;

create function public.cashflow_prepare_prepaid_checkout(p_order_id text,p_user_id uuid,p_customer_id text,p_request jsonb)
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
    or p_request->>'mode' is distinct from 'payment'
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

create function public.cashflow_attach_prepaid_checkout(p_order_id text,p_user_id uuid,p_session_id text,p_url text,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.request is null or p_session_id is null
    or (o.session_id is not null and o.session_id<>p_session_id)
    or abs(extract(epoch from o.expires_at-p_expires_at))>1
    or (p_url is not null and p_url not like 'https://checkout.stripe.com/%') then raise exception 'order_session_mismatch'; end if;
  update public.cashflow_prepaid_orders set session_id=p_session_id,checkout_url=coalesce(p_url,checkout_url),
    status=case when status='reserved' then 'open' else status end where id=p_order_id;
  update public.subscriptions set stripe_checkout_session_id=p_session_id,stripe_checkout_url=p_url
    where user_id=p_user_id and stripe_checkout_reservation_id=p_order_id;
end; $$;

create function public.cashflow_finish_prepaid_checkout(p_order_id text,p_user_id uuid,p_session_id text,p_state text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or p_state is distinct from 'expired' or p_session_id is null
    or (o.session_id is not null and o.session_id<>p_session_id) then raise exception 'order_session_mismatch'; end if;
  if o.status in ('paid','refunded') then return; end if;
  update public.cashflow_prepaid_orders set status='expired',session_id=p_session_id where id=p_order_id;
  perform public.cashflow_release_billing_checkout(p_user_id,p_order_id);
end; $$;

create function public.cashflow_fulfill_prepaid(
  p_order_id text,p_user_id uuid,p_session_id text,p_customer_id text,p_payment_id text,
  p_livemode boolean,p_amount bigint,p_currency text,p_period text,p_months smallint,p_paid_at timestamptz,p_refunded boolean
) returns text language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; s public.subscriptions; next_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if not found then raise exception 'missing_subscription'; end if;
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.request is null or p_payment_id is null or p_session_id is null
    or p_paid_at is null or not isfinite(p_paid_at) or p_paid_at>now()+interval '5 minutes'
    or p_paid_at<o.created_at-interval '5 minutes' or p_refunded is null
    or o.customer_id is distinct from p_customer_id or s.stripe_customer_id is distinct from p_customer_id
    or o.livemode is distinct from p_livemode or s.stripe_livemode is distinct from p_livemode
    or p_currency is distinct from 'thb' or o.amount is distinct from p_amount
    or o.period is distinct from p_period or o.months is distinct from p_months
    or (o.session_id is not null and o.session_id<>p_session_id)
    or (o.payment_id is not null and o.payment_id<>p_payment_id)
    or (o.paid_at is not null and o.paid_at<>p_paid_at) then raise exception 'prepaid_evidence_mismatch'; end if;
  -- A refund is terminal: duplicate or delayed success must not restore access.
  if o.status='refunded' or (o.status='paid' and not p_refunded) then return 'duplicate'; end if;
  -- Calendar months in Bangkok, clamp month-end and leap years. No 30/180/365-day shortcuts.
  next_end := ((p_paid_at at time zone 'Asia/Bangkok') + make_interval(months=>o.months)) at time zone 'Asia/Bangkok';
  update public.cashflow_prepaid_orders set session_id=p_session_id,payment_id=p_payment_id,paid_at=p_paid_at,
    entitled_until=next_end,status=case when p_refunded then 'refunded' else 'paid' end where id=p_order_id;
  select max(entitled_until) into next_end from public.cashflow_prepaid_orders where user_id=p_user_id and status='paid';
  update public.subscriptions set prepaid_entitled_until=next_end where user_id=p_user_id;
  perform public.cashflow_release_billing_checkout(p_user_id,p_order_id);
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  return case when p_refunded then 'refunded' else 'paid' end;
end; $$;

revoke all on function public.cashflow_reserve_prepaid_checkout(uuid,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.cashflow_prepare_prepaid_checkout(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.cashflow_attach_prepaid_checkout(text,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.cashflow_finish_prepaid_checkout(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.cashflow_fulfill_prepaid(text,uuid,text,text,text,boolean,bigint,text,text,smallint,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.cashflow_reserve_prepaid_checkout(uuid,text,text,text,text,boolean) to service_role;
grant execute on function public.cashflow_prepare_prepaid_checkout(text,uuid,text,jsonb) to service_role;
grant execute on function public.cashflow_attach_prepaid_checkout(text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.cashflow_finish_prepaid_checkout(text,uuid,text,text) to service_role;
grant execute on function public.cashflow_fulfill_prepaid(text,uuid,text,text,text,boolean,bigint,text,text,smallint,timestamptz,boolean) to service_role;

create or replace function public.cashflow_refresh_effective_subscription(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.subscriptions; effective_end timestamptz;
begin
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found then return; end if;
  effective_end := greatest(
    target.manual_current_period_end,
    target.legacy_current_period_end,
    target.stripe_entitled_until,
    target.promptpay_entitled_until,
    target.prepaid_entitled_until
  );
  update public.subscriptions set
    current_period_end = effective_end,
    plan = case
      when target.plan in ('admin_grant','admin_revoked') then target.plan
      when target.prepaid_entitled_until > now() then 'pro_prepaid'
      when target.manual_current_period_end > now() then 'pro_manual'
      when effective_end is not null or target.stripe_subscription_id is not null then 'pro_monthly'
      else target.plan end,
    status = case
      when target.plan = 'admin_revoked' then 'canceled'
      when target.plan = 'admin_grant' then 'active'
      when effective_end > now() then 'active'
      when target.stripe_subscription_status is not null then target.stripe_subscription_status
      when effective_end is not null then 'canceled'
      when target.plan in ('pro_monthly','pro_prepaid') then 'canceled'
      else coalesce(target.status,'inactive') end,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;


commit;
