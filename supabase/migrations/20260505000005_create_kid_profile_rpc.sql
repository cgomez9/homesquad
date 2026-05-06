create or replace function public.create_kid_profile(
  kid_name   text,
  avatar     smallint,
  pin_hash   text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_family_id uuid := public.current_family_id();
  v_kid_id    uuid;
begin
  if v_family_id is null then
    raise exception 'Caller has no family';
  end if;

  -- Free tier limit: max 2 kids. (Pro check is added in M6.)
  if (select count(*) from public.profiles
        where family_id = v_family_id and type = 'kid') >= 2
     and (select subscription_tier from public.families where id = v_family_id) = 'free'
  then
    raise exception 'Free tier limit: 2 kids per family';
  end if;

  insert into public.profiles(family_id, type, display_name, avatar_id, pin_hash)
  values (v_family_id, 'kid', kid_name, avatar, pin_hash)
  returning id into v_kid_id;

  return v_kid_id;
end;
$$;

revoke all on function public.create_kid_profile(text, smallint, text) from public;
grant execute on function public.create_kid_profile(text, smallint, text) to authenticated;
