-- เลขากระรอก learning and model routing report (learning package D and routing V2, 2026-10-25). READ ONLY: it changes nothing.
-- Run it in the Supabase SQL editor (weekly, or whenever you like) and copy the one JSON result back to Claude Code;
-- Claude Code proposes changes to the feature knowledge, prompts or tools from it, and you approve them.
-- No user ids, e-mails or names leave this query; questions were stored without numbers or contact details.
with
  usage7 as (select * from public.cashflow_ai_usage where status = 'settled' and created_at >= now() - interval '7 days'),
  usage30 as (select * from public.cashflow_ai_usage where status = 'settled' and created_at >= now() - interval '30 days'),
  props30 as (select * from public.cashflow_ai_proposals where created_at >= now() - interval '30 days'),
  corr30 as (select * from public.cashflow_ai_corrections where created_at >= now() - interval '30 days'),
  sig7 as (select * from public.cashflow_ai_knowledge_signals where created_at >= now() - interval '7 days'),
  sig30 as (select * from public.cashflow_ai_knowledge_signals where created_at >= now() - interval '30 days'),
  -- Model routing V2 (2026-10-25). Read through to_jsonb so this report also runs before 20261025130000_ai_routing_log.sql
  -- adds the column (the routing parts are then empty).
  route7 as (
    select u.cost_usd, to_jsonb(u)->'routing' as r from public.cashflow_ai_usage u
    where u.status in ('settled', 'released') and u.created_at >= now() - interval '7 days' and jsonb_typeof(to_jsonb(u)->'routing') = 'object'),
  route7f as (
    select cost_usd, r, coalesce(r->>'tier', '-') as tier, coalesce(r->>'intent', '-') as intent, (r->>'latency_ms')::numeric as ms,
      exists (select 1 from jsonb_array_elements(coalesce(r->'calls', '[]'::jsonb)) c where c->>'provider' = 'anthropic') as smart_used,
      jsonb_array_length(coalesce(r->'escalations', '[]'::jsonb)) > 0 as escalated,
      coalesce((r->>'handed_off')::boolean, false) as handed_over,
      coalesce(r->>'outcome', '-') as outcome
    from route7),
  route_calls as (select c as call from route7, jsonb_array_elements(coalesce(r->'calls', '[]'::jsonb)) c),
  route_cards as (
    select f.cost_usd, f.smart_used,
      (select count(*) from jsonb_array_elements_text(f.r->'proposal_ids') pid join public.cashflow_ai_proposals p on p.id = pid.value) as prepared,
      (select count(*) from jsonb_array_elements_text(f.r->'proposal_ids') pid join public.cashflow_ai_proposals p on p.id = pid.value where p.status = 'applied') as confirmed
    from route7f f where jsonb_array_length(coalesce(f.r->'proposal_ids', '[]'::jsonb)) > 0),
  -- Cost brief (2026-10-25): real spend per day and month (failed requests included), per account (no ids), trial.
  spend as (
    select u.user_id, u.cycle_key, u.cost_usd, u.tokens, u.status, (u.created_at at time zone 'Asia/Bangkok') as local_at,
      coalesce(u.model, '') like 'claude%' as sonnet
    from public.cashflow_ai_usage u where u.created_at >= now() - interval '95 days'),
  month_now as (select date_trunc('month', now() at time zone 'Asia/Bangkok') as start),
  per_account as (
    select user_id, sum(cost_usd) as usd, sum(tokens) as tokens from spend, month_now
    where local_at >= month_now.start and cycle_key <> 'trial' group by user_id),
  sonnet_hours as (
    select date_trunc('hour', local_at) as hour, count(*) as messages from spend
    where sonnet and local_at >= (now() at time zone 'Asia/Bangkok') - interval '7 days' group by 1)
select jsonb_build_object(
  'generated_at', now(),
  -- Cost: per message (the real provider cost in USD and the Krarok tokens charged), by route and by model.
  'cost_7_days', (select jsonb_build_object('messages', count(*), 'usd_total', round(coalesce(sum(cost_usd), 0), 4),
    'usd_per_message', round(coalesce(avg(cost_usd), 0), 6), 'tokens_per_message', round(coalesce(avg(tokens), 0), 2),
    'active_accounts', count(distinct user_id)) from usage7),
  'cost_by_route_7_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select coalesce(route, 'none') as route, count(*) as messages, round(avg(cost_usd), 6) as usd_per_message from usage7 group by route order by 2 desc) r),
  'cost_by_model_7_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select coalesce(model, 'none') as model, count(*) as messages, round(avg(cost_usd), 6) as usd_per_message from usage7 group by model order by 2 desc) r),
  'usd_per_active_account_30_days', (select round(coalesce(sum(cost_usd) / nullif(count(distinct user_id), 0), 0), 4) from usage30),
  -- Commands: cards prepared, confirmed and cancelled per kind (document success = confirmed / prepared).
  'cards_30_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select kind, count(*) as prepared, count(*) filter (where status = 'applied') as confirmed, count(*) filter (where status = 'cancelled') as cancelled
    from props30 group by kind order by 2 desc) r),
  -- Corrections: what people fixed, and how often per 100 confirmed cards (lower is better).
  'corrections_30_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select domain, count(*) as corrections, count(distinct user_id) as accounts from corr30 group by domain order by 2 desc) r),
  'corrections_per_100_confirmed_cards', (select round(100.0 * (select count(*) from corr30) / nullif((select count(*) from props30 where status = 'applied'), 0), 1)),
  'expense_category_fixes_per_100_new_expenses', (select round(100.0 * (select count(*) from corr30 where domain = 'expense_category')
    / nullif((select count(*) from props30 where kind = 'add_expense' and status = 'applied'), 0), 1)),
  -- Feature knowledge: what people could not find, asked for, or got a wrong menu answer about.
  'signals_7_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select kind, coalesce(feature_id, '-') as feature, count(*) as times, count(distinct user_id) as accounts from sig7 group by kind, feature_id order by 3 desc limit 30) r),
  'questions_7_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select kind, question, count(*) as times from sig7 where question is not null group by kind, question order by 3 desc limit 25) r),
  'wrong_answers_by_prompt_30_days', (select coalesce(jsonb_agg(row_to_json(r)), '[]') from (
    select s.prompt_version, count(*) as wrong_answers, (select count(*) from usage30 u where u.prompt_version = s.prompt_version) as messages
    from sig30 s where s.kind = 'wrong_answer' group by s.prompt_version order by 1) r),
  -- Routing: how often Sonnet is used and what for, exact answers without a model, escalations (Gemini could not
  -- finish), failed routing (handed over, held back while Sonnet was down, errors, empty or stuck answers), retries.
  'routing_7_days', (select jsonb_build_object('messages_logged', count(*),
    'sonnet_message_share', round(coalesce(avg(case when smart_used then 1.0 else 0 end), 0), 3),
    'direct_answers', count(*) filter (where tier = 'direct'),
    'escalation_rate', round(coalesce(avg(case when escalated then 1.0 else 0 end), 0), 3),
    'failed_routing_rate', round(coalesce(avg(case when handed_over or outcome in ('blocked', 'error', 'empty', 'max_steps') then 1.0 else 0 end), 0), 3),
    'handed_over', count(*) filter (where handed_over), 'held_back_for_sonnet', count(*) filter (where outcome = 'blocked'),
    'light_took_over', count(*) filter (where r->>'fallback' = 'light'), 'errors', count(*) filter (where outcome = 'error'),
    'provider_retries', coalesce(sum((r->>'provider_retries')::int), 0)) from route7f),
  'routing_by_tier_7_days', (select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
    select tier, count(*) as messages, round(avg(cost_usd), 6) as usd_per_message,
      round((percentile_cont(0.5) within group (order by ms))::numeric) as p50_ms, round((percentile_cont(0.9) within group (order by ms))::numeric) as p90_ms
    from route7f group by tier order by 2 desc) t),
  'routing_by_intent_7_days', (select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
    select intent, count(*) as messages, round(avg(case when smart_used then 1.0 else 0 end), 3) as sonnet_share, round(avg(cost_usd), 6) as usd_per_message
    from route7f group by intent order by 2 desc) t),
  'cost_by_provider_7_days', (select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
    select call->>'provider' as provider, count(*) as calls, round(sum((call->>'usd')::numeric), 4) as usd from route_calls group by 1 order by 3 desc) t),
  'escalations_7_days', (select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
    -- answered_in_one_round: Sonnet answered without a tool, a hint the step up may not have been needed.
    select reason, count(*) as times,
      count(*) filter (where f.outcome = 'answer' and exists (select 1 from jsonb_array_elements(f.r->'calls') c where c->>'provider' = 'anthropic' and (c->>'steps')::int <= 1)) as answered_in_one_round
    from route7f f, jsonb_array_elements_text(f.r->'escalations') reason group by reason order by 2 desc) t),
  'actions_7_days', (select jsonb_build_object('cards_prepared', coalesce(sum(prepared), 0), 'cards_confirmed', coalesce(sum(confirmed), 0),
    'confirmed_share_gemini', round(sum(confirmed) filter (where not smart_used) / nullif(sum(prepared) filter (where not smart_used), 0), 3),
    'confirmed_share_sonnet', round(sum(confirmed) filter (where smart_used) / nullif(sum(prepared) filter (where smart_used), 0), 3),
    'usd_per_confirmed_card', round(sum(cost_usd) / nullif(sum(confirmed), 0), 6)) from route_cards),
  -- Money: real spend by day and month, what users paid in tokens, and the app's own share (platform overhead).
  'spend_by_day_14_days', (select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]') from (
    select local_at::date as day, round(sum(cost_usd), 4) as usd, count(*) as requests, count(*) filter (where sonnet) as sonnet_requests,
      sum(tokens) as tokens_charged
    from spend where local_at >= (now() at time zone 'Asia/Bangkok')::date - 13 group by 1) t),
  'spend_by_month', (select coalesce(jsonb_agg(row_to_json(t) order by t.month), '[]') from (
    select to_char(date_trunc('month', local_at), 'YYYY-MM') as month, round(sum(cost_usd), 4) as usd, count(*) as requests,
      count(distinct user_id) as accounts, round(sum(cost_usd) filter (where cycle_key = 'trial'), 4) as trial_usd
    from spend group by 1) t),
  'cost_per_paid_account_this_month', (select jsonb_build_object('accounts', count(*),
    'usd_avg', round(coalesce(avg(usd), 0), 4), 'usd_p50', round(coalesce((percentile_cont(0.5) within group (order by usd))::numeric, 0), 4),
    'usd_p90', round(coalesce((percentile_cont(0.9) within group (order by usd))::numeric, 0), 4), 'usd_max', round(coalesce(max(usd), 0), 4),
    'tokens_avg', round(coalesce(avg(tokens), 0), 1), 'tokens_max', coalesce(max(tokens), 0)) from per_account),
  'platform_overhead_7_days', (select jsonb_build_object(
    'actual_usd', round(coalesce(sum((r->'cost'->>'actual_usd')::numeric), 0), 4),
    'billable_usd', round(coalesce(sum((r->'cost'->>'billable_usd')::numeric), 0), 4),
    'shared_cache_write_usd', round(coalesce(sum((r->'cost'->>'cache_overhead_usd')::numeric), 0), 4),
    'failed_attempts_usd', round(coalesce(sum((r->'cost'->>'failed_attempt_usd')::numeric), 0), 4),
    'quota_overrun_usd', round(coalesce(sum((r->'cost'->>'quota_overrun_usd')::numeric), 0), 4),
    'cache_read_savings_usd', round(coalesce(sum((r->'cost'->>'cache_saved_usd')::numeric), 0), 4),
    'soft_budget_requests', count(*) filter (where r->>'budget' = 'soft')) from route7 where r ? 'cost'),
  -- Whether the 1-hour shared cache pays off: it costs one 2x write per active hour and wins when an hour has two or
  -- more Sonnet messages; with mostly one, the 5-minute cache would be cheaper.
  'sonnet_hours_7_days', (select jsonb_build_object('active_hours', count(*), 'hours_with_one', count(*) filter (where messages = 1),
    'hours_with_two_or_more', count(*) filter (where messages >= 2), 'messages', coalesce(sum(messages), 0)) from sonnet_hours),
  -- Memory: how many accounts keep memories, and of which kinds.
  'memories', (select jsonb_build_object('accounts', count(distinct user_id), 'total', count(*),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) as n from public.cashflow_ai_memories group by kind) k)) from public.cashflow_ai_memories)
) as report;
