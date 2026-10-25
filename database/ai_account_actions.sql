-- Additive migration after ai_secretary.sql. No account data or access policies are changed.
-- The existing claim RPC remains owner-scoped, pending-only, and expiry checked.
begin;
alter table public.cashflow_ai_proposals
  drop constraint if exists cashflow_ai_proposals_kind_check;
alter table public.cashflow_ai_proposals
  add constraint cashflow_ai_proposals_kind_check check (kind in (
    'add_job', 'record_payment', 'edit_job', 'delete_job',
    'add_document', 'edit_document', 'delete_document',
    'add_expense', 'edit_expense', 'delete_expense',
    'add_goal', 'edit_goal', 'delete_goal', 'goal_deposit', 'goal_withdraw',
    'edit_settings', 'edit_issuer_profile', 'edit_notifications'
  ));
comment on column public.cashflow_ai_proposals.job_id is
  'Target record key. The server maps the explicit proposal kind to a permitted table; legacy name retained for compatibility.';
commit;
