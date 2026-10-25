-- Krarok monthly profit report: the figures per account (READ ONLY; it changes nothing). Run it in the Supabase SQL
-- editor. Change the month on the last line. Accounts are internal ids only: no names, e-mails or chats. These figures
-- never go to LINE. Money is in baht; "ai" is what the account's own use cost, "shared" its part of the platform's
-- cost (the prompt cache written for everyone, failed attempts, the report's note), split among the month's paying members.
select
  a ->> 'userId' as account,
  a ->> 'plan' as plan,
  round((a ->> 'cashRevenue')::numeric / 100, 2) as paid_baht,
  round((a ->> 'refunds')::numeric / 100, 2) as refunded_baht,
  round((a ->> 'fee')::numeric / 100, 2) as fee_baht,
  a ->> 'feeSource' as fee_source,
  round((a ->> 'earnedRevenue')::numeric / 100, 2) as earned_this_month_baht,
  (a ->> 'messages')::int as messages,
  (a ->> 'geminiMessages')::int as gemini,
  (a ->> 'claudeMessages')::int as claude,
  (a ->> 'krarokTokens')::int as krarok_tokens,
  (a ->> 'krarokTokensLeft')::int as tokens_left,
  round((a ->> 'directAi')::numeric / 100, 2) as ai_baht,
  round((a ->> 'allocatedPlatform')::numeric / 100, 2) as shared_baht,
  round((a ->> 'contribution')::numeric / 100, 2) as contribution_baht,
  round((a ->> 'allocatedContribution')::numeric / 100, 2) as after_shared_baht,
  round((a ->> 'earnedContribution')::numeric / 100, 2) as earned_contribution_baht,
  (a ->> 'cardsConfirmed')::int as confirmed_cards,
  round((a ->> 'aiUsd')::numeric / 1000000, 4) as ai_usd
from public.cashflow_admin_reports r, jsonb_array_elements(r.accounts) a
where r.month = '2026-10'
order by (a ->> 'allocatedContribution')::numeric nulls last;

-- Every report saved, newest first, with its state and whether LINE got it:
-- select month, status, metrics -> 'profit' as profit, note, delivery ->> 'status' as delivery, delivered_at
-- from public.cashflow_admin_reports order by month desc;
