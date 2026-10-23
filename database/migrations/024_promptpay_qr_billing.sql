-- Add one-time PromptPay Checkout without weakening the existing recurring
-- subscription invariants. Billing-cycle promotion usage is account-level, so
-- switching between card and PromptPay never restarts the first-three-cycle
-- offer. This migration is forward-only and does not mutate paid deadlines.
begin;

alter table public.subscriptions
  add column if not exists stripe_intro_paid_cycles smallint not null default 0,
  add column if not exists promptpay_entitled_until timestamptz,
  add column if not exists stripe_checkout_method text,
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_checkout_intro_cycles_remaining smallint;

alter table public.subscriptions
  drop constraint if exists subscriptions_intro_paid_cycles_check,
  drop constraint if exists subscriptions_checkout_method_check,
  drop constraint if exists subscriptions_checkout_intro_remaining_check,
  add constraint subscriptions_intro_paid_cycles_check
    check (stripe_intro_paid_cycles between 0 and 3),
  add constraint subscriptions_checkout_method_check
    check (stripe_checkout_method is null or stripe_checkout_method in ('card','promptpay')),
  add constraint subscriptions_checkout_intro_remaining_check
    check (stripe_checkout_intro_cycles_remaining is null
      or stripe_checkout_intro_cycles_remaining between 0 and 3);

-- The old marker proves at least one discounted card invoice was paid, but it
-- cannot prove how many. Preserve it conservatively as one consumed cycle.
update public.subscriptions
set stripe_intro_paid_cycles = 1
where stripe_intro_redeemed_at is not null and stripe_intro_paid_cycles = 0;

-- A deployment interrupted between 020-023 and this migration can have a
-- pending recurring Checkout. Mark only that already-persisted request as card.
update public.subscriptions
set stripe_checkout_method = 'card',
    stripe_checkout_intro_cycles_remaining = case
      when stripe_checkout_intro_eligible then greatest(0, 3 - stripe_intro_paid_cycles)
      else 0
    end
where stripe_checkout_reservation_id is not null
  and stripe_checkout_method is null
  and stripe_checkout_request->>'mode' = 'subscription';

create table if not exists public.cashflow_billing_paid_cycles (
  source_type text not null check (source_type in ('stripe_invoice','promptpay')),
  source_id text not null check (length(source_id) between 1 and 255),
  user_id uuid not null references auth.users(id) on delete cascade,
  paid_at timestamptz not null,
  intro_discounted boolean not null,
  processed_at timestamptz not null default now(),
  primary key(source_type,source_id)
);
alter table public.cashflow_billing_paid_cycles enable row level security;
revoke all on public.cashflow_billing_paid_cycles from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_billing_paid_cycles to service_role;

create table if not exists public.cashflow_promptpay_payments (
  payment_intent_id text primary key check (length(payment_intent_id) between 1 and 255),
  checkout_session_id text not null unique check (length(checkout_session_id) between 1 and 255),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null check (length(customer_id) between 1 and 255),
  amount bigint not null check (amount in (19900,24900)),
  currency text not null check (currency = 'thb'),
  paid_at timestamptz not null,
  entitled_until timestamptz not null,
  intro_cycle smallint check (intro_cycle between 1 and 3),
  livemode boolean not null,
  refunded boolean not null default false,
  refunded_at timestamptz,
  processed_at timestamptz not null default now(),
  -- A PromptPay purchase is sold as one calendar month, matching the card plan.
  -- PostgreSQL keeps the day-of-month where possible and clamps an end-of-month
  -- purchase to the last valid day of the following month.
  check (entitled_until = paid_at + interval '1 month'),
  check ((not refunded and refunded_at is null) or (refunded and refunded_at is not null))
);
create index if not exists cashflow_promptpay_payments_user
  on public.cashflow_promptpay_payments(user_id,paid_at desc);
alter table public.cashflow_promptpay_payments enable row level security;
revoke all on public.cashflow_promptpay_payments from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_promptpay_payments to service_role;

create table if not exists public.cashflow_promptpay_events (
  event_id text primary key check (length(event_id) between 1 and 255),
  event_type text not null check (length(event_type) between 1 and 255),
  payment_intent_id text not null check (length(payment_intent_id) between 1 and 255),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_created bigint not null check (event_created >= 0),
  livemode boolean not null,
  processed_at timestamptz not null default now()
);
alter table public.cashflow_promptpay_events enable row level security;
revoke all on public.cashflow_promptpay_events from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_promptpay_events to service_role;

-- Old webhook functions clear only the original checkout columns. This trigger
-- clears the new auxiliary fields in the same statement, including during a
-- rolling deployment where old and new function versions overlap briefly.
create or replace function public.cashflow_clear_checkout_auxiliary_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stripe_checkout_reservation_id is null then
    new.stripe_checkout_method := null;
    new.stripe_checkout_url := null;
    new.stripe_checkout_intro_cycles_remaining := null;
  end if;
  return new;
end;
$$;
drop trigger if exists cashflow_clear_checkout_auxiliary_fields on public.subscriptions;
create trigger cashflow_clear_checkout_auxiliary_fields
  before insert or update on public.subscriptions
  for each row execute function public.cashflow_clear_checkout_auxiliary_fields();

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
    target.promptpay_entitled_until
  );
  update public.subscriptions set
    current_period_end = effective_end,
    plan = case
      when target.plan in ('admin_grant','admin_revoked') then target.plan
      when target.manual_current_period_end > now() then 'pro_manual'
      when effective_end is not null or target.stripe_subscription_id is not null then 'pro_monthly'
      else target.plan end,
    status = case
      when target.plan = 'admin_revoked' then 'canceled'
      when target.plan = 'admin_grant' then 'active'
      when effective_end > now() then 'active'
      when target.stripe_subscription_status is not null then target.stripe_subscription_status
      when effective_end is not null then 'canceled'
      when target.plan = 'pro_monthly' then 'canceled'
      else coalesce(target.status,'inactive') end,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function public.cashflow_reserve_billing_checkout(
  p_user_id uuid,
  p_reservation_id text,
  p_method text,
  p_expires_at timestamptz,
  p_pending_until timestamptz,
  p_livemode boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.subscriptions; remaining smallint;
begin
  if p_user_id is null or p_reservation_id is null
    or length(p_reservation_id) not between 1 and 255
    or p_method not in ('card','promptpay')
    or p_expires_at < now() + interval '29 minutes'
    or p_expires_at > now() + interval '55 minutes'
    or p_pending_until <= p_expires_at
    or p_pending_until > p_expires_at + interval '10 minutes'
    or p_pending_until > now() + interval '65 minutes' then
    raise exception 'invalid_checkout_reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if exists(select 1 from public.cashflow_account_pauses where user_id=p_user_id) then
    return jsonb_build_object('result','account_closing');
  end if;
  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into target from public.subscriptions where user_id=p_user_id for update;
  if target.billing_closure_pending_until > now() then return jsonb_build_object('result','account_closing'); end if;
  if target.stripe_livemode is not null and target.stripe_livemode <> p_livemode then return jsonb_build_object('result','mode_mismatch'); end if;
  if target.plan='admin_revoked' then return jsonb_build_object('result','admin_revoked'); end if;
  if target.plan='admin_grant' then return jsonb_build_object('result','admin_grant'); end if;
  if greatest(target.legacy_current_period_end,target.manual_current_period_end) > now() then
    return jsonb_build_object('result','legacy_active','legacy_until',greatest(target.legacy_current_period_end,target.manual_current_period_end));
  end if;
  if target.stripe_subscription_id is not null and target.stripe_subscription_status in
    ('incomplete','trialing','active','past_due','unpaid','paused') then
    return jsonb_build_object('result','managed','customer_id',target.stripe_customer_id);
  end if;
  if greatest(target.stripe_entitled_until,target.promptpay_entitled_until) > now() then
    return jsonb_build_object('result','recurring_access','entitled_until',greatest(target.stripe_entitled_until,target.promptpay_entitled_until));
  end if;
  if target.stripe_checkout_reservation_id is not null
    and (target.stripe_checkout_session_id is not null or target.stripe_checkout_pending_until > now()) then
    if target.stripe_checkout_expires_at is null or target.stripe_checkout_intro_eligible is null then
      return jsonb_build_object('result','pending');
    end if;
    return jsonb_build_object(
      'result','resumed','reservation_id',target.stripe_checkout_reservation_id,
      'session_id',target.stripe_checkout_session_id,'expires_at',target.stripe_checkout_expires_at,
      'pending_until',target.stripe_checkout_pending_until,'customer_id',target.stripe_customer_id,
      'intro_eligible',target.stripe_checkout_intro_eligible,
      'intro_cycles_remaining',target.stripe_checkout_intro_cycles_remaining,
      'method',target.stripe_checkout_method,'url',target.stripe_checkout_url
    );
  end if;
  remaining := greatest(0,3-target.stripe_intro_paid_cycles);
  update public.subscriptions set
    stripe_livemode=coalesce(stripe_livemode,p_livemode),
    stripe_checkout_reservation_id=p_reservation_id,
    stripe_checkout_session_id=null,
    stripe_checkout_expires_at=p_expires_at,
    stripe_checkout_pending_until=p_pending_until,
    stripe_checkout_intro_eligible=remaining>0,
    stripe_checkout_intro_cycles_remaining=remaining,
    stripe_checkout_method=p_method,
    stripe_checkout_url=null,
    stripe_checkout_request=null,
    -- This legacy marker is not the canonical promo counter. Clearing it while
    -- cycles remain lets the existing offer-window RPC accept a resumed card
    -- promotion after a canceled subscription or PromptPay month.
    stripe_intro_redeemed_at=case when remaining>0 then null else stripe_intro_redeemed_at end,
    billing_closure_pending_until=null,
    updated_at=now()
  where user_id=p_user_id;
  return jsonb_build_object('result','reserved','customer_id',target.stripe_customer_id,
    'intro_eligible',remaining>0,'intro_cycles_remaining',remaining,'method',p_method);
end;
$$;

create or replace function public.cashflow_attach_billing_checkout(
  p_user_id uuid,p_reservation_id text,p_session_id text,p_url text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_session_id is null or length(p_session_id) not between 1 and 255
    or p_url is null or length(p_url) not between 1 and 2048 or p_url not like 'https://checkout.stripe.com/%' then
    raise exception 'invalid_checkout_session';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  update public.subscriptions set stripe_checkout_session_id=p_session_id,
    stripe_checkout_url=p_url,updated_at=now()
  where user_id=p_user_id and stripe_checkout_reservation_id=p_reservation_id
    and stripe_checkout_pending_until>now() and stripe_checkout_request is not null
    and (legacy_current_period_end is null or legacy_current_period_end<=now())
    and (manual_current_period_end is null or manual_current_period_end<=now())
    and (stripe_entitled_until is null or stripe_entitled_until<=now())
    and (promptpay_entitled_until is null or promptpay_entitled_until<=now());
  get diagnostics changed=row_count; return changed=1;
end;
$$;

create or replace function public.cashflow_release_billing_checkout(
  p_user_id uuid,p_reservation_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  update public.subscriptions set
    stripe_checkout_reservation_id=null,stripe_checkout_session_id=null,
    stripe_checkout_expires_at=null,stripe_checkout_pending_until=null,
    stripe_checkout_intro_eligible=null,stripe_checkout_request=null,
    stripe_checkout_method=null,stripe_checkout_url=null,
    stripe_checkout_intro_cycles_remaining=null,updated_at=now()
  where user_id=p_user_id and stripe_checkout_reservation_id=p_reservation_id;
  get diagnostics changed=row_count; return changed=1;
end;
$$;

create or replace function public.cashflow_record_subscription_paid_cycle(
  p_user_id uuid,p_invoice_id text,p_paid_at timestamptz,p_intro_discounted boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; target public.subscriptions;
begin
  if p_user_id is null or p_invoice_id is null or length(p_invoice_id) not between 1 and 255
    or p_paid_at is null or p_intro_discounted is null then raise exception 'invalid_paid_cycle'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into target from public.subscriptions where user_id=p_user_id for update;
  if not found then raise exception 'missing_subscription_record'; end if;
  insert into public.cashflow_billing_paid_cycles(source_type,source_id,user_id,paid_at,intro_discounted)
    values('stripe_invoice',p_invoice_id,p_user_id,p_paid_at,p_intro_discounted)
    on conflict(source_type,source_id) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return 'duplicate'; end if;
  if p_intro_discounted then
    if target.stripe_intro_paid_cycles>=3 then raise exception 'intro_cycles_exhausted'; end if;
    update public.subscriptions set stripe_intro_paid_cycles=stripe_intro_paid_cycles+1,updated_at=now()
      where user_id=p_user_id;
  end if;
  return 'applied';
end;
$$;

create or replace function public.cashflow_apply_promptpay_event(
  p_event_id text,p_event_type text,p_event_created bigint,
  p_event_livemode boolean,p_expected_livemode boolean,
  p_user_id uuid,p_customer_id text,p_reservation_id text,
  p_session_id text,p_payment_intent_id text,p_amount bigint,p_currency text,
  p_paid_at timestamptz,p_intro_cycle smallint,p_refund boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; target public.subscriptions; payment public.cashflow_promptpay_payments;
  expected_cycle smallint; expected_amount bigint; next_end timestamptz;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_type is null or p_event_created<0 or p_event_livemode is distinct from p_expected_livemode
    or p_user_id is null or p_customer_id is null or p_session_id is null
    or p_payment_intent_id is null or p_currency<>'thb' or p_paid_at is null then
    raise exception 'invalid_promptpay_event';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into target from public.subscriptions where user_id=p_user_id for update;
  if not found or target.stripe_customer_id is distinct from p_customer_id
    or target.stripe_livemode is distinct from p_event_livemode then raise exception 'promptpay_account_mismatch'; end if;
  insert into public.cashflow_promptpay_events(event_id,event_type,payment_intent_id,user_id,event_created,livemode)
    values(p_event_id,p_event_type,p_payment_intent_id,p_user_id,p_event_created,p_event_livemode)
    on conflict(event_id) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return 'duplicate'; end if;
  if p_refund then
    select * into payment from public.cashflow_promptpay_payments where payment_intent_id=p_payment_intent_id for update;
    if not found or payment.user_id is distinct from p_user_id or payment.checkout_session_id is distinct from p_session_id
      or payment.amount<>p_amount or payment.currency<>p_currency or payment.livemode is distinct from p_event_livemode then
      raise exception 'promptpay_refund_mismatch';
    end if;
    update public.cashflow_promptpay_payments set refunded=true,refunded_at=coalesce(refunded_at,now())
      where payment_intent_id=p_payment_intent_id;
    select max(entitled_until) into next_end from public.cashflow_promptpay_payments
      where user_id=p_user_id and not refunded;
    update public.subscriptions set promptpay_entitled_until=next_end,updated_at=now() where user_id=p_user_id;
    perform public.cashflow_refresh_effective_subscription(p_user_id);
    return 'refunded';
  end if;
  expected_cycle:=least(target.stripe_intro_paid_cycles+1,4);
  expected_amount:=case when expected_cycle<=3 then 19900 else 24900 end;
  if p_amount<>expected_amount or p_intro_cycle is distinct from expected_cycle then
    raise exception 'promptpay_price_cycle_mismatch';
  end if;
  if target.stripe_checkout_reservation_id is distinct from p_reservation_id
    or target.stripe_checkout_session_id is distinct from p_session_id
    or target.stripe_checkout_method is distinct from 'promptpay' then
    raise exception 'promptpay_checkout_reservation_mismatch';
  end if;
  next_end:=p_paid_at+interval '1 month';
  insert into public.cashflow_promptpay_payments(
    payment_intent_id,checkout_session_id,user_id,customer_id,amount,currency,
    paid_at,entitled_until,intro_cycle,livemode
  ) values(
    p_payment_intent_id,p_session_id,p_user_id,p_customer_id,p_amount,p_currency,
    p_paid_at,next_end,case when expected_cycle<=3 then expected_cycle end,p_event_livemode
  ) on conflict(payment_intent_id) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return 'duplicate_payment'; end if;
  insert into public.cashflow_billing_paid_cycles(source_type,source_id,user_id,paid_at,intro_discounted)
    values('promptpay',p_payment_intent_id,p_user_id,p_paid_at,expected_cycle<=3)
    on conflict(source_type,source_id) do nothing;
  if expected_cycle<=3 then
    update public.subscriptions set stripe_intro_paid_cycles=stripe_intro_paid_cycles+1 where user_id=p_user_id;
  end if;
  update public.subscriptions set promptpay_entitled_until=greatest(promptpay_entitled_until,next_end),
    stripe_checkout_reservation_id=null,stripe_checkout_session_id=null,
    stripe_checkout_expires_at=null,stripe_checkout_pending_until=null,
    stripe_checkout_intro_eligible=null,stripe_checkout_request=null,
    stripe_checkout_method=null,stripe_checkout_url=null,
    stripe_checkout_intro_cycles_remaining=null,updated_at=now()
  where user_id=p_user_id;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  return 'applied';
end;
$$;

revoke all on function public.cashflow_clear_checkout_auxiliary_fields() from public, anon, authenticated;
revoke all on function public.cashflow_refresh_effective_subscription(uuid) from public, anon, authenticated;
revoke all on function public.cashflow_reserve_billing_checkout(uuid,text,text,timestamptz,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_attach_billing_checkout(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.cashflow_release_billing_checkout(uuid,text) from public, anon, authenticated;
revoke all on function public.cashflow_record_subscription_paid_cycle(uuid,text,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_apply_promptpay_event(text,text,bigint,boolean,boolean,uuid,text,text,text,text,bigint,text,timestamptz,smallint,boolean) from public, anon, authenticated;
grant execute on function public.cashflow_refresh_effective_subscription(uuid) to service_role;
grant execute on function public.cashflow_reserve_billing_checkout(uuid,text,text,timestamptz,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_attach_billing_checkout(uuid,text,text,text) to service_role;
grant execute on function public.cashflow_release_billing_checkout(uuid,text) to service_role;
grant execute on function public.cashflow_record_subscription_paid_cycle(uuid,text,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_apply_promptpay_event(text,text,bigint,boolean,boolean,uuid,text,text,text,text,bigint,text,timestamptz,smallint,boolean) to service_role;

commit;
