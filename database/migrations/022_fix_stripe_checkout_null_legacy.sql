-- Forward-only fix for databases that already applied 020/021. A missing
-- legacy entitlement is the normal fresh-account case, not an active grant.
-- This replaces only the attachment function; existing billing rows are kept.
begin;

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

revoke all on function public.cashflow_attach_subscription_checkout(uuid,text,text) from public, anon, authenticated;
grant execute on function public.cashflow_attach_subscription_checkout(uuid,text,text) to service_role;

commit;
