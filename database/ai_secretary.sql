-- เลขากระรอก AI Gateway (2026-10-24). Additive: three new tables and three functions. Nothing existing changes,
-- so the app works the same before and after this runs. The owner runs it in the Supabase SQL editor; the app
-- never writes SQL and the AI never touches the database directly (it only proposes changes the user confirms).
-- Only the backend (service_role) may use these; row level security is on with no policies, so the browser
-- (anon/authenticated) cannot read or write them.
begin;

-- Changes the AI prepared, waiting for the user to press confirm on the card. A proposal is applied once:
-- confirm moves it pending -> applying -> applied in one statement, so two taps cannot apply it twice.
create table public.cashflow_ai_proposals (
  id text primary key check (id ~ '^p_[0-9a-f-]{36}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('add_job','record_payment','edit_job','delete_job')),
  job_id text not null check (length(job_id) between 1 and 200),
  record jsonb,
  -- The job's version when the AI read it; confirm fails if the job changed since (same rule as the app's save).
  base_version bigint,
  title text not null check (length(title) <= 200),
  changes jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','applying','applied','cancelled','stale')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  applied_at timestamptz
);
create index cashflow_ai_proposals_user on public.cashflow_ai_proposals (user_id, created_at desc);

-- One row per AI request: reserved before the model runs, settled with the real cost after, released (0 tokens)
-- if the request failed, so a failed answer never costs the user anything.
create table public.cashflow_ai_usage (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Paid Pro: 'YYYY-MM-DD', the Bangkok start of the monthly cycle on the renewal day. Admins and admin-granted
  -- Pro: 'YYYY-MM'. The free trial: 'trial'.
  cycle_key text not null check (cycle_key ~ '^(\d{4}-\d{2}(-\d{2})?|trial)$'),
  tokens integer not null check (tokens >= 0),
  status text not null check (status in ('reserved','settled','released')),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  model text,
  route text check (route is null or route in ('chat','action')),
  prompt_version text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index cashflow_ai_usage_user_cycle on public.cashflow_ai_usage (user_id, cycle_key);
create index cashflow_ai_usage_day on public.cashflow_ai_usage (created_at);

-- What the user asked เลขา to remember (what to call them, how to talk). One row per kind for preferred_name and
-- tone; up to 20 notes in total per user, enforced by the backend.
create table public.cashflow_ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preferred_name','tone','role','routine','document_preference','context')),
  value text not null check (length(value) between 1 and 200),
  created_at timestamptz not null default now()
);
create unique index cashflow_ai_memories_single on public.cashflow_ai_memories (user_id, kind)
  where kind in ('preferred_name','tone');
create index cashflow_ai_memories_user on public.cashflow_ai_memories (user_id, created_at desc);

alter table public.cashflow_ai_proposals enable row level security;
alter table public.cashflow_ai_usage enable row level security;
alter table public.cashflow_ai_memories enable row level security;
revoke all on public.cashflow_ai_proposals, public.cashflow_ai_usage, public.cashflow_ai_memories from public, anon, authenticated;
grant select, insert, update, delete on public.cashflow_ai_proposals, public.cashflow_ai_usage, public.cashflow_ai_memories to service_role;

-- Reserve room for one request. Locked per user and cycle, so two requests sent at once cannot both use the last
-- tokens. p_token_limit null = no token cap (admins); p_request_limit is for the trial (count of requests).
-- p_daily_cap_usd stops all AI use for the day once the whole app has spent that much (a safety net).
create function public.cashflow_ai_reserve(
  p_user_id uuid, p_cycle text, p_request_id uuid, p_tokens integer,
  p_token_limit integer, p_request_limit integer, p_daily_cap_usd numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare used_tokens bigint; used_requests bigint; spent_today numeric;
begin
  if p_tokens is null or p_tokens < 0 or p_tokens > 1000 then raise exception using errcode='22023', message='invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_cycle, 0));
  select coalesce(sum(cost_usd), 0) into spent_today from public.cashflow_ai_usage
    where created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  if p_daily_cap_usd is not null and spent_today >= p_daily_cap_usd then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;
  select coalesce(sum(tokens), 0), count(*) into used_tokens, used_requests from public.cashflow_ai_usage
    where user_id = p_user_id and cycle_key = p_cycle and status in ('reserved','settled');
  if p_request_limit is not null and used_requests >= p_request_limit then
    return jsonb_build_object('ok', false, 'reason', 'requests', 'used_requests', used_requests);
  end if;
  if p_token_limit is not null and used_tokens >= p_token_limit then
    return jsonb_build_object('ok', false, 'reason', 'tokens', 'used_tokens', used_tokens);
  end if;
  insert into public.cashflow_ai_usage (request_id, user_id, cycle_key, tokens, status)
    values (p_request_id, p_user_id, p_cycle, p_tokens, 'reserved');
  return jsonb_build_object('ok', true, 'used_tokens', used_tokens + p_tokens, 'used_requests', used_requests + 1);
end;
$$;

-- Replace the reservation with what the request really cost (or release it to 0 when it failed).
create function public.cashflow_ai_settle(
  p_user_id uuid, p_request_id uuid, p_tokens integer, p_cost_usd numeric,
  p_model text, p_route text, p_prompt_version text, p_release boolean
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.cashflow_ai_usage set
    tokens = case when p_release then 0 else greatest(p_tokens, 0) end,
    cost_usd = greatest(coalesce(p_cost_usd, 0), 0),
    status = case when p_release then 'released' else 'settled' end,
    model = p_model, route = p_route, prompt_version = p_prompt_version, settled_at = now()
  where request_id = p_request_id and user_id = p_user_id and status = 'reserved';
end;
$$;

-- Take a pending, unexpired proposal for applying. Returns the row once; a second call (double tap) gets nothing.
create function public.cashflow_ai_claim_proposal(p_user_id uuid, p_id text)
returns setof public.cashflow_ai_proposals language sql security invoker set search_path = '' as $$
  update public.cashflow_ai_proposals set status = 'applying'
  where id = p_id and user_id = p_user_id and status = 'pending' and expires_at > now()
  returning *;
$$;

revoke all on function public.cashflow_ai_reserve(uuid,text,uuid,integer,integer,integer,numeric) from public, anon, authenticated;
revoke all on function public.cashflow_ai_settle(uuid,uuid,integer,numeric,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.cashflow_ai_claim_proposal(uuid,text) from public, anon, authenticated;
grant execute on function public.cashflow_ai_reserve(uuid,text,uuid,integer,integer,integer,numeric) to service_role;
grant execute on function public.cashflow_ai_settle(uuid,uuid,integer,numeric,text,text,text,boolean) to service_role;
grant execute on function public.cashflow_ai_claim_proposal(uuid,text) to service_role;

commit;
