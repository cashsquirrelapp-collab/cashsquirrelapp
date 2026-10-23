-- Stripe subscription state is written only by the verified backend webhook.
-- Legacy ฿149 Payment Link access and recurring subscription access are tracked
-- separately so a migration or a failed renewal cannot shorten paid legacy time.
begin;

alter table public.subscriptions
  add column if not exists workspace_type text,
  add column if not exists workspace_id uuid,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_livemode boolean,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_subscription_created bigint,
  add column if not exists stripe_billing_period_end timestamptz,
  add column if not exists stripe_entitled_until timestamptz,
  add column if not exists legacy_current_period_end timestamptz,
  add column if not exists stripe_intro_redeemed_at timestamptz,
  add column if not exists stripe_payment_state text,
  add column if not exists stripe_subscription_event_created bigint,
  add column if not exists stripe_subscription_reconcile_token text,
  add column if not exists stripe_invoice_event_created bigint,
  add column if not exists stripe_last_invoice_id text,
  add column if not exists stripe_checkout_reservation_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_checkout_expires_at timestamptz,
  add column if not exists stripe_checkout_pending_until timestamptz,
  add column if not exists stripe_checkout_intro_eligible boolean,
  add column if not exists stripe_checkout_request jsonb,
  add column if not exists billing_closure_pending_until timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- All pre-migration paid access came from the one-time ฿149 Payment Link or an
-- administrator. Preserve its deadline independently from recurring billing.
update public.subscriptions
set workspace_type = coalesce(workspace_type, 'personal'),
    workspace_id = coalesce(workspace_id, user_id),
    legacy_current_period_end = coalesce(
      legacy_current_period_end,
      case when stripe_subscription_id is null then current_period_end end
    )
where workspace_type is null
   or workspace_id is null
   or (legacy_current_period_end is null and stripe_subscription_id is null);

alter table public.subscriptions
  add constraint subscriptions_workspace_type_check
    check (workspace_type is null or workspace_type = 'personal'),
  add constraint subscriptions_personal_workspace_check
    check (workspace_id is null or workspace_id = user_id),
  add constraint subscriptions_stripe_status_check
    check (stripe_subscription_status is null or stripe_subscription_status in
      ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  add constraint subscriptions_stripe_created_check
    check (stripe_subscription_created is null or stripe_subscription_created >= 0),
  add constraint subscriptions_stripe_payment_state_check
    check (stripe_payment_state is null or stripe_payment_state in
      ('paid','payment_failed','payment_action_required','finalization_failed','async_payment_failed')),
  add constraint subscriptions_stripe_event_created_check
    check (stripe_subscription_event_created is null or stripe_subscription_event_created >= 0),
  add constraint subscriptions_stripe_invoice_event_created_check
    check (stripe_invoice_event_created is null or stripe_invoice_event_created >= 0),
  add constraint subscriptions_stripe_checkout_fields_check
    check (
      (stripe_checkout_reservation_id is null
        and stripe_checkout_session_id is null
        and stripe_checkout_expires_at is null
        and stripe_checkout_pending_until is null
        and stripe_checkout_intro_eligible is null
        and stripe_checkout_request is null)
      or (stripe_checkout_reservation_id is not null
        and stripe_checkout_expires_at is not null
        and stripe_checkout_pending_until is not null
        and stripe_checkout_intro_eligible is not null
        and stripe_checkout_pending_until > stripe_checkout_expires_at)
    );

create unique index if not exists subscriptions_stripe_customer_unique
  on public.subscriptions(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists subscriptions_stripe_subscription_unique
  on public.subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
create unique index if not exists subscriptions_stripe_checkout_session_unique
  on public.subscriptions(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists subscriptions_stripe_pending_checkout
  on public.subscriptions(stripe_checkout_pending_until)
  where stripe_checkout_pending_until is not null;

create table if not exists public.cashflow_stripe_events (
  event_id text primary key check (length(event_id) between 1 and 255),
  event_type text not null check (length(event_type) between 1 and 255),
  object_id text not null check (length(object_id) between 1 and 255),
  object_kind text not null check (object_kind in ('checkout','subscription','invoice')),
  event_created bigint not null check (event_created >= 0),
  livemode boolean not null,
  processed_at timestamptz not null default now()
);
alter table public.cashflow_stripe_events enable row level security;
revoke all on public.cashflow_stripe_events from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_stripe_events to service_role;

create table if not exists public.cashflow_stripe_offer_windows (
  subscription_id text not null check (length(subscription_id) between 1 and 255),
  user_id uuid not null,
  offer_version text not null check (offer_version in ('pro_intro_199x3_then_249_v1','standard_249_v1')),
  discount_start timestamptz,
  discount_end timestamptz,
  processed_at timestamptz not null default now(),
  primary key(subscription_id),
  check (
    (offer_version = 'pro_intro_199x3_then_249_v1' and (
      (discount_start is null and discount_end is null)
      or (discount_start is not null and discount_end > discount_start)
    ))
    or (offer_version = 'standard_249_v1' and discount_start is null and discount_end is null)
  )
);
alter table public.cashflow_stripe_offer_windows enable row level security;
revoke all on public.cashflow_stripe_offer_windows from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_stripe_offer_windows to service_role;

create or replace function public.cashflow_refresh_effective_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.subscriptions;
  effective_end timestamptz;
begin
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found then return; end if;
  effective_end := case
    when target.legacy_current_period_end is null then target.stripe_entitled_until
    when target.stripe_entitled_until is null then target.legacy_current_period_end
    else greatest(target.legacy_current_period_end, target.stripe_entitled_until)
  end;

  update public.subscriptions
  set current_period_end = effective_end,
      plan = case
        when target.plan in ('admin_grant','admin_revoked') then target.plan
        when effective_end is not null or target.stripe_subscription_id is not null then 'pro_monthly'
        else target.plan
      end,
      status = case
        when target.plan = 'admin_revoked' then 'canceled'
        when target.plan = 'admin_grant' then 'active'
        when effective_end > now() then 'active'
        when target.stripe_subscription_status is not null then target.stripe_subscription_status
        when effective_end is not null then 'canceled'
        when target.plan = 'pro_monthly' then 'canceled'
        else coalesce(target.status, 'inactive')
      end,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- Retain the legacy one-time Payment Link processor. It now updates only the
-- legacy entitlement, then recomputes the effective maximum paid-through time.
create or replace function public.cashflow_process_payment(
  p_event_id text,
  p_payment_id text,
  p_user_id uuid,
  p_amount bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_refund boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  legacy_end timestamptz;
begin
  if p_event_id is null or p_payment_id is null or p_user_id is null then
    raise exception 'missing_legacy_payment_field';
  end if;
  if p_amount <> 14900 or p_currency <> 'thb' then raise exception 'invalid_legacy_payment'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.cashflow_payment_events(event_id, created_at)
    values (p_event_id, now()) on conflict(event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return; end if;

  if p_refund then
    insert into public.cashflow_payments(payment_id,user_id,amount,currency,paid_at,refunded)
      values(p_payment_id,p_user_id,p_amount,p_currency,p_paid_at,true)
    on conflict(payment_id) do update set refunded = true;
  else
    insert into public.cashflow_payments(payment_id,user_id,amount,currency,paid_at,refunded)
      values(p_payment_id,p_user_id,p_amount,p_currency,p_paid_at,false)
    on conflict(payment_id) do nothing;
  end if;

  select max(paid_at + interval '30 days') into legacy_end
  from public.cashflow_payments where user_id = p_user_id and not refunded;

  insert into public.subscriptions(
    user_id,workspace_type,workspace_id,status,plan,legacy_current_period_end,current_period_end,updated_at
  ) values(
    p_user_id,'personal',p_user_id,
    case when legacy_end > now() then 'active' else 'canceled' end,
    'pro_monthly',legacy_end,legacy_end,now()
  )
  on conflict(user_id) do update set
    workspace_type = coalesce(public.subscriptions.workspace_type, 'personal'),
    workspace_id = coalesce(public.subscriptions.workspace_id, excluded.workspace_id),
    legacy_current_period_end = excluded.legacy_current_period_end,
    updated_at = now();
  perform public.cashflow_refresh_effective_subscription(p_user_id);
end;
$$;

-- Reserve before any Stripe mutation. The same advisory lock is also used by
-- account closure, preventing a Checkout-vs-pause race.
create or replace function public.cashflow_reserve_subscription_checkout(
  p_user_id uuid,
  p_reservation_id text,
  p_expires_at timestamptz,
  p_pending_until timestamptz,
  p_livemode boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_user_id is null or p_reservation_id is null or length(p_reservation_id) not between 1 and 255
    or p_expires_at < now() + interval '30 minutes'
    or p_expires_at > now() + interval '55 minutes'
    or p_pending_until <= p_expires_at
    or p_pending_until > p_expires_at + interval '10 minutes'
    or p_pending_until > now() + interval '1 hour' then
    raise exception 'invalid_checkout_reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists(select 1 from public.cashflow_account_pauses where user_id = p_user_id) then
    return jsonb_build_object('result','account_closing');
  end if;

  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into target from public.subscriptions where user_id = p_user_id for update;

  if target.billing_closure_pending_until > now() then
    return jsonb_build_object('result','account_closing');
  end if;
  if target.stripe_livemode is not null and target.stripe_livemode <> p_livemode then
    return jsonb_build_object('result','mode_mismatch');
  end if;
  if target.plan = 'admin_revoked' then return jsonb_build_object('result','admin_revoked'); end if;
  if target.plan = 'admin_grant' then return jsonb_build_object('result','admin_grant'); end if;
  if target.legacy_current_period_end > now() then
    return jsonb_build_object('result','legacy_active','legacy_until',target.legacy_current_period_end);
  end if;
  if target.stripe_subscription_id is not null and target.stripe_subscription_status in
    ('incomplete','trialing','active','past_due','unpaid','paused') then
    return jsonb_build_object('result','managed','customer_id',target.stripe_customer_id);
  end if;
  if target.stripe_entitled_until > now() then
    return jsonb_build_object('result','recurring_access','entitled_until',target.stripe_entitled_until);
  end if;
  -- A response can be lost after Stripe creates the Session. While the
  -- reservation is live, every caller resumes the exact same reservation and
  -- persisted request rather than replacing its idempotency key.
  if target.stripe_checkout_reservation_id is not null
    and (target.stripe_checkout_session_id is not null or target.stripe_checkout_pending_until > now()) then
    if target.stripe_checkout_expires_at is null or target.stripe_checkout_intro_eligible is null then
      return jsonb_build_object('result','pending');
    end if;
    return jsonb_build_object(
      'result','resumed',
      'reservation_id',target.stripe_checkout_reservation_id,
      'session_id',target.stripe_checkout_session_id,
      'expires_at',target.stripe_checkout_expires_at,
      'pending_until',target.stripe_checkout_pending_until,
      'customer_id',target.stripe_customer_id,
      'intro_eligible',target.stripe_checkout_intro_eligible
    );
  end if;

  update public.subscriptions set
    stripe_livemode = coalesce(stripe_livemode, p_livemode),
    stripe_checkout_reservation_id = p_reservation_id,
    stripe_checkout_session_id = null,
    stripe_checkout_expires_at = p_expires_at,
    stripe_checkout_pending_until = p_pending_until,
    stripe_checkout_intro_eligible = stripe_intro_redeemed_at is null,
    stripe_checkout_request = null,
    billing_closure_pending_until = null,
    updated_at = now()
  where user_id = p_user_id;
  return jsonb_build_object(
    'result','reserved',
    'customer_id',target.stripe_customer_id,
    'intro_eligible',target.stripe_intro_redeemed_at is null
  );
end;
$$;

-- Store the complete Stripe request before the first create call. PostgreSQL
-- JSONB normalizes object-key order but retains every parameter value; both the
-- first attempt and all retries use this returned value with one idempotency
-- key, so a timeout after Stripe commits cannot create a second Session.
create or replace function public.cashflow_prepare_subscription_checkout(
  p_user_id uuid,
  p_reservation_id text,
  p_request jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'invalid_checkout_request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found
    or target.stripe_checkout_reservation_id is distinct from p_reservation_id
    or target.stripe_checkout_pending_until <= now()
    or target.stripe_checkout_expires_at is null
    or target.stripe_checkout_intro_eligible is null then
    raise exception 'checkout_reservation_lost';
  end if;
  if target.stripe_checkout_session_id is not null then
    raise exception 'checkout_session_already_attached';
  end if;
  if target.stripe_checkout_request is null then
    update public.subscriptions set stripe_checkout_request = p_request, updated_at = now()
      where user_id = p_user_id;
    return p_request;
  end if;
  return target.stripe_checkout_request;
end;
$$;

create or replace function public.cashflow_bind_stripe_customer(
  p_user_id uuid,
  p_reservation_id text,
  p_customer_id text,
  p_livemode boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_customer_id is null or length(p_customer_id) not between 1 and 255 then
    raise exception 'invalid_stripe_customer';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found or target.stripe_checkout_reservation_id is distinct from p_reservation_id
    or target.stripe_checkout_pending_until <= now() then raise exception 'checkout_reservation_lost'; end if;
  if target.stripe_livemode is distinct from p_livemode then raise exception 'stripe_mode_mismatch'; end if;
  if target.stripe_customer_id is not null and target.stripe_customer_id <> p_customer_id then
    raise exception 'stripe_customer_mismatch';
  end if;
  update public.subscriptions set stripe_customer_id = p_customer_id, updated_at = now()
    where user_id = p_user_id;
  return p_customer_id;
end;
$$;

create or replace function public.cashflow_attach_subscription_checkout(
  p_user_id uuid,
  p_reservation_id text,
  p_session_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if p_session_id is null or length(p_session_id) not between 1 and 255 then
    raise exception 'invalid_checkout_session';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.subscriptions set
    stripe_checkout_session_id = p_session_id,
    updated_at = now()
  where user_id = p_user_id
    and stripe_checkout_reservation_id = p_reservation_id
    and stripe_checkout_pending_until > now()
    and stripe_checkout_request is not null
    and (legacy_current_period_end is null or legacy_current_period_end <= now());
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.cashflow_release_subscription_checkout(
  p_user_id uuid,
  p_reservation_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.subscriptions set
    stripe_checkout_reservation_id = null,
    stripe_checkout_session_id = null,
    stripe_checkout_expires_at = null,
    stripe_checkout_pending_until = null,
    stripe_checkout_intro_eligible = null,
    stripe_checkout_request = null,
    updated_at = now()
  where user_id = p_user_id and stripe_checkout_reservation_id = p_reservation_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- If the checkout.completed webhook was missed, a later authenticated billing
-- request can recover the canonical Subscription before clearing the hosted
-- Session. This records lifecycle state only; paid entitlement still requires
-- a separately validated invoice.paid webhook.
create or replace function public.cashflow_recover_completed_subscription_checkout(
  p_user_id uuid,
  p_reservation_id text,
  p_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_created bigint,
  p_price_id text,
  p_livemode boolean,
  p_status text,
  p_billing_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    or p_subscription_created is null or p_subscription_created < 0
    or p_billing_period_end is null then raise exception 'invalid_subscription_state'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found
    or target.stripe_checkout_reservation_id is distinct from p_reservation_id
    or target.stripe_checkout_session_id is distinct from p_session_id
    or target.stripe_checkout_intro_eligible is null
    or target.stripe_customer_id is distinct from p_customer_id
    or target.stripe_livemode is distinct from p_livemode then
    return false;
  end if;
  if target.stripe_subscription_id is distinct from p_subscription_id
    and target.stripe_subscription_id is not null
    and target.stripe_subscription_status not in ('canceled','incomplete_expired') then
    raise exception 'different_managed_subscription';
  end if;
  insert into public.cashflow_stripe_offer_windows(subscription_id,user_id,offer_version)
    values(
      p_subscription_id,
      p_user_id,
      case when target.stripe_checkout_intro_eligible
        then 'pro_intro_199x3_then_249_v1' else 'standard_249_v1' end
    )
  on conflict(subscription_id) do nothing;
  if not exists(
    select 1 from public.cashflow_stripe_offer_windows
    where subscription_id = p_subscription_id
      and user_id = p_user_id
      and offer_version = case when target.stripe_checkout_intro_eligible
        then 'pro_intro_199x3_then_249_v1' else 'standard_249_v1' end
  ) then raise exception 'subscription_offer_version_changed'; end if;
  update public.subscriptions set
    workspace_type = 'personal',
    workspace_id = p_user_id,
    stripe_subscription_id = p_subscription_id,
    stripe_subscription_created = p_subscription_created,
    stripe_price_id = p_price_id,
    stripe_subscription_status = p_status,
    stripe_billing_period_end = p_billing_period_end,
    cancel_at_period_end = p_cancel_at_period_end,
    stripe_checkout_reservation_id = null,
    stripe_checkout_session_id = null,
    stripe_checkout_expires_at = null,
    stripe_checkout_pending_until = null,
    stripe_checkout_intro_eligible = null,
    stripe_checkout_request = null,
    updated_at = now()
  where user_id = p_user_id;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  return true;
end;
$$;

create or replace function public.cashflow_begin_billing_closure(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_user_id is null then raise exception 'missing_user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if target.stripe_checkout_session_id is not null or target.stripe_checkout_pending_until > now() then return false; end if;
  update public.subscriptions set billing_closure_pending_until = now() + interval '15 minutes', updated_at = now()
    where user_id = p_user_id;
  return true;
end;
$$;

drop function if exists public.cashflow_sync_subscription(text,text,text,uuid,uuid,text,text,text,text,timestamptz,boolean);

create or replace function public.cashflow_apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_event_livemode boolean,
  p_expected_livemode boolean,
  p_object_kind text,
  p_object_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_created bigint,
  p_price_id text,
  p_status text,
  p_billing_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_paid_through timestamptz,
  p_payment_state text,
  p_intro_redeemed boolean,
  p_checkout_session_id text,
  p_checkout_reservation_id text,
  p_invoice_period_start timestamptz,
  p_invoice_period_end timestamptz,
  p_invoice_billing_reason text,
  p_offer_version text,
  p_intro_discount_applied boolean,
  p_intro_discount_start timestamptz,
  p_intro_discount_end timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  target public.subscriptions;
  replace_subscription boolean := false;
  apply_subscription_state boolean := false;
  apply_invoice_state boolean := false;
  claim_subscription_reconcile boolean := false;
  offer_window public.cashflow_stripe_offer_windows;
  expected_intro boolean;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_type is null or length(p_event_type) not between 1 and 255
    or p_object_id is null or length(p_object_id) not between 1 and 255
    or p_event_created is null or p_event_created < 0 then raise exception 'invalid_stripe_event'; end if;
  if p_event_livemode is distinct from p_expected_livemode then raise exception 'stripe_event_mode_mismatch'; end if;
  if p_object_kind not in ('checkout','subscription','invoice') then raise exception 'invalid_stripe_object_kind'; end if;
  if p_user_id is null or p_workspace_id is distinct from p_user_id then raise exception 'invalid_workspace'; end if;
  if p_customer_id is null or p_subscription_id is null or p_subscription_created is null
    or p_subscription_created < 0 or p_price_id is null
    or p_billing_period_end is null then raise exception 'missing_subscription_field'; end if;
  if p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    then raise exception 'invalid_subscription_status'; end if;
  if p_payment_state is not null and p_payment_state not in
    ('paid','payment_failed','payment_action_required','finalization_failed','async_payment_failed')
    then raise exception 'invalid_payment_state'; end if;
  if p_paid_through is not null and
    (p_object_kind <> 'invoice' or p_payment_state <> 'paid' or p_status <> 'active') then
    raise exception 'unverified_paid_entitlement';
  end if;
  if p_object_kind = 'invoice' and p_payment_state = 'paid' and (
    p_invoice_period_start is null
    or p_invoice_period_end is null
    or p_invoice_period_end <= p_invoice_period_start
    or p_invoice_period_end < p_invoice_period_start + interval '27 days'
    or p_invoice_period_end > p_invoice_period_start + interval '32 days'
    or p_invoice_billing_reason not in ('subscription_create','subscription_cycle')
    or p_offer_version not in ('pro_intro_199x3_then_249_v1','standard_249_v1')
  ) then raise exception 'invalid_paid_invoice_period'; end if;
  if p_object_kind = 'invoice' and (
    p_offer_version not in ('pro_intro_199x3_then_249_v1','standard_249_v1')
    or p_intro_discount_applied is null
    or (p_intro_discount_applied and (
      p_intro_discount_start is null or p_intro_discount_end <= p_intro_discount_start
    ))
    or (not p_intro_discount_applied and (
      p_intro_discount_start is not null or p_intro_discount_end is not null
    ))
  ) then raise exception 'invalid_invoice_offer'; end if;
  if p_object_kind = 'checkout' and (
    p_checkout_session_id is distinct from p_object_id
    or p_checkout_reservation_id is null
    or p_offer_version not in ('pro_intro_199x3_then_249_v1','standard_249_v1')
    or p_intro_discount_applied is distinct from (p_offer_version = 'pro_intro_199x3_then_249_v1')
    or p_intro_discount_start is not null
    or p_intro_discount_end is not null
  ) then raise exception 'invalid_checkout_offer'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into target from public.subscriptions where user_id = p_user_id for update;
  -- Closure claims and webhook state changes serialize on the same per-user
  -- lock. Raising before recording the event lets Stripe retry after the local
  -- pause/delete/admin mutation completes instead of losing the event.
  if target.billing_closure_pending_until > now() then
    raise exception 'billing_closure_in_progress';
  end if;
  if target.stripe_livemode is not null and target.stripe_livemode <> p_event_livemode then
    raise exception 'stripe_account_mode_mismatch';
  end if;
  if target.stripe_customer_id is null then raise exception 'stripe_customer_not_bound'; end if;
  if target.stripe_customer_id <> p_customer_id then raise exception 'stripe_customer_mismatch'; end if;

  insert into public.cashflow_stripe_events(
    event_id,event_type,object_id,object_kind,event_created,livemode
  ) values(
    p_event_id,p_event_type,p_object_id,p_object_kind,p_event_created,p_event_livemode
  ) on conflict(event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return 'duplicate'; end if;

  if p_object_kind = 'checkout' then
    select * into offer_window from public.cashflow_stripe_offer_windows
      where subscription_id = p_subscription_id;
    if found then
      if offer_window.user_id is distinct from p_user_id
        or offer_window.offer_version is distinct from p_offer_version then
        raise exception 'subscription_offer_version_changed';
      end if;
    else
      if target.stripe_checkout_reservation_id is distinct from p_checkout_reservation_id
        or (target.stripe_checkout_session_id is not null
          and target.stripe_checkout_session_id is distinct from p_checkout_session_id)
        or target.stripe_checkout_intro_eligible is null
        or target.stripe_checkout_intro_eligible is distinct from
          (p_offer_version = 'pro_intro_199x3_then_249_v1') then
        raise exception 'checkout_offer_reservation_mismatch';
      end if;
      insert into public.cashflow_stripe_offer_windows(subscription_id,user_id,offer_version)
        values(p_subscription_id,p_user_id,p_offer_version);
    end if;
  elsif p_object_kind = 'invoice' then
    select * into offer_window from public.cashflow_stripe_offer_windows
      where subscription_id = p_subscription_id;
    if not found then raise exception 'subscription_offer_not_pinned'; end if;
    if offer_window.user_id is distinct from p_user_id
      or offer_window.offer_version is distinct from p_offer_version then
      raise exception 'subscription_offer_version_changed';
    end if;
    if p_offer_version = 'standard_249_v1' then
      if p_intro_discount_applied then raise exception 'unexpected_intro_discount_cycle'; end if;
    elsif p_intro_discount_applied then
      if offer_window.discount_start is null then
        if target.stripe_intro_redeemed_at is not null then
          raise exception 'intro_offer_already_redeemed';
        end if;
        update public.cashflow_stripe_offer_windows
        set discount_start = p_intro_discount_start,
            discount_end = p_intro_discount_end,
            processed_at = now()
        where subscription_id = p_subscription_id;
        offer_window.discount_start := p_intro_discount_start;
        offer_window.discount_end := p_intro_discount_end;
      elsif offer_window.discount_start is distinct from p_intro_discount_start
        or offer_window.discount_end is distinct from p_intro_discount_end then
        raise exception 'intro_discount_window_changed';
      end if;
    end if;

    if p_payment_state = 'paid' then
      if p_offer_version = 'pro_intro_199x3_then_249_v1' then
        if offer_window.discount_end is null then raise exception 'intro_discount_window_unknown'; end if;
        expected_intro := p_invoice_period_start < offer_window.discount_end;
        if p_intro_discount_applied is distinct from expected_intro
          or (expected_intro and p_invoice_period_end > offer_window.discount_end)
          or (not expected_intro and p_invoice_period_start < offer_window.discount_end) then
          raise exception 'unexpected_intro_discount_cycle';
        end if;
      elsif p_intro_discount_applied then
        raise exception 'unexpected_intro_discount_cycle';
      end if;
      if p_intro_redeemed is distinct from p_intro_discount_applied then
        raise exception 'intro_redemption_mismatch';
      end if;
    end if;
  end if;

  replace_subscription := target.stripe_subscription_id is null
    or target.stripe_subscription_id = p_subscription_id
    or (
      target.stripe_subscription_status in ('canceled','incomplete_expired')
      and p_subscription_created > coalesce(target.stripe_subscription_created, -1)
    )
    or (
      p_object_kind = 'checkout'
      and p_checkout_session_id is not null
      and target.stripe_checkout_session_id = p_checkout_session_id
    );
  if not replace_subscription then return 'obsolete_subscription'; end if;
  if target.stripe_subscription_id is distinct from p_subscription_id then
    apply_subscription_state := true;
  else
    apply_subscription_state := target.stripe_subscription_event_created is null
      or p_event_created > target.stripe_subscription_event_created;
  end if;
  claim_subscription_reconcile := target.stripe_subscription_id is distinct from p_subscription_id
    or target.stripe_subscription_event_created is null
    or p_event_created >= target.stripe_subscription_event_created;
  apply_invoice_state := p_object_kind = 'invoice' and (
    target.stripe_invoice_event_created is null or p_event_created >= target.stripe_invoice_event_created
  );

  if apply_subscription_state then
    update public.subscriptions set
      workspace_type = 'personal',
      workspace_id = p_workspace_id,
      stripe_customer_id = coalesce(stripe_customer_id, p_customer_id),
      stripe_subscription_id = p_subscription_id,
      stripe_subscription_created = p_subscription_created,
      stripe_price_id = p_price_id,
      stripe_livemode = p_event_livemode,
      stripe_subscription_status = p_status,
      stripe_billing_period_end = p_billing_period_end,
      stripe_subscription_event_created = p_event_created,
      stripe_subscription_reconcile_token = p_event_id,
      cancel_at_period_end = p_cancel_at_period_end,
      updated_at = now()
    where user_id = p_user_id;
  elsif claim_subscription_reconcile then
    -- Do not trust either same-second payload as newer. Hand reconciliation to
    -- the last serialized handler, which will re-read Stripe after this write.
    update public.subscriptions set
      stripe_subscription_reconcile_token = p_event_id,
      updated_at = now()
    where user_id = p_user_id;
  end if;

  if apply_invoice_state then
    update public.subscriptions set
      stripe_payment_state = p_payment_state,
      stripe_invoice_event_created = p_event_created,
      stripe_last_invoice_id = p_object_id,
      updated_at = now()
    where user_id = p_user_id;
  end if;
  if p_paid_through is not null then
    update public.subscriptions set
      stripe_entitled_until = case
        when stripe_entitled_until is null then p_paid_through
        else greatest(stripe_entitled_until, p_paid_through)
      end,
      updated_at = now()
    where user_id = p_user_id;
  end if;
  if p_intro_redeemed then
    update public.subscriptions set stripe_intro_redeemed_at = coalesce(stripe_intro_redeemed_at, now())
      where user_id = p_user_id;
  end if;
  if p_object_kind = 'checkout' and p_checkout_session_id is not null then
    update public.subscriptions set
      stripe_checkout_reservation_id = null,
      stripe_checkout_session_id = null,
      stripe_checkout_expires_at = null,
      stripe_checkout_pending_until = null,
      stripe_checkout_intro_eligible = null,
      stripe_checkout_request = null,
      updated_at = now()
    where user_id = p_user_id
      and (stripe_checkout_session_id = p_checkout_session_id or stripe_checkout_session_id is null);
  end if;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  return case when apply_subscription_state or apply_invoice_state or p_paid_through is not null
    then 'applied' else 'stale' end;
end;
$$;

-- Event timestamps have only one-second precision. After applying the event,
-- the webhook retrieves the Subscription again and writes that canonical
-- Stripe snapshot through this function, so distinct same-second events cannot
-- leave an older delivered payload as the final state.
create or replace function public.cashflow_reconcile_stripe_subscription_state(
  p_event_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_subscription_created bigint,
  p_price_id text,
  p_livemode boolean,
  p_status text,
  p_billing_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare target public.subscriptions;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 255 then raise exception 'invalid_stripe_event'; end if;
  if p_user_id is null or p_workspace_id is distinct from p_user_id then raise exception 'invalid_workspace'; end if;
  if p_customer_id is null or p_subscription_id is null or p_subscription_created is null
    or p_subscription_created < 0 or p_price_id is null or p_billing_period_end is null then
    raise exception 'missing_subscription_field';
  end if;
  if p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    then raise exception 'invalid_subscription_status'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into target from public.subscriptions where user_id = p_user_id for update;
  if not found then raise exception 'missing_subscription_record'; end if;
  if target.billing_closure_pending_until > now() then raise exception 'billing_closure_in_progress'; end if;
  if target.stripe_subscription_reconcile_token is distinct from p_event_id then return 'superseded'; end if;
  if target.stripe_livemode is distinct from p_livemode then raise exception 'stripe_account_mode_mismatch'; end if;
  if target.stripe_customer_id is distinct from p_customer_id then raise exception 'stripe_customer_mismatch'; end if;
  if target.stripe_subscription_id is distinct from p_subscription_id then
    if target.stripe_subscription_status not in ('canceled','incomplete_expired')
      or p_subscription_created <= coalesce(target.stripe_subscription_created, -1) then
      return 'obsolete_subscription';
    end if;
  end if;

  update public.subscriptions set
    workspace_type = 'personal',
    workspace_id = p_workspace_id,
    stripe_subscription_id = p_subscription_id,
    stripe_subscription_created = p_subscription_created,
    stripe_price_id = p_price_id,
    stripe_subscription_status = p_status,
    stripe_billing_period_end = p_billing_period_end,
    stripe_subscription_reconcile_token = null,
    cancel_at_period_end = p_cancel_at_period_end,
    updated_at = now()
  where user_id = p_user_id;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  return 'reconciled';
end;
$$;

revoke all on function public.cashflow_refresh_effective_subscription(uuid) from public, anon, authenticated;
revoke all on function public.cashflow_process_payment(text,text,uuid,bigint,text,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_prepare_subscription_checkout(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.cashflow_bind_stripe_customer(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_attach_subscription_checkout(uuid,text,text) from public, anon, authenticated;
revoke all on function public.cashflow_release_subscription_checkout(uuid,text) from public, anon, authenticated;
revoke all on function public.cashflow_recover_completed_subscription_checkout(uuid,text,text,text,text,bigint,text,boolean,text,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_begin_billing_closure(uuid) from public, anon, authenticated;
revoke all on function public.cashflow_apply_stripe_subscription_event(text,text,bigint,boolean,boolean,text,text,uuid,uuid,text,text,bigint,text,text,timestamptz,boolean,timestamptz,text,boolean,text,text,timestamptz,timestamptz,text,text,boolean,timestamptz,timestamptz)
  from public, anon, authenticated;
revoke all on function public.cashflow_reconcile_stripe_subscription_state(text,uuid,uuid,text,text,bigint,text,boolean,text,timestamptz,boolean)
  from public, anon, authenticated;

grant execute on function public.cashflow_refresh_effective_subscription(uuid) to service_role;
grant execute on function public.cashflow_process_payment(text,text,uuid,bigint,text,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_prepare_subscription_checkout(uuid,text,jsonb) to service_role;
grant execute on function public.cashflow_bind_stripe_customer(uuid,text,text,boolean) to service_role;
grant execute on function public.cashflow_attach_subscription_checkout(uuid,text,text) to service_role;
grant execute on function public.cashflow_release_subscription_checkout(uuid,text) to service_role;
grant execute on function public.cashflow_recover_completed_subscription_checkout(uuid,text,text,text,text,bigint,text,boolean,text,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_begin_billing_closure(uuid) to service_role;
grant execute on function public.cashflow_apply_stripe_subscription_event(text,text,bigint,boolean,boolean,text,text,uuid,uuid,text,text,bigint,text,text,timestamptz,boolean,timestamptz,text,boolean,text,text,timestamptz,timestamptz,text,text,boolean,timestamptz,timestamptz)
  to service_role;
grant execute on function public.cashflow_reconcile_stripe_subscription_state(text,uuid,uuid,text,text,bigint,text,boolean,text,timestamptz,boolean)
  to service_role;

commit;
