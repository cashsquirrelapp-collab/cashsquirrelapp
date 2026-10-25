-- เลขากระรอก learns from real use (owner, 2026-10-25; plan approved: package A, retention as planned).
-- Additive only: nothing existing is removed, and the memories saved so far stay as they are.
--   cashflow_ai_memories        more kinds, where a memory came from, its version and when it was last used
--   cashflow_ai_memory_events   every change to a memory (created, updated, deleted, expired), for review and rollback
--   cashflow_ai_corrections     what the user corrected on a confirmed card (used from package B)
--   cashflow_ai_knowledge_signals  features people could not find, asked for, or got a wrong answer about (package D)
-- Like the other AI tables: row level security on with no policy, so only the server (service_role) reads and
-- writes them; everything goes with the account. Retention (cashflow_ai_learning_sweep, run daily): memories
-- unused for 12 months, memory events and corrections after 12 months, knowledge signals after 6 months.
begin;

alter table public.cashflow_ai_memories drop constraint if exists cashflow_ai_memories_kind_check;
alter table public.cashflow_ai_memories add constraint cashflow_ai_memories_kind_check check (kind in (
  'preferred_name', 'tone', 'emoji', 'formality', 'persona', 'role', 'business', 'routine', 'document_preference',
  'vocabulary', 'context', 'correction'));
alter table public.cashflow_ai_memories
  add column if not exists source text not null default 'explicit' check (source in ('explicit', 'correction')),
  add column if not exists version integer not null default 1 check (version >= 1),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer not null default 0 check (use_count >= 0);
update public.cashflow_ai_memories set updated_at = created_at where updated_at > created_at;
-- One value per account for the kinds that are one setting (what to call the user, how to talk).
drop index if exists public.cashflow_ai_memories_single;
create unique index cashflow_ai_memories_single on public.cashflow_ai_memories (user_id, kind)
  where kind in ('preferred_name', 'tone', 'emoji', 'formality', 'persona');

create table if not exists public.cashflow_ai_memory_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid,
  action text not null check (action in ('created', 'updated', 'deleted', 'expired')),
  kind text not null check (length(kind) between 1 and 40),
  old_value text check (old_value is null or length(old_value) <= 200),
  new_value text check (new_value is null or length(new_value) <= 200),
  channel text not null check (channel in ('app', 'line', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists cashflow_ai_memory_events_user on public.cashflow_ai_memory_events (user_id, created_at desc);
create index if not exists cashflow_ai_memory_events_memory on public.cashflow_ai_memory_events (memory_id);

create table if not exists public.cashflow_ai_corrections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('expense_category', 'expense_name', 'job_name', 'job_client', 'job_wht',
    'document_client', 'document_item', 'other')),
  subject text not null check (length(subject) between 1 and 120),
  before_value text check (before_value is null or length(before_value) <= 200),
  after_value text not null check (length(after_value) between 1 and 200),
  proposal_id text check (proposal_id is null or proposal_id ~ '^p_[0-9a-f-]{36}$'),
  memory_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists cashflow_ai_corrections_user on public.cashflow_ai_corrections (user_id, created_at desc);

create table if not exists public.cashflow_ai_knowledge_signals (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('not_found', 'not_available', 'wrong_answer', 'feature_request')),
  feature_id text check (feature_id is null or length(feature_id) <= 60),
  question text check (question is null or length(question) <= 200),
  channel text not null check (channel in ('app', 'line')),
  prompt_version text check (prompt_version is null or length(prompt_version) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists cashflow_ai_knowledge_signals_day on public.cashflow_ai_knowledge_signals (created_at);

alter table public.cashflow_ai_memory_events enable row level security;
alter table public.cashflow_ai_corrections enable row level security;
alter table public.cashflow_ai_knowledge_signals enable row level security;
revoke all on public.cashflow_ai_memory_events, public.cashflow_ai_corrections, public.cashflow_ai_knowledge_signals from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_ai_memory_events, public.cashflow_ai_corrections, public.cashflow_ai_knowledge_signals to service_role;

-- The memories one message used: last used now, one more use (so unused ones can expire and the least used go first).
create or replace function public.cashflow_ai_memories_touch(p_user_id uuid, p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.cashflow_ai_memories set last_used_at = now(), use_count = use_count + 1
  where user_id = p_user_id and id = any(p_ids);
$$;

-- Retention, run daily by the scheduled job. Returns how many rows each step removed.
create or replace function public.cashflow_ai_learning_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired integer; events integer; corrections integer; signals integer;
begin
  with gone as (
    delete from public.cashflow_ai_memories
    where coalesce(last_used_at, updated_at, created_at) < now() - interval '12 months'
    returning id, user_id, kind
  ), logged as (
    insert into public.cashflow_ai_memory_events (user_id, memory_id, action, kind, channel)
    select user_id, id, 'expired', kind, 'system' from gone returning 1
  ) select count(*) into expired from logged;
  delete from public.cashflow_ai_memory_events where created_at < now() - interval '12 months';
  get diagnostics events = row_count;
  delete from public.cashflow_ai_corrections where created_at < now() - interval '12 months';
  get diagnostics corrections = row_count;
  delete from public.cashflow_ai_knowledge_signals where created_at < now() - interval '6 months';
  get diagnostics signals = row_count;
  return jsonb_build_object('memories_expired', expired, 'events_removed', events, 'corrections_removed', corrections, 'signals_removed', signals);
end;
$$;
revoke all on function public.cashflow_ai_memories_touch(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.cashflow_ai_learning_sweep() from public, anon, authenticated;
grant execute on function public.cashflow_ai_memories_touch(uuid, uuid[]) to service_role;
grant execute on function public.cashflow_ai_learning_sweep() to service_role;

commit;
