create or replace function public.create_family(
  family_name   text,
  parent_name   text,
  parent_avatar smallint
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id   uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  -- One family per parent (uniqueness enforced by profiles_one_parent_per_family).
  if exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'User already belongs to a family';
  end if;

  insert into public.families(name) values (family_name) returning id into v_family_id;

  insert into public.profiles(family_id, type, display_name, avatar_id, user_id)
  values (v_family_id, 'parent', parent_name, parent_avatar, v_user_id);

  return v_family_id;
end;
$$;

revoke all on function public.create_family(text, text, smallint) from public;
grant execute on function public.create_family(text, text, smallint) to authenticated;

comment on function public.create_family is
  'Atomically creates a family and the calling user''s parent profile. Returns family_id.';
