-- The regular monthly price from 1 Dec 2569 (owner, 2026-10-25): shown ฿249, charged ฿271 with the payment fee; a
-- monthly card renewal agreed to during the promotion renews at ฿271 from then ("ขึ้นเป็น ฿271 เองตั้งแต่ ธ.ค.").
-- The owner runs this in the Supabase SQL editor before the release that sends consent v4; the app never writes SQL.
-- Safe to run more than once. No existing order, payment or subscription row is changed.
--
-- 1. cashflow_pro_month_amount: a month's price at a moment: 17700 satang until 30 Nov 2569, 27100 from 1 Dec 00:00
--    Bangkok. New monthly orders are reserved at it, so the price changes at midnight with no release.
-- 2. The amount rule on orders also allows 27100 for a month.
-- 3. Card renewals accept consent v4 (krarok-card-20261025-v4), which names the amount charged and its fee.
-- 4. A renewal of a promotion month that agreed to the step may be recorded at 27100 for a period from 1 Dec on; every
--    other renewal still has to equal its order's amount.
begin;

create or replace function public.cashflow_pro_month_amount(p_at timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select case when p_at >= timestamptz '2026-11-30 17:00:00+00' then 27100::bigint else 17700::bigint end;
$$;
revoke all on function public.cashflow_pro_month_amount(timestamptz) from public, anon, authenticated;
grant execute on function public.cashflow_pro_month_amount(timestamptz) to service_role;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.cashflow_prepaid_orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%15900%'
  loop
    execute format('alter table public.cashflow_prepaid_orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.cashflow_prepaid_orders add constraint cashflow_prepaid_orders_amount_check check (
  (period = 'month' and months = 1 and amount in (15900, 17700, 27100))
  or (period = 'halfYear' and months = 6 and amount in (84900, 89500))
  or (period = 'year' and months = 12 and amount in (149000, 156200)));

create or replace function public.cashflow_reserve_prepaid_checkout(
  p_user_id uuid,p_order_id text,p_period text,p_method text,p_price_id text,p_livemode boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; o public.cashflow_prepaid_orders; m smallint; a bigint; expiry timestamptz := now()+interval '45 minutes';
begin
  if p_period is null or p_method is null or p_price_id is null or p_livemode is null
    or p_order_id is null or p_user_id is null or p_method not in ('card','promptpay') then raise exception 'invalid_plan'; end if;
  select months,amount into m,a from (values ('month',1,public.cashflow_pro_month_amount(now())),('halfYear',6,89500),('year',12,156200)) as plans(period,months,amount) where period=p_period;
  if not found then raise exception 'invalid_plan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if exists(select 1 from public.subscriptions where user_id=p_user_id and plan='admin_revoked') then
    return jsonb_build_object('result','admin_revoked'); end if;
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
      and p_request#>>'{metadata,consent_version}' in ('krarok-card-20261021-v1','krarok-card-20261021-v2','krarok-card-20261024-v3','krarok-card-20261025-v4')
      and p_request#>>'{metadata,payment_flow}'='custom_card'
      and length(p_request#>>'{metadata,consent_text}')>30
      and p_request#>'{subscription_data,metadata}'=p_request->'metadata' and o.method='card'),false))
    -- The step to the regular price is only for a promotion month, at exactly the regular amount from 1 Dec 2569.
    or (p_request#>>'{metadata,renewal_step_amount}' is not null and not coalesce((o.period='month' and o.amount=17700
      and p_request#>>'{metadata,renewal_step_amount}'='27100' and p_request#>>'{metadata,renewal_step_from}'='2026-12-01'),false))
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

create or replace function public.cashflow_sync_card_subscription(
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
    or coalesce(o.request#>>'{metadata,consent_version}' not in ('krarok-card-20261021-v1','krarok-card-20261021-v2','krarok-card-20261024-v3','krarok-card-20261025-v4'),true)
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

create or replace function public.cashflow_record_card_cycle(
  p_order_id text,p_user_id uuid,p_subscription_id text,p_invoice_id text,p_payment_id text,
  p_amount bigint,p_currency text,p_livemode boolean,p_start timestamptz,p_end timestamptz,p_refunded boolean
) returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; c public.cashflow_card_cycles;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if o.id is null or o.request#>>'{metadata,auto_renew}' is distinct from 'true'
    -- The order's own amount; or the regular month for a promotion month that agreed to the step, from 1 Dec 2569.
    or (o.amount is distinct from p_amount and not coalesce((o.period='month' and o.amount=17700 and p_amount=27100
      and o.request#>>'{metadata,renewal_step_amount}'='27100' and o.request#>>'{metadata,renewal_step_from}'='2026-12-01'
      and p_start>=timestamptz '2026-11-30 17:00:00+00'),false))
    or p_currency is distinct from 'thb' or o.livemode is distinct from p_livemode
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

commit;
