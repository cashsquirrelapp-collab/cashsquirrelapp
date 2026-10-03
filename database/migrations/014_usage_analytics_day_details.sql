-- Add per-day feature summaries for the admin usage chart drill-down.
begin;

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
    'dailyFeatures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', feature_day.usage_date,
        'key', feature_day.feature_key,
        'activeUsers', feature_day.active_users,
        'pageViews', feature_day.page_views
      ) order by feature_day.usage_date, feature_day.page_views desc, feature_day.feature_key), '[]'::jsonb)
      from (
        select usage_date, feature_key, count(distinct user_key) as active_users, sum(view_count) as page_views
        from public.cashflow_usage_daily
        where usage_date between p_from_date and p_to_date
        group by usage_date, feature_key
      ) feature_day
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

revoke all on function public.cashflow_usage_analytics(date, date) from public, anon, authenticated;
grant execute on function public.cashflow_usage_analytics(date, date) to service_role;

commit;
