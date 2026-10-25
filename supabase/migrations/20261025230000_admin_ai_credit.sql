-- AI credit and reserve for the owner (2026-10-25: "แจ้งเตือนกูด้วยว่าถ้าโทเค็น AI ตัวไหนกำลังจะหมด ... ต้องมีเงินสำรอง
-- ประมาณนี้เพื่อไปเติม API ของตัวนี้"). Anthropic and Google do not let the app read the credit left on the account, so
-- the owner records the balance the provider's console shows (after a top-up, or whenever), and the app takes off what
-- it measured since then. The owner runs this in the Supabase SQL editor; the app never writes SQL.
-- Safe to run more than once. Nothing existing is changed.

create table if not exists public.cashflow_admin_ai_credit (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('anthropic', 'google')),
  balance_usd numeric(12, 4) not null check (balance_usd >= 0 and balance_usd < 1000000),
  recorded_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cashflow_admin_ai_credit_latest on public.cashflow_admin_ai_credit (provider, recorded_at desc);
alter table public.cashflow_admin_ai_credit enable row level security;
-- No policies: only the server (service role) reads or writes it, after checking the owner.
revoke all on public.cashflow_admin_ai_credit from anon, authenticated;
grant select, insert on public.cashflow_admin_ai_credit to service_role;

-- What each AI provider cost per Bangkok day, from the usage rows: the per-call amounts of the routing log when there is
-- one (a request can use both providers), otherwise the row's own cost by its model (older rows, voice notes).
create or replace function public.cashflow_admin_ai_provider_spend(p_from timestamptz, p_to timestamptz)
returns table (provider text, day date, usd numeric, requests bigint)
language sql
stable
security definer
set search_path = public
as $$
  with usage_rows as (
    select u.created_at, coalesce(u.cost_usd, 0)::numeric as cost_usd, coalesce(u.model, '') as model,
      nullif(to_jsonb(u) -> 'routing', 'null'::jsonb) as routing
    from public.cashflow_ai_usage u
    where u.created_at >= p_from and u.created_at < p_to
  ),
  with_calls as (
    select r.*, case when jsonb_typeof(r.routing -> 'calls') = 'array' and jsonb_array_length(r.routing -> 'calls') > 0 then r.routing -> 'calls' end as calls
    from usage_rows r
  ),
  per_call as (
    select w.created_at, case when c ->> 'provider' = 'gemini' then 'google' else coalesce(c ->> 'provider', 'other') end as provider,
      coalesce((c ->> 'usd')::numeric, 0) as usd
    from with_calls w cross join lateral jsonb_array_elements(w.calls) c
    where w.calls is not null
  ),
  per_row as (
    select w.created_at,
      case when w.model like 'claude%' then 'anthropic' when w.model like 'gemini%' then 'google' when w.model like 'gpt%' then 'openai' else 'other' end as provider,
      w.cost_usd as usd
    from with_calls w
    where w.calls is null and w.cost_usd > 0
  )
  select x.provider, (x.created_at at time zone 'Asia/Bangkok')::date as day, sum(x.usd) as usd, count(*) as requests
  from (select * from per_call union all select * from per_row) x
  where x.usd > 0
  group by 1, 2
  order by 2, 1;
$$;
revoke execute on function public.cashflow_admin_ai_provider_spend(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cashflow_admin_ai_provider_spend(timestamptz, timestamptz) to service_role;

-- Billing answers from a provider in the routing log since a moment ("out of credit", "billing", "over quota"), written by
-- the app since this release: on a request that still got an answer (routing.billing) or one that failed (routing.error).
create or replace function public.cashflow_admin_ai_billing_issues(p_since timestamptz)
returns table (issue text, times bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with logged as (
    select u.created_at, nullif(to_jsonb(u) -> 'routing', 'null'::jsonb) as routing
    from public.cashflow_ai_usage u
    where u.created_at >= p_since
  ),
  issues as (
    select l.created_at, b.value as issue
    from logged l cross join lateral jsonb_array_elements_text(case when jsonb_typeof(l.routing -> 'billing') = 'array' then l.routing -> 'billing' else '[]'::jsonb end) b
    union all
    select l.created_at, substr(l.routing ->> 'error', 9)
    from logged l
    where coalesce(l.routing ->> 'error', '') like 'billing\_%'
  )
  select issue, count(*) as times, max(created_at) as last_at from issues group by issue order by issue;
$$;
revoke execute on function public.cashflow_admin_ai_billing_issues(timestamptz) from public, anon, authenticated;
grant execute on function public.cashflow_admin_ai_billing_issues(timestamptz) to service_role;
