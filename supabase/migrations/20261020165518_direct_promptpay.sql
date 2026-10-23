begin;
alter table public.cashflow_prepaid_orders add column intent_id text unique;
alter table public.cashflow_prepaid_orders add constraint prepaid_one_provider check (intent_id is null or session_id is null);

create function public.cashflow_prepare_direct_qr(p_order_id text,p_user_id uuid,p_customer_id text,p_request jsonb)
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
  if o.method<>'promptpay' or o.expires_at<=now() or o.status<>'reserved' or p_request is null
    or p_request->>'customer' is distinct from p_customer_id
    or p_request->>'amount' is distinct from o.amount::text or p_request->>'currency' is distinct from 'thb'
    or p_request->>'confirm' is distinct from 'true'
    or p_request->'allowed_payment_method_types' is distinct from '["promptpay"]'::jsonb
    or p_request#>>'{payment_method_data,type}' is distinct from 'promptpay'
    or nullif(p_request#>>'{payment_method_data,billing_details,email}','') is null
    or p_request#>>'{metadata,app_user_id}' is distinct from p_user_id::text
    or p_request#>>'{metadata,payment_flow}' is distinct from 'direct_promptpay'
    or p_request#>>'{metadata,offer_version}' is distinct from 'krarok_prepaid_20261020'
    or p_request#>>'{metadata,price_id}' is distinct from o.price_id
    or p_request#>>'{metadata,period}' is distinct from o.period
    or p_request#>>'{metadata,months}' is distinct from o.months::text
    or p_request#>>'{metadata,checkout_reservation_id}' is distinct from o.id
    then raise exception 'order_request_mismatch'; end if;
  update public.cashflow_prepaid_orders set customer_id=p_customer_id,request=p_request where id=p_order_id;
  -- No Checkout Session ID is invented. The order's immutable request holds the lock,
  -- including after a timeout, and prevents admin actions while payment is possible.
  return p_request;
end; $$;

create function public.cashflow_attach_direct_qr(p_order_id text,p_user_id uuid,p_intent_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.request#>>'{metadata,payment_flow}' is distinct from 'direct_promptpay'
    or p_intent_id is null or p_intent_id not like 'pi_%' or o.session_id is not null
    or (o.intent_id is not null and o.intent_id<>p_intent_id) then raise exception 'order_intent_mismatch'; end if;
  update public.cashflow_prepaid_orders set intent_id=p_intent_id,
    status=case when status='reserved' then 'open' else status end where id=p_order_id;
end; $$;

create function public.cashflow_finish_direct_qr(p_order_id text,p_user_id uuid,p_intent_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.request#>>'{metadata,payment_flow}' is distinct from 'direct_promptpay'
    or o.intent_id is distinct from p_intent_id or p_intent_id is null then raise exception 'order_intent_mismatch'; end if;
  if o.status in ('paid','refunded') then return; end if;
  update public.cashflow_prepaid_orders set status='expired' where id=p_order_id;
  perform public.cashflow_release_billing_checkout(p_user_id,p_order_id);
end; $$;

create or replace function public.cashflow_fulfill_prepaid(
  p_order_id text,p_user_id uuid,p_session_id text,p_customer_id text,p_payment_id text,
  p_livemode boolean,p_amount bigint,p_currency text,p_period text,p_months smallint,p_paid_at timestamptz,p_refunded boolean
) returns text language plpgsql security invoker set search_path='' as $$
declare o public.cashflow_prepaid_orders; s public.subscriptions; next_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if not found then raise exception 'missing_subscription'; end if;
  select * into o from public.cashflow_prepaid_orders where id=p_order_id and user_id=p_user_id for update;
  if not found or o.request is null or p_payment_id is null or (case when o.request#>>'{metadata,payment_flow}'='direct_promptpay'
      then p_session_id is not null or o.intent_id is distinct from p_payment_id
      else p_session_id is null or o.intent_id is not null end)
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


revoke all on function public.cashflow_prepare_direct_qr(text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.cashflow_attach_direct_qr(text,uuid,text) from public,anon,authenticated;
revoke all on function public.cashflow_finish_direct_qr(text,uuid,text) from public,anon,authenticated;
grant execute on function public.cashflow_prepare_direct_qr(text,uuid,text,jsonb) to service_role;
grant execute on function public.cashflow_attach_direct_qr(text,uuid,text) to service_role;
grant execute on function public.cashflow_finish_direct_qr(text,uuid,text) to service_role;
create or replace function public.cashflow_begin_billing_closure(p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_user_id is null then raise exception 'missing_user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if target.stripe_checkout_session_id is not null or target.stripe_checkout_pending_until > now()
    or exists(select 1 from public.cashflow_prepaid_orders where user_id=p_user_id and status in ('reserved','open') and request is not null) then return false; end if;
  update public.subscriptions set billing_closure_pending_until = now() + interval '15 minutes', updated_at = now()
    where user_id = p_user_id;
  return true;
end;
$$;
commit;
