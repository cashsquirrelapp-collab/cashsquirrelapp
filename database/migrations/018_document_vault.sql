-- Document vault: files a user keeps with their work (50 ทวิ certificates, contracts / POs,
-- other papers). The files themselves live in the private "document-vault" Storage bucket; this
-- table holds what each file is and who it belongs to. Only the API (service role) reads or
-- writes it, after checking the signed-in user and their access to the finance workspace.
begin;

create table if not exists public.cashflow_vault_files (
  id uuid primary key,
  -- Exactly one owner: a personal account or a group finance workspace.
  user_id uuid references auth.users(id) on delete cascade,
  group_id uuid references public.cashflow_groups(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('wht50', 'contract', 'other')),
  job_id text check (job_id is null or length(job_id) between 1 and 120),
  job_name text check (job_name is null or length(job_name) <= 200),
  client text check (client is null or length(client) <= 200),
  file_name text not null check (length(file_name) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  storage_path text not null unique check (storage_path ~ '^(user|group)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  created_at timestamptz not null default now(),
  constraint cashflow_vault_files_one_owner check ((user_id is null) <> (group_id is null))
);

create index if not exists cashflow_vault_files_user on public.cashflow_vault_files(user_id, created_at desc) where user_id is not null;
create index if not exists cashflow_vault_files_group on public.cashflow_vault_files(group_id, created_at desc) where group_id is not null;
create index if not exists cashflow_vault_files_job on public.cashflow_vault_files(job_id) where job_id is not null;

alter table public.cashflow_vault_files enable row level security;
revoke all on public.cashflow_vault_files from public, anon, authenticated;
grant all on public.cashflow_vault_files to service_role;

commit;
