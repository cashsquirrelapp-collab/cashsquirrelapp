-- Keep explicitly recorded manual paid access independent of refundable ฿149
-- payment history. Do not infer manual provenance from a pro_monthly row.
-- Apply after 022, on both fresh installs and existing 020/021 deployments.
begin;

alter table public.subscriptions
  add column if not exists manual_current_period_end timestamptz;

-- Before this migration, 020/021 copied manual access into the legacy column.
-- Capture its known deadline before reducing the legacy component to actual
-- nonrefunded Payment Link receipts. A previously overwritten pro_manual marker
-- cannot be reconstructed here and needs review against trusted source records.
update public.subscriptions
set manual_current_period_end = coalesce(manual_current_period_end,current_period_end,legacy_current_period_end)
where plan = 'pro_manual';

update public.subscriptions s
set legacy_current_period_end = (
  select max(p.paid_at + interval '30 days')
  from public.cashflow_payments p
  where p.user_id = s.user_id and not p.refunded
)
where s.plan = 'pro_manual';

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
  effective_end := greatest(
    target.manual_current_period_end,
    target.legacy_current_period_end,
    target.stripe_entitled_until
  );

  update public.subscriptions
  set current_period_end = effective_end,
      plan = case
        when target.plan in ('admin_grant','admin_revoked') then target.plan
        when target.manual_current_period_end > now() then 'pro_manual'
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
  if target.legacy_current_period_end > now() or target.manual_current_period_end > now() then
    return jsonb_build_object(
      'result','legacy_active',
      'legacy_until',greatest(target.legacy_current_period_end,target.manual_current_period_end)
    );
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
    and (legacy_current_period_end is null or legacy_current_period_end <= now())
    and (manual_current_period_end is null or manual_current_period_end <= now());
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.cashflow_refresh_effective_subscription(uuid) from public, anon, authenticated;
revoke all on function public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_attach_subscription_checkout(uuid,text,text) from public, anon, authenticated;
grant execute on function public.cashflow_refresh_effective_subscription(uuid) to service_role;
grant execute on function public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean) to service_role;
grant execute on function public.cashflow_attach_subscription_checkout(uuid,text,text) to service_role;

commit;
