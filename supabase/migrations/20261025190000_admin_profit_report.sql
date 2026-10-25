-- Krarok monthly profit report for the owner (brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25). Additive: two new
-- tables and one read-only function; nothing existing changes. The owner runs it in the Supabase SQL editor; the app
-- never writes SQL. Only the backend (service_role) can use these: row level security on, no policies.
--
-- 1. cashflow_admin_cost_settings: the business's own figures the report needs and the owner may change in the table
--    editor (fixed costs, the dollar rate). Changing one never rewrites a report already made: each report keeps the
--    figures it used.
-- 2. cashflow_admin_reports: one row per month, kept even when accounts are deleted later (their usage and payment rows
--    go with the account), with its delivery state, so a failed LINE delivery never loses the report.
-- 3. cashflow_admin_ai_month: the month's AI cost per account, read from the usage records; read only. Amounts are
--    returned as text so no decimal is rounded on the way.
begin;

create table if not exists public.cashflow_admin_cost_settings (
  key text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  kind text not null check (kind in ('fixed_monthly', 'fixed_yearly', 'fx_usd_thb')),
  label text not null check (length(label) between 1 and 80),
  -- Baht for a fixed cost; baht per US dollar for the rate.
  amount numeric(14, 4) not null check (amount >= 0),
  active boolean not null default true,
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now()
);
-- The owner's figures from the brief (2026-10-25); the rate is the one used in the cost analysis. Kept if already set.
insert into public.cashflow_admin_cost_settings (key, kind, label, amount, note) values
  ('domain', 'fixed_yearly', 'โดเมน', 350, 'ต่อปี'),
  ('coding_tool', 'fixed_monthly', 'เครื่องมือเขียนโค้ด', 750, 'ประมาณต่อเดือน'),
  ('usd_thb', 'fx_usd_thb', 'อัตราแลกเปลี่ยน (บาทต่อดอลลาร์)', 33.5, 'ตั้งเอง แก้ได้')
on conflict (key) do nothing;

create table if not exists public.cashflow_admin_reports (
  id text primary key check (id ~ '^monthly:\d{4}-\d{2}$'),
  month text not null unique check (month ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('COMPLETE', 'PARTIAL', 'UNRECONCILED', 'FAILED')),
  -- Business totals only (what LINE shows), and the per-account figures (internal ids, never sent to LINE).
  metrics jsonb not null,
  accounts jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  note text check (note is null or length(note) <= 600),
  note_cost_usd numeric(12, 6) not null default 0 check (note_cost_usd >= 0),
  delivery jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cashflow_admin_cost_settings enable row level security;
alter table public.cashflow_admin_reports enable row level security;
revoke all on public.cashflow_admin_cost_settings, public.cashflow_admin_reports from public, anon, authenticated;
grant select, insert, update on public.cashflow_admin_cost_settings, public.cashflow_admin_reports to service_role;

create or replace function public.cashflow_admin_ai_month(
  p_start timestamptz, p_end timestamptz, p_daily_cap_usd numeric, p_pro_tokens integer, p_trial_tokens integer
) returns jsonb language sql stable security invoker set search_path = '' as $$
with
  usage_rows as (
    select u.user_id, u.status, u.cost_usd, u.tokens, u.cycle_key, coalesce(u.model, '') as model, u.created_at,
      -- Read through to_jsonb so this also runs where the routing column is missing; a missing value is JSON null there.
      nullif(to_jsonb(u) -> 'routing', 'null'::jsonb) as r,
      case when jsonb_typeof(to_jsonb(u) -> 'routing' -> 'calls') = 'array' then to_jsonb(u) -> 'routing' -> 'calls' else '[]'::jsonb end as calls
    from public.cashflow_ai_usage u
    where u.created_at >= p_start and u.created_at < p_end and u.status in ('settled', 'released')),
  flagged as (
    select g.*,
      exists (select 1 from jsonb_array_elements(g.calls) c where c ->> 'provider' = 'anthropic') or (g.r is null and g.model like 'claude%') as used_claude,
      exists (select 1 from jsonb_array_elements(g.calls) c where c ->> 'provider' = 'gemini') or (g.r is null and g.model like 'gemini%') as used_gemini,
      case when jsonb_typeof(g.r -> 'escalations') = 'array' then jsonb_array_length(g.r -> 'escalations') > 0 else false end as escalated
    from usage_rows g),
  calls as (select f.user_id, c from flagged f, jsonb_array_elements(f.calls) c),
  per_call as (
    select user_id,
      sum((c ->> 'usd')::numeric) filter (where c ->> 'provider' = 'gemini') as gemini_usd,
      sum((c ->> 'usd')::numeric) filter (where c ->> 'provider' = 'anthropic') as claude_usd,
      sum((c ->> 'usd')::numeric) filter (where coalesce(c ->> 'provider', '') not in ('gemini', 'anthropic')) as other_usd,
      sum((c ->> 'input')::bigint) as input_tokens, sum((c ->> 'cached')::bigint) as cache_read_tokens,
      sum((c ->> 'write')::bigint) as cache_write_tokens, sum((c ->> 'write_1h')::bigint) as cache_write_1h_tokens,
      sum((c ->> 'output')::bigint) as output_tokens, sum((c ->> 'thinking')::bigint) as thinking_tokens,
      count(*) filter (where c ->> 'provider' = 'gemini') as gemini_calls,
      count(*) filter (where c ->> 'provider' = 'anthropic') as claude_calls,
      count(*) filter (where (c ->> 'failed')::boolean and c ->> 'provider' = 'gemini') as gemini_failed_calls,
      count(*) filter (where (c ->> 'failed')::boolean and c ->> 'provider' = 'anthropic') as claude_failed_calls
    from calls group by user_id),
  per_row as (
    select user_id,
      count(*) filter (where status = 'settled') as messages,
      count(*) filter (where status = 'released') as failed_requests,
      count(*) filter (where status = 'settled' and used_gemini) as gemini_messages,
      count(*) filter (where status = 'settled' and used_claude) as claude_messages,
      coalesce(sum(tokens) filter (where status = 'settled'), 0) as krarok_tokens,
      sum(cost_usd) as actual_usd,
      sum((r -> 'cost' ->> 'billable_usd')::numeric) as billable_usd,
      sum((r -> 'cost' ->> 'cache_overhead_usd')::numeric) as cache_overhead_usd,
      sum((r -> 'cost' ->> 'failed_attempt_usd')::numeric) as failed_attempt_usd,
      sum((r -> 'cost' ->> 'quota_overrun_usd')::numeric) as quota_overrun_usd,
      sum((r -> 'cost' ->> 'cache_saved_usd')::numeric) as cache_saved_usd,
      sum(cost_usd) filter (where escalated) as escalated_usd,
      -- Older rows and voice carry no per-call routing: their cost goes to the model on the row.
      sum(cost_usd) filter (where jsonb_array_length(calls) = 0 and model like 'gemini%') as gemini_unrouted_usd,
      sum(cost_usd) filter (where jsonb_array_length(calls) = 0 and model like 'claude%') as claude_unrouted_usd,
      sum(cost_usd) filter (where jsonb_array_length(calls) = 0 and model not like 'gemini%' and model not like 'claude%') as unknown_model_usd,
      count(*) filter (where cost_usd > 0 and r -> 'cost' is null) as rows_without_cost_split
    from flagged group by user_id),
  proposals as (
    select user_id, count(*) as prepared, count(*) filter (where status = 'applied') as confirmed
    from public.cashflow_ai_proposals where created_at >= p_start and created_at < p_end group by user_id),
  corrections as (
    select user_id, count(*) as corrections
    from public.cashflow_ai_corrections where created_at >= p_start and created_at < p_end group by user_id),
  -- Krarok Tokens: each cycle the account used this month, counted in full; system admins have no allowance.
  cycles as (
    select u.user_id, u.cycle_key, sum(u.tokens) as used, max(u.created_at) as last_at
    from public.cashflow_ai_usage u
    where u.status in ('reserved', 'settled')
      and (u.user_id, u.cycle_key) in (select user_id, cycle_key from usage_rows)
      and not exists (select 1 from public.cashflow_user_roles x where x.user_id = u.user_id and x.role = 'admin')
    group by 1, 2),
  allowance as (
    select user_id,
      bool_or(used >= case when cycle_key = 'trial' then p_trial_tokens else p_pro_tokens end) as used_up,
      (array_agg(used order by last_at desc))[1] as latest_cycle_used,
      (array_agg(case when cycle_key = 'trial' then p_trial_tokens else p_pro_tokens end order by last_at desc))[1] as latest_cycle_limit
    from cycles group by user_id),
  accounts as (
    select p.user_id, p.messages, p.failed_requests, p.gemini_messages, p.claude_messages, p.krarok_tokens,
      round(coalesce(p.actual_usd, 0), 6)::text as actual_usd,
      round(coalesce(p.billable_usd, 0), 6)::text as billable_usd,
      round(coalesce(p.cache_overhead_usd, 0), 6)::text as cache_overhead_usd,
      round(coalesce(p.failed_attempt_usd, 0), 6)::text as failed_attempt_usd,
      round(coalesce(p.quota_overrun_usd, 0), 6)::text as quota_overrun_usd,
      round(coalesce(p.cache_saved_usd, 0), 6)::text as cache_saved_usd,
      round(coalesce(p.escalated_usd, 0), 6)::text as escalated_usd,
      round(coalesce(c.gemini_usd, 0) + coalesce(p.gemini_unrouted_usd, 0), 6)::text as gemini_usd,
      round(coalesce(c.claude_usd, 0) + coalesce(p.claude_unrouted_usd, 0), 6)::text as claude_usd,
      round(coalesce(c.other_usd, 0) + coalesce(p.unknown_model_usd, 0), 6)::text as other_usd,
      coalesce(c.gemini_calls, 0) as gemini_calls, coalesce(c.claude_calls, 0) as claude_calls,
      coalesce(c.gemini_failed_calls, 0) as gemini_failed_calls, coalesce(c.claude_failed_calls, 0) as claude_failed_calls,
      coalesce(c.input_tokens, 0) as input_tokens, coalesce(c.output_tokens, 0) as output_tokens,
      coalesce(c.cache_read_tokens, 0) as cache_read_tokens,
      coalesce(c.cache_write_tokens, 0) + coalesce(c.cache_write_1h_tokens, 0) as cache_write_tokens,
      coalesce(c.thinking_tokens, 0) as thinking_tokens,
      p.rows_without_cost_split,
      coalesce(q.prepared, 0) as cards_prepared, coalesce(q.confirmed, 0) as cards_confirmed,
      coalesce(k.corrections, 0) as corrections,
      coalesce(a.used_up, false) as tokens_used_up, a.latest_cycle_used, a.latest_cycle_limit,
      exists (select 1 from public.cashflow_user_roles x where x.user_id = p.user_id and x.role = 'admin') as is_admin
    from per_row p
      left join per_call c on c.user_id = p.user_id
      left join proposals q on q.user_id = p.user_id
      left join corrections k on k.user_id = p.user_id
      left join allowance a on a.user_id = p.user_id),
  days as (
    select date_trunc('day', created_at at time zone 'Asia/Bangkok') as day, sum(cost_usd) as usd
    from usage_rows group by 1),
  signals as (
    select * from public.cashflow_ai_knowledge_signals where created_at >= p_start and created_at < p_end)
select jsonb_build_object(
  'accounts', (select coalesce(jsonb_agg(to_jsonb(a) order by a.actual_usd::numeric desc), '[]'::jsonb) from accounts a),
  'coverage', (select jsonb_build_object('rows', count(*), 'with_routing', count(*) filter (where r is not null),
    'with_cost_split', count(*) filter (where r -> 'cost' is not null),
    'cost_without_split_usd', round(coalesce(sum(cost_usd) filter (where cost_usd > 0 and r -> 'cost' is null), 0), 6)::text)
    from usage_rows),
  'days', (select jsonb_build_object('active', count(*),
    'near_cap', count(*) filter (where p_daily_cap_usd > 0 and usd >= p_daily_cap_usd * 0.8),
    'at_cap', count(*) filter (where p_daily_cap_usd > 0 and usd >= p_daily_cap_usd),
    'max_usd', round(coalesce(max(usd), 0), 6)::text) from days),
  'reliability', (select jsonb_build_object(
    'timeouts', count(*) filter (where r ->> 'error' = 'timeout'),
    'errors', count(*) filter (where r ->> 'outcome' = 'error'),
    'held_for_claude', count(*) filter (where r ->> 'outcome' = 'blocked' or r ->> 'fallback' = 'blocked'),
    'gemini_took_over', count(*) filter (where r ->> 'fallback' = 'light'),
    'escalations', count(*) filter (where escalated),
    'provider_retries', coalesce(sum((r ->> 'provider_retries')::int), 0)) from flagged),
  'feedback', jsonb_build_object(
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) as n from signals group by kind) t),
    -- Only questions that two or more accounts asked: a question one person asked could point to them.
    'top_questions', (select coalesce(jsonb_agg(jsonb_build_object('question', question, 'times', times, 'accounts', accounts) order by times desc, question), '[]'::jsonb)
      from (select question, count(*) as times, count(distinct user_id) as accounts from signals
        where question is not null and kind in ('not_found', 'not_available', 'feature_request')
        group by question having count(distinct user_id) >= 2 order by 2 desc, 1 limit 5) t),
    'requested_features', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature_id, 'times', times, 'accounts', accounts) order by times desc, feature_id), '[]'::jsonb)
      from (select feature_id, count(*) as times, count(distinct user_id) as accounts from signals
        where feature_id is not null and kind in ('feature_request', 'not_available')
        group by feature_id having count(distinct user_id) >= 2 order by 2 desc, 1 limit 5) t))
);
$$;
revoke all on function public.cashflow_admin_ai_month(timestamptz, timestamptz, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.cashflow_admin_ai_month(timestamptz, timestamptz, numeric, integer, integer) to service_role;

commit;
