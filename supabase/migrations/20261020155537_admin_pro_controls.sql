begin;
alter table public.subscriptions add column if not exists pro_access_reset_at timestamptz;
create table public.cashflow_admin_pro_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null, user_id uuid references auth.users(id) on delete set null,
  operation text not null check(operation in ('grant','revoke','ban','unban')),
  previous_plan text,created_at timestamptz not null default now()
);
alter table public.cashflow_admin_pro_audit enable row level security;
revoke all on public.cashflow_admin_pro_audit from public,anon,authenticated;
grant select,insert on public.cashflow_admin_pro_audit to service_role;
grant usage,select on sequence public.cashflow_admin_pro_audit_id_seq to service_role;
-- The old UI only offered revoke, not a separate ban. Preserve that intent:
-- prior revoked users remain Free but may buy a new package.
update public.subscriptions set plan='admin_removed',status='canceled',pro_access_reset_at=now(),
  current_period_end=null,prepaid_entitled_until=null,billing_closure_pending_until=null
where plan='admin_revoked';
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
  if target.pro_access_reset_at is null and greatest(target.legacy_current_period_end,target.manual_current_period_end) > now() then
    return jsonb_build_object('result','legacy_active','legacy_until',greatest(target.legacy_current_period_end,target.manual_current_period_end));
  end if;
  if target.stripe_subscription_id is not null and target.stripe_subscription_status in
    ('incomplete','trialing','active','past_due','unpaid','paused') then
    return jsonb_build_object('result','managed','customer_id',target.stripe_customer_id);
  end if;
  if target.pro_access_reset_at is null and greatest(target.stripe_entitled_until,target.promptpay_entitled_until) > now() then
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

create or replace function public.cashflow_reserve_prepaid_checkout(
  p_user_id uuid,p_order_id text,p_period text,p_method text,p_price_id text,p_livemode boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; o public.cashflow_prepaid_orders; m smallint; a bigint; expiry timestamptz := now()+interval '45 minutes';
begin
  if p_period is null or p_method is null or p_price_id is null or p_livemode is null
    or p_order_id is null or p_user_id is null or p_method not in ('card','promptpay') then raise exception 'invalid_plan'; end if;
  select months,amount into m,a from (values ('month',1,15900),('halfYear',6,84900),('year',12,149000)) as plans(period,months,amount) where period=p_period;
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

create or replace function public.cashflow_refresh_effective_subscription(p_user_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.subscriptions; effective_end timestamptz; prepaid_end timestamptz;
begin
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if not found then return; end if;
  if s.pro_access_reset_at is not null then
    -- Old payment replays/refunds must never restore a revoked entitlement.
    select max(entitled_until) into prepaid_end from public.cashflow_prepaid_orders
      where user_id=p_user_id and status='paid' and created_at>s.pro_access_reset_at;
    effective_end := prepaid_end;
  else
    prepaid_end := s.prepaid_entitled_until;
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
      when s.stripe_subscription_status is not null then s.stripe_subscription_status
      when effective_end is not null or s.plan in ('pro_monthly','pro_prepaid') then 'canceled'
      else coalesce(s.status,'inactive') end,
    updated_at=now() where user_id=p_user_id;
end; $$;
create function public.cashflow_admin_pro_action(p_actor uuid,p_user_id uuid,p_operation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.subscriptions; stamp timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from public.cashflow_user_roles where user_id=p_actor and role='admin') then
    raise exception 'admin_required' using errcode='42501'; end if;
  if p_operation is null or p_operation not in ('grant','revoke','ban','unban') then raise exception 'invalid_pro_operation'; end if;
  if not exists(select 1 from public.cashflow_user_roles where user_id=p_user_id) then raise exception 'user_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  insert into public.subscriptions(user_id,workspace_type,workspace_id,status,updated_at)
    values(p_user_id,'personal',p_user_id,'inactive',now()) on conflict(user_id) do nothing;
  select * into s from public.subscriptions where user_id=p_user_id for update;
  if p_operation='unban' and s.plan is distinct from 'admin_revoked' then return jsonb_build_object('result','unchanged'); end if;
  if p_operation in ('grant','revoke') and s.plan='admin_revoked' then return jsonb_build_object('result','banned'); end if;
  if p_operation='ban' and s.plan='admin_revoked' then return jsonb_build_object('result','unchanged'); end if;
  -- Share the checkout advisory lock: no check-then-write window and no 15-minute closure marker.
  if s.stripe_checkout_session_id is not null or s.stripe_checkout_pending_until>now()
    or exists(select 1 from public.cashflow_prepaid_orders where user_id=p_user_id and status in ('reserved','open') and request is not null) then
    return jsonb_build_object('result','checkout_pending'); end if;
  if s.stripe_subscription_id is not null and coalesce(s.stripe_subscription_status,'') not in ('canceled','incomplete_expired') then
    return jsonb_build_object('result','subscription_open'); end if;
  if exists(select 1 from public.cashflow_account_pauses where user_id=p_user_id) then
    return jsonb_build_object('result','account_closing'); end if;
  update public.subscriptions set
    plan=case p_operation when 'grant' then 'admin_grant' when 'ban' then 'admin_revoked' else 'admin_removed' end,
    status=case when p_operation='grant' then 'active' else 'canceled' end,
    pro_access_reset_at=case when p_operation in ('revoke','ban') then stamp else pro_access_reset_at end,
    prepaid_entitled_until=case when p_operation in ('revoke','ban') then null else prepaid_entitled_until end,
    current_period_end=case when p_operation in ('revoke','ban','unban') then null else current_period_end end,
    billing_closure_pending_until=null,updated_at=now() where user_id=p_user_id;
  perform public.cashflow_refresh_effective_subscription(p_user_id);
  insert into public.cashflow_admin_pro_audit(actor_id,user_id,operation,previous_plan,created_at)
    values(p_actor,p_user_id,p_operation,s.plan,stamp);
  return jsonb_build_object('result','ok');
end; $$;
revoke all on function public.cashflow_admin_pro_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cashflow_admin_pro_action(uuid,uuid,text) to service_role;

commit;
