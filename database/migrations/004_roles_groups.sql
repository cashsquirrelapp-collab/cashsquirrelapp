-- System roles are separate from group membership. Browser roles have no direct
-- access: the BFF supplies a provider-verified actor to these service-only RPCs.
begin;

create table if not exists public.cashflow_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin','user')),
  updated_at timestamptz not null default now()
);
insert into public.cashflow_user_roles(user_id) select id from auth.users on conflict do nothing;
create or replace function public.cashflow_init_user_role() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- raw_user_meta_data is user-editable and must never grant admin.
  insert into cashflow_user_roles(user_id,role) values(new.id,'user') on conflict do nothing;
  return new;
end $$;
drop trigger if exists cashflow_init_user_role on auth.users;
create trigger cashflow_init_user_role after insert on auth.users
for each row execute function public.cashflow_init_user_role();

create table if not exists public.cashflow_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description)<=500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cashflow_groups_creator on cashflow_groups(created_by);
create table if not exists public.cashflow_group_members (
  group_id uuid not null references cashflow_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('leader','member')),
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create index if not exists cashflow_group_members_user on cashflow_group_members(user_id);
create table if not exists public.cashflow_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references cashflow_groups(id) on delete cascade,
  email text not null check (email=lower(btrim(email)) and length(email) between 3 and 254),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  created_at timestamptz not null default now(),
  unique(group_id,email)
);
create index if not exists cashflow_group_invitations_email on cashflow_group_invitations(email) where status='pending';
create table if not exists public.cashflow_group_audit (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references cashflow_groups(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists cashflow_group_audit_recent on cashflow_group_audit(group_id,created_at desc);
create table if not exists public.cashflow_role_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  old_role text not null,
  new_role text not null,
  created_at timestamptz not null default now()
);

-- A deferred check also protects future backend code that writes membership
-- directly. All supported membership changes first serialize on the group row.
create or replace function public.cashflow_require_group_leader() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid;
begin
  if tg_table_name='cashflow_groups' then gid:=new.id;
  elsif tg_op='DELETE' then gid:=old.group_id;
  else gid:=new.group_id; end if;
  perform 1 from cashflow_groups where id=gid for update;
  if found and not exists(select 1 from cashflow_group_members where group_id=gid and role='leader') then
    raise exception using errcode='P0001',message='last_leader';
  end if;
  if tg_table_name='cashflow_group_members' then
    if tg_op='UPDATE' and old.group_id<>new.group_id then
      perform 1 from cashflow_groups where id=old.group_id for update;
      if found and not exists(select 1 from cashflow_group_members where group_id=old.group_id and role='leader') then
        raise exception using errcode='P0001',message='last_leader';
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists cashflow_group_has_leader on cashflow_groups;
create constraint trigger cashflow_group_has_leader after insert on cashflow_groups
deferrable initially deferred for each row execute function cashflow_require_group_leader();
drop trigger if exists cashflow_members_have_leader on cashflow_group_members;
create constraint trigger cashflow_members_have_leader after insert or update or delete on cashflow_group_members
deferrable initially deferred for each row execute function cashflow_require_group_leader();

create or replace function public.cashflow_group_summary(p_group_id uuid,p_actor uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'createdAt',g.created_at,
    'myRole',(select role from cashflow_group_members where group_id=g.id and user_id=p_actor),
    'memberCount',(select count(*) from cashflow_group_members where group_id=g.id),
    'leaderCount',(select count(*) from cashflow_group_members where group_id=g.id and role='leader'))
  from cashflow_groups g where g.id=p_group_id
    and (exists(select 1 from cashflow_group_members where group_id=g.id and user_id=p_actor)
      or exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin'));
$$;

create or replace function public.cashflow_groups_snapshot(p_actor uuid,p_scope text default 'mine',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare is_admin boolean; groups_json jsonb; invites_json jsonb; total_count bigint;
begin
  if not exists(select 1 from auth.users where id=p_actor) then raise exception using errcode='42501',message='forbidden'; end if;
  is_admin:=exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin');
  if p_scope not in ('mine','all') or p_page not between 0 and 10000 then raise exception using errcode='22023',message='invalid_query'; end if;
  if p_scope='all' and not is_admin then raise exception using errcode='42501',message='forbidden'; end if;
  select count(*) into total_count from cashflow_groups g where p_scope='all'
    or exists(select 1 from cashflow_group_members where group_id=g.id and user_id=p_actor);
  select coalesce(jsonb_agg(cashflow_group_summary(s.id,p_actor) order by s.created_at desc,s.id),'[]'::jsonb) into groups_json
    from (select g.id,g.created_at from cashflow_groups g where p_scope='all'
      or exists(select 1 from cashflow_group_members where group_id=g.id and user_id=p_actor)
      order by g.created_at desc,g.id limit 20 offset p_page*20) s;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'groupId',g.id,'groupName',g.name,'expiresAt',i.expires_at)
    order by i.created_at desc,i.id),'[]'::jsonb) into invites_json
    from (select i.* from cashflow_group_invitations i join auth.users u on u.id=p_actor
      where i.email=lower(u.email) and i.status='pending' and i.expires_at>now()
      order by i.created_at desc,i.id limit 100) i join cashflow_groups g on g.id=i.group_id;
  return jsonb_build_object('systemRole',case when is_admin then 'admin' else 'user' end,
    'groups',groups_json,'invitations',invites_json,'total',total_count,'page',p_page);
end $$;

create or replace function public.cashflow_group_detail(p_actor uuid,p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb; can_manage boolean; members_json jsonb; invites_json jsonb:='[]'::jsonb; audit_json jsonb:='[]'::jsonb;
begin
  result:=cashflow_group_summary(p_group_id,p_actor);
  if result is null then raise exception using errcode='P0002',message='group_not_found'; end if;
  can_manage:=exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin')
    or exists(select 1 from cashflow_group_members where group_id=p_group_id and user_id=p_actor and role='leader');
  select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'email',coalesce(u.email,''),
    'name',left(coalesce(u.raw_user_meta_data->>'full_name',''),120),'role',m.role,'joinedAt',m.joined_at)
    order by m.role desc,m.joined_at,u.id),'[]'::jsonb) into members_json
    from cashflow_group_members m join auth.users u on u.id=m.user_id where m.group_id=p_group_id;
  if can_manage then
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'groupId',i.group_id,'groupName',result->>'name',
      'email',i.email,'expiresAt',i.expires_at) order by i.created_at desc),'[]'::jsonb) into invites_json
      from cashflow_group_invitations i where i.group_id=p_group_id and i.status='pending' and i.expires_at>now();
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorEmail',u.email,
      'targetEmail',t.email,'createdAt',a.created_at) order by a.created_at desc,a.id),'[]'::jsonb) into audit_json
      from (select * from cashflow_group_audit where group_id=p_group_id order by created_at desc,id limit 20) a
      left join auth.users u on u.id=a.actor_id left join auth.users t on t.id=a.target_id;
  end if;
  return result||jsonb_build_object('members',members_json,'invitations',invites_json,'activity',audit_json);
end $$;

create or replace function public.cashflow_group_mutate(p_actor uuid,p_action text,p_input jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid; target uuid; actor_role text; target_role text; is_admin boolean;
  g cashflow_groups%rowtype; inv cashflow_group_invitations%rowtype; actor_email text; confirmed timestamptz; invite_email text;
begin
  select lower(email),email_confirmed_at into actor_email,confirmed from auth.users where id=p_actor;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  -- Serialize this actor's quota checks, then group changes. Every membership
  -- change locks the same group row BEFORE reading its current authorization.
  perform pg_advisory_xact_lock(hashtextextended('cashflow-groups:'||p_actor::text,0));
  if p_action='create' then
    gid:=(p_input->>'groupId')::uuid;
    select * into g from cashflow_groups where id=gid;
    if found then
      if g.created_by=p_actor and exists(select 1 from cashflow_group_members where group_id=gid and user_id=p_actor) then return gid; end if;
      raise exception using errcode='P0001',message='duplicate_group';
    end if;
    if (select count(*) from cashflow_groups where created_by=p_actor)>=50 then raise exception using errcode='P0001',message='group_limit'; end if;
    if (select count(*) from cashflow_group_members where user_id=p_actor)>=200 then raise exception using errcode='P0001',message='member_limit'; end if;
    insert into cashflow_groups(id,name,description,created_by) values(gid,btrim(p_input->>'name'),coalesce(p_input->>'description',''),p_actor);
    insert into cashflow_group_members(group_id,user_id,role) values(gid,p_actor,'leader');
    insert into cashflow_group_audit(group_id,actor_id,action) values(gid,p_actor,'create');
    return gid;
  end if;
  if p_action in ('accept','decline') then
    select group_id into gid from cashflow_group_invitations where id=(p_input->>'invitationId')::uuid;
    if not found then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  else gid:=(p_input->>'groupId')::uuid; end if;
  select * into g from cashflow_groups where id=gid for update;
  if not found then raise exception using errcode='P0002',message='group_not_found'; end if;
  is_admin:=exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin');
  select role into actor_role from cashflow_group_members where group_id=gid and user_id=p_actor;

  if p_action in ('accept','decline') then
    select lower(email),email_confirmed_at into actor_email,confirmed from auth.users where id=p_actor;
    select * into inv from cashflow_group_invitations where id=(p_input->>'invitationId')::uuid and group_id=gid for update;
    if not found or inv.email is distinct from actor_email then raise exception using errcode='P0002',message='invitation_not_found'; end if;
    if p_action='accept' and confirmed is null then raise exception using errcode='P0001',message='verified_email_required'; end if;
    if p_action='accept' and inv.status='accepted' and actor_role is not null then return gid; end if;
    if inv.status<>'pending' or inv.expires_at<=now() then raise exception using errcode='P0001',message='invitation_unavailable'; end if;
    if p_action='accept' then
      if actor_role is null then
        if (select count(*) from cashflow_group_members where group_id=gid)>=100
          or (select count(*) from cashflow_group_members where user_id=p_actor)>=200 then raise exception using errcode='P0001',message='member_limit'; end if;
        insert into cashflow_group_members(group_id,user_id,role) values(gid,p_actor,'member');
      end if;
      update cashflow_group_invitations set status='accepted' where id=inv.id;
    else update cashflow_group_invitations set status='declined' where id=inv.id; end if;
  elsif p_action='leave' then
    if actor_role is null then raise exception using errcode='P0002',message='member_not_found'; end if;
    if actor_role='leader' and (select count(*) from cashflow_group_members where group_id=gid and role='leader')<=1 then raise exception using errcode='P0001',message='last_leader'; end if;
    delete from cashflow_group_members where group_id=gid and user_id=p_actor;
  else
    if not is_admin and actor_role is distinct from 'leader' then raise exception using errcode='42501',message='forbidden'; end if;
    if p_action='rename' then
      update cashflow_groups set name=btrim(p_input->>'name'),description=coalesce(p_input->>'description','') where id=gid;
    elsif p_action='delete' then
      delete from cashflow_groups where id=gid;
      return gid;
    elsif p_action='invite' then
      invite_email:=lower(btrim(p_input->>'email'));
      if invite_email is null or length(invite_email)>254 or invite_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='23514',message='invalid_email'; end if;
      if exists(select 1 from cashflow_group_members m join auth.users u on u.id=m.user_id where m.group_id=gid and lower(u.email)=invite_email) then raise exception using errcode='P0001',message='already_member'; end if;
      if not exists(select 1 from cashflow_group_invitations where group_id=gid and email=invite_email and status='pending' and expires_at>now())
        and (select count(*) from cashflow_group_invitations where group_id=gid and status='pending' and expires_at>now())>=100 then raise exception using errcode='P0001',message='invitation_limit'; end if;
      insert into cashflow_group_invitations(group_id,email,invited_by) values(gid,invite_email,p_actor)
        on conflict(group_id,email) do update set id=gen_random_uuid(),invited_by=p_actor,status='pending',expires_at=now()+interval '7 days',created_at=now();
    elsif p_action='revoke-invite' then
      update cashflow_group_invitations set status='revoked' where id=(p_input->>'invitationId')::uuid and group_id=gid and status='pending';
      if not found then raise exception using errcode='P0002',message='invitation_not_found'; end if;
    elsif p_action in ('member-role','transfer','remove-member') then
      target:=(p_input->>'userId')::uuid;
      select role into target_role from cashflow_group_members where group_id=gid and user_id=target;
      if not found then raise exception using errcode='P0002',message='member_not_found'; end if;
      if p_action='transfer' then
        if actor_role is distinct from 'leader' then raise exception using errcode='42501',message='forbidden'; end if;
        if target=p_actor then raise exception using errcode='P0001',message='same_member'; end if;
        update cashflow_group_members set role='leader' where group_id=gid and user_id=target;
        update cashflow_group_members set role='member' where group_id=gid and user_id=p_actor;
      else
        if p_action='remove-member' and target=p_actor then raise exception using errcode='P0001',message='use_leave'; end if;
        if p_action='member-role' and (p_input->>'role' is null or p_input->>'role' not in ('leader','member')) then raise exception using errcode='23514',message='invalid_role'; end if;
        if target_role='leader' and (p_action='remove-member' or p_input->>'role'='member')
          and (select count(*) from cashflow_group_members where group_id=gid and role='leader')<=1 then raise exception using errcode='P0001',message='last_leader'; end if;
        if p_action='remove-member' then delete from cashflow_group_members where group_id=gid and user_id=target;
        else update cashflow_group_members set role=p_input->>'role' where group_id=gid and user_id=target; end if;
      end if;
    else raise exception using errcode='22023',message='invalid_action'; end if;
  end if;
  update cashflow_groups set updated_at=now() where id=gid;
  insert into cashflow_group_audit(group_id,actor_id,target_id,action) values(gid,p_actor,target,p_action||case when p_action='member-role' then ':'||(p_input->>'role') else '' end);
  return gid;
end $$;

create or replace function public.cashflow_admin_accounts(p_actor uuid,p_search text default '',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare users_json jsonb; total_count bigint;
begin
  if not exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') then raise exception using errcode='42501',message='forbidden'; end if;
  if p_page not between 0 and 10000 or length(p_search)>254 then raise exception using errcode='22023',message='invalid_query'; end if;
  -- Literal substring matching: wildcard characters do not widen the query.
  select count(*) into total_count from auth.users where strpos(lower(coalesce(email,'')),lower(p_search))>0;
  select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'email',coalesce(u.email,''),'role',coalesce(r.role,'user'),'createdAt',u.created_at)
    order by u.created_at desc,u.id),'[]'::jsonb) into users_json
    from (select * from auth.users where strpos(lower(coalesce(email,'')),lower(p_search))>0 order by created_at desc,id limit 25 offset p_page*25) u
    left join cashflow_user_roles r on r.user_id=u.id;
  return jsonb_build_object('users',users_json,'total',total_count,'page',p_page);
end $$;

create or replace function public.cashflow_set_system_role(p_actor uuid,p_target uuid,p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare previous text;
begin
  perform pg_advisory_xact_lock(hashtextextended('cashflow-system-roles',0));
  if not exists(select 1 from cashflow_user_roles where user_id=p_actor and role='admin') then raise exception using errcode='42501',message='forbidden'; end if;
  if p_role is null or p_role not in ('admin','user') then raise exception using errcode='23514',message='invalid_role'; end if;
  if not exists(select 1 from auth.users where id=p_target) then raise exception using errcode='P0002',message='user_not_found'; end if;
  select role into previous from cashflow_user_roles where user_id=p_target;
  previous:=coalesce(previous,'user');
  if previous='admin' and p_role='user' and (select count(*) from cashflow_user_roles where role='admin')<=1 then raise exception using errcode='P0001',message='last_admin'; end if;
  insert into cashflow_user_roles(user_id,role) values(p_target,p_role)
    on conflict(user_id) do update set role=excluded.role,updated_at=now();
  if previous<>p_role then insert into cashflow_role_audit(actor_id,target_id,old_role,new_role) values(p_actor,p_target,previous,p_role); end if;
end $$;

do $$
declare t text; f record;
begin
  foreach t in array array['cashflow_user_roles','cashflow_groups','cashflow_group_members','cashflow_group_invitations','cashflow_group_audit','cashflow_role_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cashflow_init_user_role','cashflow_require_group_leader','cashflow_group_summary',
      'cashflow_groups_snapshot','cashflow_group_detail','cashflow_group_mutate','cashflow_admin_accounts','cashflow_set_system_role')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
