-- เลขากระรอก cost accounting (owner's cost brief, 2026-10-25). Additive and backward compatible: the app works the same
-- before and after this runs. The owner runs it in the Supabase SQL editor; the app never writes SQL.
--
-- 1. cashflow_ai_reserve: same arguments and rules as before; it now also returns what the whole app has spent today,
--    so the backend can stop optional Sonnet use before the daily cap (soft alert) and refuse a request that would
--    pass the cap before it starts (hard stop), and how many Sonnet answers the app gave in the last hour, which picks
--    the cheaper cache for the shared rules (1 hour while busy, 5 minutes while quiet).
-- 2. cashflow_ai_settle_capped: settles one request like cashflow_ai_settle, but never charges more Krarok Tokens than
--    the account has left this cycle, under the same per-account lock as the reservation, so two messages sent at once
--    cannot take the account past its allowance. Returns the tokens charged. Settling twice changes nothing.
begin;

create or replace function public.cashflow_ai_reserve(
  p_user_id uuid, p_cycle text, p_request_id uuid, p_tokens integer,
  p_token_limit integer, p_request_limit integer, p_daily_cap_usd numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare used_tokens bigint; used_requests bigint; spent_today numeric; smart_last_hour bigint;
begin
  if p_tokens is null or p_tokens < 0 or p_tokens > 1000 then raise exception using errcode='22023', message='invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_cycle, 0));
  select coalesce(sum(cost_usd), 0) into spent_today from public.cashflow_ai_usage
    where created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  if p_daily_cap_usd is not null and spent_today >= p_daily_cap_usd then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap', 'spent_today_usd', spent_today);
  end if;
  select coalesce(sum(tokens), 0), count(*) into used_tokens, used_requests from public.cashflow_ai_usage
    where user_id = p_user_id and cycle_key = p_cycle and status in ('reserved','settled');
  if p_request_limit is not null and used_requests >= p_request_limit then
    return jsonb_build_object('ok', false, 'reason', 'requests', 'used_requests', used_requests);
  end if;
  if p_token_limit is not null and used_tokens >= p_token_limit then
    return jsonb_build_object('ok', false, 'reason', 'tokens', 'used_tokens', used_tokens);
  end if;
  insert into public.cashflow_ai_usage (request_id, user_id, cycle_key, tokens, status)
    values (p_request_id, p_user_id, p_cycle, p_tokens, 'reserved');
  select count(*) into smart_last_hour from public.cashflow_ai_usage
    where created_at >= now() - interval '1 hour' and status = 'settled' and model like 'claude%';
  return jsonb_build_object('ok', true, 'used_tokens', used_tokens + p_tokens, 'used_requests', used_requests + 1,
    'spent_today_usd', spent_today, 'smart_last_hour', smart_last_hour);
end;
$$;

create or replace function public.cashflow_ai_settle_capped(
  p_user_id uuid, p_cycle text, p_request_id uuid, p_tokens integer, p_cost_usd numeric,
  p_model text, p_route text, p_prompt_version text, p_release boolean, p_token_limit integer
) returns integer language plpgsql security invoker set search_path = '' as $$
declare others bigint; charged integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_cycle, 0));
  select coalesce(sum(tokens), 0) into others from public.cashflow_ai_usage
    where user_id = p_user_id and cycle_key = p_cycle and status in ('reserved','settled') and request_id <> p_request_id;
  charged := case when p_release then 0
    when p_token_limit is null then greatest(coalesce(p_tokens, 0), 0)
    else least(greatest(coalesce(p_tokens, 0), 0), greatest(p_token_limit - others, 0))::integer end;
  update public.cashflow_ai_usage set
    tokens = charged,
    cost_usd = greatest(coalesce(p_cost_usd, 0), 0),
    status = case when p_release then 'released' else 'settled' end,
    model = p_model, route = p_route, prompt_version = p_prompt_version, settled_at = now()
  where request_id = p_request_id and user_id = p_user_id and status = 'reserved';
  if not found then
    select tokens into charged from public.cashflow_ai_usage where request_id = p_request_id and user_id = p_user_id;
  end if;
  return coalesce(charged, 0);
end;
$$;

revoke all on function public.cashflow_ai_settle_capped(uuid,text,uuid,integer,numeric,text,text,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.cashflow_ai_settle_capped(uuid,text,uuid,integer,numeric,text,text,text,boolean,integer) to service_role;

commit;
