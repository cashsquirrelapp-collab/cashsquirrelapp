-- Proposed additive migration: promote with `supabase migration new feedback_phase_one`
-- when the CLI is available. Apply after migrations 001-024.
-- Only the BFF service may call these SECURITY INVOKER RPCs. p_actor MUST be
-- derived from a provider-verified session, never from a client request body.
begin;

create table public.cashflow_feedback_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text check (category in ('bug','idea','other')),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  preview text not null check (char_length(preview) between 1 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_sender_role text not null check (last_sender_role in ('user','admin')),
  message_count integer not null check (message_count between 1 and 1000)
);

create table public.cashflow_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.cashflow_feedback_threads(id) on delete cascade,
  -- Retain the verified sender identity when an admin account is deleted.
  -- Deleting an owner removes their entire thread via the owner FK above.
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('user','admin')),
  body text not null check (char_length(body) between 1 and 4000
    and body = btrim(body, E' \t\n\r\f' || chr(11)) and body <> ''),
  created_at timestamptz not null default now()
);

create index cashflow_feedback_threads_owner_recent
  on public.cashflow_feedback_threads(owner_id,last_message_at desc,id desc);
create index cashflow_feedback_threads_recent
  on public.cashflow_feedback_threads(last_message_at desc,id desc);
create index cashflow_feedback_threads_status_recent
  on public.cashflow_feedback_threads(status,last_message_at desc,id desc);
create index cashflow_feedback_threads_owner_created
  on public.cashflow_feedback_threads(owner_id,created_at desc);
create index cashflow_feedback_messages_thread_order
  on public.cashflow_feedback_messages(thread_id,created_at,id);
create index cashflow_feedback_messages_sender_created
  on public.cashflow_feedback_messages(sender_id,created_at desc);

alter table public.cashflow_feedback_threads enable row level security;
alter table public.cashflow_feedback_messages enable row level security;
-- No browser policies: even authenticated owners use the session-verified BFF.
revoke all on table public.cashflow_feedback_threads,public.cashflow_feedback_messages
  from public,anon,authenticated,service_role;
grant select,insert on table public.cashflow_feedback_threads,public.cashflow_feedback_messages to service_role;
grant update(status,preview,updated_at,last_message_at,last_sender_role,message_count)
  on public.cashflow_feedback_threads to service_role;

create function public.cashflow_feedback_list(
  p_actor uuid,p_scope text default 'mine',p_status text default null,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor_role text; result jsonb;
begin
  select role into actor_role from public.cashflow_user_roles where user_id=p_actor;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if p_scope is null or p_scope not in ('mine','admin')
    or p_status is not null and p_status not in ('open','in_progress','resolved')
    or p_page is null or p_page<0 or p_page>10000 then
    raise exception using errcode='22023',message='invalid_feedback_filter';
  end if;
  if p_scope='admin' and actor_role<>'admin' then
    raise exception using errcode='42501',message='forbidden';
  end if;
  with visible as (
    select t.*,p.display_name,p.public_id
    from public.cashflow_feedback_threads t
    left join public.cashflow_profiles p on p.user_id=t.owner_id
    where (p_scope='admin' or t.owner_id=p_actor) and (p_status is null or t.status=p_status)
    order by t.last_message_at desc,t.id desc limit 21 offset p_page::bigint*20
  ), page_rows as (
    select * from visible order by last_message_at desc,id desc limit 20
  )
  select jsonb_build_object(
    'threads',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'ownerId',owner_id,'ownerName',display_name,'ownerPublicId',public_id,
      'category',category,'status',status,'preview',preview,'createdAt',created_at,'updatedAt',updated_at,
      'lastMessageAt',last_message_at,'lastSenderRole',last_sender_role,'messageCount',message_count
    ) order by last_message_at desc,id desc) from page_rows),'[]'::jsonb),
    'hasMore',(select count(*)>20 from visible),'page',p_page,'pageSize',20
  ) into result;
  return result;
end;
$$;

create function public.cashflow_feedback_detail(
  p_actor uuid,p_thread_id uuid,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor_role text; thread_json jsonb; messages_json jsonb; has_more boolean;
begin
  select role into actor_role from public.cashflow_user_roles where user_id=p_actor;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if p_page is null or p_page<0 or p_page>10000 or p_thread_id is null then
    raise exception using errcode='22023',message='invalid_feedback_page';
  end if;
  select jsonb_build_object(
    'id',t.id,'ownerId',t.owner_id,'ownerName',p.display_name,'ownerPublicId',p.public_id,
    'category',t.category,'status',t.status,'preview',t.preview,'createdAt',t.created_at,'updatedAt',t.updated_at,
    'lastMessageAt',t.last_message_at,'lastSenderRole',t.last_sender_role,'messageCount',t.message_count
  ) into thread_json from public.cashflow_feedback_threads t
  left join public.cashflow_profiles p on p.user_id=t.owner_id
  where t.id=p_thread_id and (t.owner_id=p_actor or actor_role='admin');
  if not found then raise exception using errcode='P0002',message='feedback_not_found'; end if;
  with visible as (
    select * from public.cashflow_feedback_messages where thread_id=p_thread_id
    order by created_at,id limit 51 offset p_page::bigint*50
  ), page_rows as (select * from visible order by created_at,id limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'threadId',thread_id,'senderId',sender_id,'senderRole',sender_role,'body',body,'createdAt',created_at
  ) order by created_at,id) from page_rows),'[]'::jsonb),(select count(*)>50 from visible)
  into messages_json,has_more;
  return jsonb_build_object('thread',thread_json,'messages',messages_json,
    'hasMore',has_more,'page',p_page,'pageSize',50);
end;
$$;

create function public.cashflow_feedback_mutate(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor_role text; target public.cashflow_feedback_threads; thread_id uuid;
  message_body text; next_status text; category_value text; stamp timestamptz;
begin
  if p_actor is null then raise exception using errcode='42501',message='forbidden'; end if;
  -- Serialize each actor's rolling quotas. Thread locks also serialize replies
  -- from different actors, preserving the message cap and summary atomically.
  perform pg_advisory_xact_lock(hashtextextended('cashflow-feedback:' || p_actor::text,0));
  select role into actor_role from public.cashflow_user_roles where user_id=p_actor for share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if p_action is null or p_action not in ('create','reply','status')
    or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception using errcode='22023',message='invalid_feedback_action';
  end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where not (
    (p_action='create' and k in ('body','category')) or
    (p_action='reply' and k in ('threadId','body')) or
    (p_action='status' and k in ('threadId','status'))
  )) then raise exception using errcode='22023',message='invalid_feedback_fields'; end if;
  if p_action in ('create','reply') then
    if jsonb_typeof(p_input->'body') is distinct from 'string' then
      raise exception using errcode='22023',message='invalid_feedback_body';
    end if;
    message_body:=btrim(p_input->>'body', E' \t\n\r\f' || chr(11));
    if char_length(message_body) not between 1 and 4000 then
      raise exception using errcode='22023',message='invalid_feedback_body';
    end if;
  end if;
  if p_action='create' then
    category_value:=p_input->>'category';
    if category_value is not null and category_value not in ('bug','idea','other') then
      raise exception using errcode='22023',message='invalid_feedback_category';
    end if;
  else
    if jsonb_typeof(p_input->'threadId') is distinct from 'string'
      or p_input->>'threadId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='invalid_feedback_thread';
    end if;
    thread_id:=(p_input->>'threadId')::uuid;
    if p_action='status' then
      if actor_role<>'admin' then raise exception using errcode='42501',message='forbidden'; end if;
      next_status:=p_input->>'status';
      if next_status is null or next_status not in ('open','in_progress','resolved') then
        raise exception using errcode='22023',message='invalid_feedback_status';
      end if;
    end if;
    select * into target from public.cashflow_feedback_threads
      where id=thread_id and (owner_id=p_actor or actor_role='admin') for update;
    if not found then raise exception using errcode='P0002',message='feedback_not_found'; end if;
  end if;
  stamp:=clock_timestamp();
  if p_action='status' then
    update public.cashflow_feedback_threads set status=next_status,updated_at=stamp where id=thread_id;
    return jsonb_build_object('threadId',thread_id);
  end if;
  if p_action='create' then
    if (select count(*) from public.cashflow_feedback_threads where owner_id=p_actor)>=1000 then
      raise exception using errcode='P0001',message='feedback_thread_limit';
    end if;
    if (select count(*) from public.cashflow_feedback_threads
      where owner_id=p_actor and created_at>stamp-interval '1 hour')>=10 then
      raise exception using errcode='P0001',message='feedback_create_rate_limit';
    end if;
  elsif target.message_count>=1000 then
    raise exception using errcode='P0001',message='feedback_message_limit';
  end if;
  if (select count(*) from public.cashflow_feedback_messages
    where sender_id=p_actor and created_at>stamp-interval '1 hour')>=60 then
    raise exception using errcode='P0001',message='feedback_message_rate_limit';
  end if;
  if p_action='create' then
    insert into public.cashflow_feedback_threads(
      owner_id,category,status,preview,created_at,updated_at,last_message_at,last_sender_role,message_count
    ) values(p_actor,category_value,'open',left(message_body,180),stamp,stamp,stamp,actor_role,1)
      returning id into thread_id;
  else
    update public.cashflow_feedback_threads set
      status=case when actor_role='admin' then 'in_progress' when status='resolved' then 'open' else status end,
      preview=left(message_body,180),updated_at=stamp,last_message_at=stamp,
      last_sender_role=actor_role,message_count=message_count+1 where id=thread_id;
  end if;
  insert into public.cashflow_feedback_messages(thread_id,sender_id,sender_role,body,created_at)
    values(thread_id,p_actor,actor_role,message_body,stamp);
  return jsonb_build_object('threadId',thread_id);
end;
$$;

revoke all on function public.cashflow_feedback_list(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.cashflow_feedback_detail(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.cashflow_feedback_mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cashflow_feedback_list(uuid,text,text,integer) to service_role;
grant execute on function public.cashflow_feedback_detail(uuid,uuid,integer) to service_role;
grant execute on function public.cashflow_feedback_mutate(uuid,text,jsonb) to service_role;

commit;
