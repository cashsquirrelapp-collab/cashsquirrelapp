-- Admin inbox for "บอกเรา" (2026-10-20). Additive and read-only: one new RPC for the admin list.
-- The tables and the list/detail/mutate RPCs from feedback_phase_one.sql are unchanged, so the
-- current app keeps working before and after this runs. Apply after feedback_phase_one.sql.
-- Only the BFF service may call it; p_actor comes from the verified session and the admin role
-- is checked again here.
begin;

-- Boxes are derived, never stored:
--   waiting  = not resolved and the user wrote last (the team owes a reply)
--   replied  = not resolved and the team wrote last
--   resolved = closed by the team
create function public.cashflow_feedback_admin_list(
  p_actor uuid,p_box text default 'waiting',p_category text default null,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor_role text; result jsonb;
begin
  select role into actor_role from public.cashflow_user_roles where user_id=p_actor;
  if not found or actor_role<>'admin' then raise exception using errcode='42501',message='forbidden'; end if;
  if p_box is null or p_box not in ('waiting','replied','resolved')
    or p_category is not null and p_category not in ('bug','idea','general')
    or p_page is null or p_page<0 or p_page>10000 then
    raise exception using errcode='22023',message='invalid_feedback_filter';
  end if;
  with boxed as (
    select t.*,
      case when t.status='resolved' then 'resolved' when t.last_sender_role='user' then 'waiting' else 'replied' end as box,
      -- The chat sends no category for ทั่วไป; the older form's "other" counts as general too.
      case when t.category in ('bug','idea') then t.category else 'general' end as kind
    from public.cashflow_feedback_threads t
  ), in_box as (
    select * from boxed where box=p_box
  ), filtered as (
    select b.*,
      -- How long the user has waited: their first message after the team's latest reply.
      case when p_box='waiting' then coalesce((
        select min(m.created_at) from public.cashflow_feedback_messages m
        where m.thread_id=b.id and m.sender_role='user' and m.created_at>coalesce((
          select max(a.created_at) from public.cashflow_feedback_messages a
          where a.thread_id=b.id and a.sender_role='admin'),'-infinity'::timestamptz)
      ),b.last_message_at) end as waiting_since
    from in_box b where p_category is null or b.kind=p_category
  ), ranked as (
    -- Waiting and replied: the oldest first, so nothing is forgotten. Resolved: the newest first.
    select f.*,row_number() over (order by
      case when p_box='resolved' then null else coalesce(f.waiting_since,f.last_message_at) end asc,
      case when p_box='resolved' then f.last_message_at end desc,
      f.id) as position
    from filtered f
  ), page_rows as (
    select r.*,p.display_name,p.public_id,
      (select count(*) from public.cashflow_feedback_threads o where o.owner_id=r.owner_id) as owner_thread_count
    from ranked r left join public.cashflow_profiles p on p.user_id=r.owner_id
    where r.position>p_page::bigint*20 and r.position<=p_page::bigint*20+20
  )
  select jsonb_build_object(
    'threads',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'ownerId',owner_id,'ownerName',display_name,'ownerPublicId',public_id,
      'category',category,'status',status,'preview',preview,'createdAt',created_at,'updatedAt',updated_at,
      'lastMessageAt',last_message_at,'lastSenderRole',last_sender_role,'messageCount',message_count,
      'waitingSince',waiting_since,'ownerThreadCount',owner_thread_count
    ) order by position) from page_rows),'[]'::jsonb),
    'hasMore',(select count(*)>p_page::bigint*20+20 from ranked),
    'page',p_page,'pageSize',20,
    'counts',(select jsonb_build_object(
      'waiting',count(*) filter (where box='waiting'),
      'replied',count(*) filter (where box='replied'),
      'resolved',count(*) filter (where box='resolved')) from boxed),
    'kinds',(select jsonb_build_object(
      'bug',count(*) filter (where kind='bug'),
      'idea',count(*) filter (where kind='idea'),
      'general',count(*) filter (where kind='general')) from in_box)
  ) into result;
  return result;
end;
$$;

revoke all on function public.cashflow_feedback_admin_list(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.cashflow_feedback_admin_list(uuid,text,text,integer) to service_role;

commit;
