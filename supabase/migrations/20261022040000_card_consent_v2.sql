-- Card renewals with the v2 consent wording (2026-10-22).
-- Release 677c47d moved the card consent to krarok-card-20261021-v2 (shared/cardConsent.ts), but these two
-- checks still accepted only v1. Every new card renewal was refused before Stripe was called (the app showed
-- "บริการไม่พร้อมใช้งาน"), and a paid v2 renewal could not have been recorded. Both versions are accepted now,
-- the same list as ACCEPTED_CARD_CONSENT_VERSIONS: v2 for new renewals, v1 for renewals agreed earlier.
-- Nothing else in either function changes.
begin;
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
      and p_request#>>'{metadata,consent_version}' in ('krarok-card-20261021-v1','krarok-card-20261021-v2')
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
    or coalesce(o.request#>>'{metadata,consent_version}' not in ('krarok-card-20261021-v1','krarok-card-20261021-v2'),true)
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
revoke all on function public.cashflow_prepare_prepaid_checkout(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cashflow_prepare_prepaid_checkout(text,uuid,text,jsonb) to service_role;
revoke all on function public.cashflow_sync_card_subscription(text,uuid,text,text,boolean,text,bigint,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.cashflow_sync_card_subscription(text,uuid,text,text,boolean,text,bigint,boolean,timestamptz) to service_role;
commit;
