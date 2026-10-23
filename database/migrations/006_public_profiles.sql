-- Public account identities. Emails remain private authentication data.
begin;

create table if not exists public.cashflow_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique default ('SQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_id ~ '^SQ-[A-F0-9]{10}$')
);

insert into public.cashflow_profiles(user_id,display_name)
select id,case when length(btrim(coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''),'')))>=2
  then left(btrim(coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''))),60) else 'สมาชิก' end
from auth.users on conflict(user_id) do nothing;

create or replace function public.cashflow_profile_public_id_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.public_id is distinct from old.public_id then raise exception 'public_id_immutable' using errcode='P0001'; end if;
  new.display_name:=btrim(new.display_name); new.updated_at:=now(); return new;
end $$;
drop trigger if exists cashflow_profile_public_id_immutable on public.cashflow_profiles;
create trigger cashflow_profile_public_id_immutable before update on public.cashflow_profiles
for each row execute function public.cashflow_profile_public_id_immutable();

create or replace function public.cashflow_init_user_role() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into cashflow_user_roles(user_id,role) values(new.id,'user') on conflict do nothing;
  insert into cashflow_profiles(user_id,display_name)
  values(new.id,case when length(btrim(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''),'')))>=2
    then left(btrim(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''))),60) else 'สมาชิก' end)
  on conflict(user_id) do nothing;
  return new;
end $$;

alter table public.cashflow_group_invitations add column if not exists invited_user_id uuid references auth.users(id) on delete cascade;
update public.cashflow_group_invitations i set invited_user_id=u.id from auth.users u
where i.invited_user_id is null and lower(u.email)=i.email;
create unique index if not exists cashflow_group_invitation_target on public.cashflow_group_invitations(group_id,invited_user_id) where invited_user_id is not null;
create index if not exists cashflow_group_invitations_user on public.cashflow_group_invitations(invited_user_id) where status='pending';

create or replace function public.cashflow_profile_get(p_actor uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('userId',p.user_id,'publicId',p.public_id,'displayName',p.display_name)
  from cashflow_profiles p where p.user_id=p_actor and exists(select 1 from auth.users where id=p_actor)
$$;
create or replace function public.cashflow_profile_update(p_actor uuid,p_display_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not exists(select 1 from auth.users where id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 60 or p_display_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_display_name' using errcode='23514';
  end if;
  update cashflow_profiles set display_name=btrim(p_display_name) where user_id=p_actor;
  select cashflow_profile_get(p_actor) into result; return result;
end $$;

create or replace function public.cashflow_group_user_search(p_actor uuid,p_group_id uuid,p_query text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare q text:=btrim(coalesce(p_query,'')); result jsonb;
begin
  if length(q) not between 2 and 60 then raise exception 'invalid_query' using errcode='22023'; end if;
  if not (exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') or
    exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor and role='leader')) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'publicId',s.public_id,'displayName',s.display_name)
    order by s.exact desc,s.display_name,s.public_id),'[]'::jsonb) into result
  from (select p.*, (upper(p.public_id)=upper(q)) exact from cashflow_profiles p
    where not exists(select 1 from cashflow_group_members m where m.group_id=p_group_id and m.user_id=p.user_id)
      and (upper(p.public_id)=upper(q) or strpos(lower(p.display_name),lower(q))>0)
    order by exact desc,p.display_name,p.public_id limit 10) s;
  return result;
end $$;

create or replace function public.cashflow_groups_snapshot(p_actor uuid,p_scope text default 'mine',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare is_admin boolean; groups_json jsonb; invites_json jsonb; total_count bigint;
begin
  if not exists(select 1 from auth.users where id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
  is_admin:=exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin');
  if p_scope not in ('mine','all') or p_page not between 0 and 10000 then raise exception 'invalid_query' using errcode='22023'; end if;
  if p_scope='all' and not is_admin then raise exception 'forbidden' using errcode='42501'; end if;
  select count(*) into total_count from cashflow_groups g where p_scope='all' or exists(select 1 from cashflow_group_members where group_id=g.id and user_id=p_actor);
  select coalesce(jsonb_agg(cashflow_group_summary(s.id,p_actor) order by s.created_at desc,s.id),'[]'::jsonb) into groups_json
  from (select g.id,g.created_at from cashflow_groups g where p_scope='all' or exists(select 1 from cashflow_group_members where group_id=g.id and user_id=p_actor)
    order by g.created_at desc,g.id limit 20 offset p_page*20) s;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'groupId',g.id,'groupName',g.name,'expiresAt',i.expires_at)
    order by i.created_at desc,i.id),'[]'::jsonb) into invites_json
  from cashflow_group_invitations i join cashflow_groups g on g.id=i.group_id left join auth.users u on u.id=p_actor
  where (i.invited_user_id=p_actor or (i.invited_user_id is null and i.email=lower(u.email))) and i.status='pending' and i.expires_at>now();
  return jsonb_build_object('systemRole',case when is_admin then 'admin' else 'user' end,'groups',groups_json,'invitations',invites_json,'total',total_count,'page',p_page);
end $$;

create or replace function public.cashflow_group_detail(p_actor uuid,p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; can_manage boolean; members_json jsonb; invites_json jsonb:='[]'; audit_json jsonb:='[]';
begin
  result:=cashflow_group_summary(p_group_id,p_actor); if result is null then raise exception 'group_not_found' using errcode='P0002'; end if;
  can_manage:=exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') or exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor and role='leader');
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'publicId',p.public_id,'displayName',p.display_name,'role',m.role,'joinedAt',m.joined_at)
    order by m.role desc,m.joined_at,p.user_id),'[]') into members_json from cashflow_group_members m join cashflow_profiles p on p.user_id=m.user_id where m.group_id=p_group_id;
  if can_manage then
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'groupId',i.group_id,'groupName',result->>'name','publicId',p.public_id,'displayName',p.display_name,'expiresAt',i.expires_at)
      order by i.created_at desc),'[]') into invites_json from cashflow_group_invitations i left join cashflow_profiles p on p.user_id=i.invited_user_id
      where i.group_id=p_group_id and i.status='pending' and i.expires_at>now();
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,
      'actorPublicId',ap.public_id,'actorDisplayName',ap.display_name,'targetPublicId',tp.public_id,'targetDisplayName',tp.display_name,'createdAt',a.created_at)
      order by a.created_at desc,a.id),'[]') into audit_json
    from (select * from cashflow_group_audit where group_id=p_group_id order by created_at desc,id limit 20) a
    left join cashflow_profiles ap on ap.user_id=a.actor_id left join cashflow_profiles tp on tp.user_id=a.target_id;
  end if;
  return result||jsonb_build_object('members',members_json,'invitations',invites_json,'activity',audit_json);
end $$;

-- Preserve all existing group actions while changing invitation identity from email to account ID.
create or replace function public.cashflow_group_invite_account(p_actor uuid,p_group_id uuid,p_target uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation_id uuid; target_email text;
begin
  perform 1 from cashflow_groups where id=p_group_id for update; if not found then raise exception 'group_not_found' using errcode='P0002'; end if;
  if not (exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') or exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor and role='leader')) then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from cashflow_profiles where user_id=p_target) then raise exception 'user_not_found' using errcode='P0002'; end if;
  if exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_target) then raise exception 'already_member' using errcode='P0001'; end if;
  if not exists(select 1 from cashflow_group_invitations where group_id=p_group_id and invited_user_id=p_target and status='pending' and expires_at>now())
    and (select count(*) from cashflow_group_invitations where group_id=p_group_id and status='pending' and expires_at>now())>=100 then raise exception 'invitation_limit' using errcode='P0001'; end if;
  select lower(email) into target_email from auth.users where id=p_target;
  insert into cashflow_group_invitations(group_id,email,invited_user_id,invited_by) values(p_group_id,target_email,p_target,p_actor)
  on conflict(group_id,email) do update set id=gen_random_uuid(),invited_user_id=p_target,invited_by=p_actor,status='pending',expires_at=now()+interval '7 days',created_at=now()
  returning id into invitation_id;
  insert into cashflow_group_audit(group_id,actor_id,target_id,action) values(p_group_id,p_actor,p_target,'invite');
  return invitation_id;
end $$;

create or replace function public.cashflow_group_invitation_respond(p_actor uuid,p_invitation_id uuid,p_accept boolean) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare inv cashflow_group_invitations%rowtype; gid uuid; confirmed timestamptz;
begin
  select * into inv from cashflow_group_invitations where id=p_invitation_id for update;
  if not found or inv.invited_user_id is distinct from p_actor then raise exception 'invitation_not_found' using errcode='P0002'; end if;
  gid:=inv.group_id; perform 1 from cashflow_groups where id=gid for update;
  if inv.status='accepted' and exists(select 1 from cashflow_group_members where group_id=gid and user_id=p_actor) then return gid; end if;
  if inv.status<>'pending' or inv.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='P0001'; end if;
  if p_accept then
    select email_confirmed_at into confirmed from auth.users where id=p_actor;
    if confirmed is null then raise exception 'verified_email_required' using errcode='P0001'; end if;
    if (select count(*) from cashflow_group_members where group_id=gid)>=100 or (select count(*) from cashflow_group_members where user_id=p_actor)>=200 then raise exception 'member_limit' using errcode='P0001'; end if;
    insert into cashflow_group_members(group_id,user_id,role) values(gid,p_actor,'member') on conflict do nothing;
    update cashflow_group_invitations set status='accepted' where id=inv.id;
  else update cashflow_group_invitations set status='declined' where id=inv.id; end if;
  insert into cashflow_group_audit(group_id,actor_id,action) values(gid,p_actor,case when p_accept then 'accept' else 'decline' end);
  return gid;
end $$;

create or replace function public.cashflow_admin_accounts(p_actor uuid,p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare users_json jsonb; total_count bigint; q text:=btrim(coalesce(p_search,''));
begin
  if not exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_page not between 0 and 10000 or length(q)>60 then raise exception 'invalid_query' using errcode='22023'; end if;
  select count(*) into total_count from cashflow_profiles p where q='' or upper(p.public_id)=upper(q) or strpos(lower(p.display_name),lower(q))>0;
  select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'publicId',s.public_id,'displayName',s.display_name,'role',coalesce(r.role,'user'),'createdAt',s.created_at)
    order by s.created_at desc,s.user_id),'[]') into users_json
  from (select p.* from cashflow_profiles p where q='' or upper(p.public_id)=upper(q) or strpos(lower(p.display_name),lower(q))>0 order by p.created_at desc,p.user_id limit 25 offset p_page*25) s
  left join cashflow_user_roles r on r.user_id=s.user_id;
  return jsonb_build_object('users',users_json,'total',total_count,'page',p_page);
end $$;

do $$ declare f record; begin
  alter table public.cashflow_profiles enable row level security;
  revoke all on table public.cashflow_profiles from public,anon,authenticated;
  grant select,insert,update,delete on table public.cashflow_profiles to service_role;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
    ('cashflow_profile_get','cashflow_profile_update','cashflow_group_user_search','cashflow_group_invite_account','cashflow_group_invitation_respond') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
