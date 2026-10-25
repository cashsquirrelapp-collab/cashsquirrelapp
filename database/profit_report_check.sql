-- Krarok profit report: system check before building (owner's brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25).
-- READ ONLY: it changes nothing. Run it in the Supabase SQL editor and copy the one JSON result back to Claude Code.
-- No user ids, e-mails or names leave this query: only counts, amounts per plan, column names and yes/no checks.
select jsonb_build_object(
  'checked_at', now(),

  -- 1. Payments. What the database expects a new Pro order to cost (in satang), and the rule on the orders table.
  --    The app since package 69 charges 17700 / 89500 / 156200 (฿177 / ฿895 / ฿1,562).
  'reserve_function_amounts', (
    select coalesce(jsonb_agg(jsonb_build_object('period', x[1], 'months', x[2], 'amount', x[3])), '[]')
    from regexp_matches(pg_get_functiondef('public.cashflow_reserve_prepaid_checkout'::regproc),
      '\(''(month|halfYear|year)'',(\d+),(\d+)\)', 'g') as t(x)),
  'orders_amount_rule', (
    select pg_get_constraintdef(c.oid) from pg_constraint c
    where c.conrelid = 'public.cashflow_prepaid_orders'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%amount%' limit 1),
  -- New orders since 24 Oct by result, so we can see whether payments since package 69 went through.
  'orders_since_24_oct', (
    select coalesce(jsonb_agg(row_to_json(t) order by t.last_at desc), '[]') from (
      select status, method, period, amount, count(*) as orders,
        to_char(min(created_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as first_at,
        to_char(max(created_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as last_at
      from public.cashflow_prepaid_orders where created_at >= '2026-10-24' group by 1, 2, 3, 4) t),
  -- Card auto-renewals by state and the amount each was sold at.
  'auto_renewals', (
    select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
      select s.status, o.period, o.amount, count(*) as subscriptions,
        count(*) filter (where s.cancel_at_period_end) as cancelling
      from public.cashflow_card_subscriptions s join public.cashflow_prepaid_orders o on o.id = s.order_id
      group by 1, 2, 3) t),

  -- 2. Members, by plan and status (no ids).
  'subscriptions', (
    select coalesce(jsonb_agg(row_to_json(t)), '[]') from (
      select coalesce(plan, '-') as plan, status, count(*) as accounts,
        count(*) filter (where prepaid_entitled_until > now()) as prepaid_active
      from public.subscriptions group by 1, 2) t),

  -- 3. AI cost records. Which columns exist, and whether the cost split (package 68) and routing log (package 66) arrive.
  'ai_usage_columns', (
    select jsonb_agg(column_name order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'cashflow_ai_usage'),
  'ai_settle_capped_exists', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cashflow_ai_settle_capped'),
  'ai_reserve_reports_spend', (pg_get_functiondef('public.cashflow_ai_reserve'::regproc) like '%smart_last_hour%'),
  'ai_usage_rows', (
    select jsonb_build_object(
      'rows', count(*),
      'settled', count(*) filter (where status = 'settled'),
      'released', count(*) filter (where status = 'released'),
      'with_routing', count(*) filter (where to_jsonb(u) -> 'routing' is not null),
      'with_cost_split', count(*) filter (where to_jsonb(u) -> 'routing' -> 'cost' is not null),
      'first_at', to_char(min(created_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
      'usd_total', round(coalesce(sum(cost_usd), 0), 4),
      'usd_this_month', round(coalesce(sum(cost_usd) filter (
        where created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'), 0), 4))
    from public.cashflow_ai_usage u),

  -- 4. Where the monthly report would go: admin accounts and whether they have LINE linked.
  'admins', (select count(*) from public.cashflow_user_roles where role = 'admin'),
  'admins_with_line', (
    select count(*) from public.cashflow_user_roles r join public.cashflow_line_links l on l.user_id = r.user_id
    where r.role = 'admin'),

  -- 5. Every table that records money in, with its row count, so the report can count each payment once.
  'payment_tables', jsonb_build_object(
    'cashflow_payments', (select count(*) from public.cashflow_payments),
    'cashflow_promptpay_payments', (select count(*) from public.cashflow_promptpay_payments),
    'cashflow_billing_paid_cycles', (select count(*) from public.cashflow_billing_paid_cycles),
    'cashflow_card_cycles', (select count(*) from public.cashflow_card_cycles),
    'cashflow_prepaid_orders_paid', (
      select count(*) from public.cashflow_prepaid_orders where status in ('paid', 'subscribed', 'refunded')))
) as profit_report_check;
