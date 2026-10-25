-- Editable confirmation cards (2026-10-24, owner: "แก้ไขยอดได้ในแชทเลย ก่อนบันทึกจริง").
-- A proposal keeps the tool call that prepared it, so changing a field on the card prepares it again with the same
-- checks and no model call. Both columns are optional: older proposals and LINE confirmations are unaffected, and
-- the app saves proposals without them until this has run (their cards then cannot be edited).
alter table public.cashflow_ai_proposals add column if not exists tool text check (tool is null or tool ~ '^propose_[a-z_]{1,40}$');
alter table public.cashflow_ai_proposals add column if not exists args jsonb check (args is null or (jsonb_typeof(args) = 'object' and length(args::text) <= 20000));
