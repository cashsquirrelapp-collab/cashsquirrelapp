-- Pro orders at the prices with the payment fee (owner, 2026-10-25: the customer pays the Stripe fee, so the owner nets
-- ฿159 / ฿849 / ฿1,490 exactly; checkout charges ฿177 / ฿895 / ฿1,562, package 69). Package 69 moved the app and the
-- Stripe catalog but not the database: new orders were still reserved at the old amounts, so checkout refused them.
-- The owner runs this in the Supabase SQL editor; the app never writes SQL. Safe to run more than once.
--
-- 1. Orders may hold either amount: orders bought before 25 Oct keep the amount they were bought at.
-- 2. New orders are reserved at ฿177 / ฿895 / ฿1,562 (in satang). Nothing else in the function changes.
-- No existing order, payment or subscription row is changed.
begin;

do $$
declare c record;
begin
  -- The earlier amount rule has a generated name; find it by what it says.
  for c in select conname from pg_constraint
    where conrelid = 'public.cashflow_prepaid_orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%15900%'
  loop
    execute format('alter table public.cashflow_prepaid_orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.cashflow_prepaid_orders add constraint cashflow_prepaid_orders_amount_check check (
  (period = 'month' and months = 1 and amount in (15900, 17700))
  or (period = 'halfYear' and months = 6 and amount in (84900, 89500))
  or (period = 'year' and months = 12 and amount in (149000, 156200)));

create or replace function public.cashflow_reserve_prepaid_checkout(
  p_user_id uuid,p_order_id text,p_period text,p_method text,p_price_id text,p_livemode boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; o public.cashflow_prepaid_orders; m smallint; a bigint; expiry timestamptz := now()+interval '45 minutes';
begin
  if p_period is null or p_method is null or p_price_id is null or p_livemode is null
    or p_order_id is null or p_user_id is null or p_method not in ('card','promptpay') then raise exception 'invalid_plan'; end if;
  select months,amount into m,a from (values ('month',1,17700),('halfYear',6,89500),('year',12,156200)) as plans(period,months,amount) where period=p_period;
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

commit;
