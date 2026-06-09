-- supabase/migrations/20260609000009_privilege_crud_rpcs.sql
-- create_privilege / update_privilege / archive_privilege.
-- Bodies mirror create_reward / update_reward / archive_reward; the only
-- material differences are the table name and the cost field
-- (star_cost -> token_cost).

create or replace function public.create_privilege(
  family_id   uuid,
  title       text,
  description text,
  token_cost  int,
  icon_id     smallint
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  new_id uuid;
begin
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent'
    and profiles.family_id = create_privilege.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  insert into public.privileges(family_id, title, description, token_cost, icon_id, created_by)
  values (create_privilege.family_id, create_privilege.title, create_privilege.description,
          create_privilege.token_cost, create_privilege.icon_id, caller_profile)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.update_privilege(
  privilege_id uuid,
  title        text default null,
  description  text default null,
  token_cost   int  default null,
  icon_id      smallint default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_family uuid; target_family uuid;
begin
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select pr.family_id into target_family from public.privileges pr where pr.id = privilege_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'privilege % not in caller family', privilege_id;
  end if;

  update public.privileges set
    title       = coalesce(update_privilege.title, privileges.title),
    description = coalesce(update_privilege.description, privileges.description),
    token_cost  = coalesce(update_privilege.token_cost, privileges.token_cost),
    icon_id     = coalesce(update_privilege.icon_id, privileges.icon_id)
  where id = privilege_id;
end;
$$;

create or replace function public.archive_privilege(privilege_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_family uuid; target_family uuid;
begin
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select pr.family_id into target_family
    from public.privileges pr where pr.id = archive_privilege.privilege_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'privilege % not in caller family', privilege_id;
  end if;

  update public.privileges set active = false where id = archive_privilege.privilege_id;
end;
$$;
