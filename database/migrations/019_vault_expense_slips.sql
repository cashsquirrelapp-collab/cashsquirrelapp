-- Document vault: also keep expense slips and receipts. A file of kind 'expense' links to an
-- expense through the same link columns a job uses (job_id = the expense's id, job_name = its name).
begin;

alter table public.cashflow_vault_files drop constraint if exists cashflow_vault_files_kind_check;
alter table public.cashflow_vault_files add constraint cashflow_vault_files_kind_check
  check (kind in ('wht50', 'contract', 'expense', 'other'));

comment on column public.cashflow_vault_files.job_id is 'Linked job id, or the expense id when kind = expense';
comment on column public.cashflow_vault_files.job_name is 'Linked job name, or the expense name when kind = expense';

commit;
