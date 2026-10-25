-- เลขากระรอก model routing V2 (owner's brief, 2026-10-25). Additive: one column on the existing usage row, so the app
-- works the same before and after this runs (until it runs, the routing details are simply not saved).
-- The owner runs it in the Supabase SQL editor; the app never writes SQL.
--
-- routing holds, per request: the routing version, intent, complexity, risk, context size, the model tier and why,
-- the first tool set, hand-over, escalations, fallback, provider retries, each model call (provider, model, cost in
-- USD, token counts, rounds), tool names, time taken, the outcome and the ids of the cards it prepared. Never the
-- user's words, figures, names or account data. It is deleted with the account, like the usage row it is on.
begin;
alter table public.cashflow_ai_usage add column if not exists routing jsonb;
alter table public.cashflow_ai_usage drop constraint if exists cashflow_ai_usage_routing_shape;
alter table public.cashflow_ai_usage add constraint cashflow_ai_usage_routing_shape
  check (routing is null or (jsonb_typeof(routing) = 'object' and length(routing::text) <= 8000));
commit;
