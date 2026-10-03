-- Store daily feature-use counters with a keyed pseudonymous account identifier.
-- No emails, URLs, request payloads, or financial data are stored.
begin;

create table if not exists public.cashflow_usage_daily (
  usage_date date not null,
  user_key text not null check (user_key ~ '^[0-9a-f]{64}$'),
  feature_key text not null check (feature_key in (
    'dashboard', 'adminDashboard', 'jobs', 'tax', 'split', 'report', 'settings',
    'invoice', 'insight', 'plans', 'groups', 'clients', 'calendar', 'receivables', 'incomeExpense'
  )),
  view_count bigint not null default 0 check (view_count >= 0),
  last_seen_at timestamptz not null default now(),
  primary key (usage_date, user_key, feature_key)
);

alter table public.cashflow_usage_daily enable row level security;
revoke all on public.cashflow_usage_daily from public, anon, authenticated;
grant all on public.cashflow_usage_daily to service_role;

create or replace function public.cashflow_record_usage(p_user_key text, p_feature_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_day date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_user_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_user_key';
  end if;
  if p_feature_key not in (
    'dashboard', 'adminDashboard', 'jobs', 'tax', 'split', 'report', 'settings',
    'invoice', 'insight', 'plans', 'groups', 'clients', 'calendar', 'receivables', 'incomeExpense'
  ) then
    raise exception 'invalid_feature_key';
  end if;

  insert into public.cashflow_usage_daily as current_usage (usage_date, user_key, feature_key, view_count, last_seen_at)
  values (local_day, p_user_key, p_feature_key, 1, now())
  on conflict (usage_date, user_key, feature_key) do update
    set view_count = current_usage.view_count + 1,
        last_seen_at = now();

  delete from public.cashflow_usage_daily where usage_date < local_day - 89;
end;
$$;

create or replace function public.cashflow_usage_analytics(p_from_date date, p_to_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from_date > p_to_date or p_from_date < p_to_date - 89 then
    raise exception 'invalid_date_range';
  end if;

  select jsonb_build_object(
    'fromDate', p_from_date,
    'toDate', p_to_date,
    'totals', jsonb_build_object(
      'activeUsers', count(distinct user_key),
      'pageViews', coalesce(sum(view_count), 0),
      'activeUsersToday', count(distinct user_key) filter (where usage_date = p_to_date),
      'pageViewsToday', coalesce(sum(view_count) filter (where usage_date = p_to_date), 0)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', day.usage_date,
        'activeUsers', day.active_users,
        'pageViews', day.page_views
      ) order by day.usage_date), '[]'::jsonb)
      from (
        select usage_date, count(distinct user_key) as active_users, sum(view_count) as page_views
        from public.cashflow_usage_daily
        where usage_date between p_from_date and p_to_date
        group by usage_date
      ) day
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', feature.feature_key,
        'activeUsers', feature.active_users,
        'pageViews', feature.page_views
      ) order by feature.page_views desc, feature.feature_key), '[]'::jsonb)
      from (
        select feature_key, count(distinct user_key) as active_users, sum(view_count) as page_views
        from public.cashflow_usage_daily
        where usage_date between p_from_date and p_to_date
        group by feature_key
      ) feature
    )
  ) into result
  from public.cashflow_usage_daily
  where usage_date between p_from_date and p_to_date;

  return result;
end;
$$;

revoke all on function public.cashflow_record_usage(text, text) from public, anon, authenticated;
revoke all on function public.cashflow_usage_analytics(date, date) from public, anon, authenticated;
grant execute on function public.cashflow_record_usage(text, text) to service_role;
grant execute on function public.cashflow_usage_analytics(date, date) to service_role;

commit;
