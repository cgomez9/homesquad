-- Shared actor-authorization gate used by every chore-action RPC.

create or replace function public.resolve_actor_profile_id(p_actor_profile_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_family       uuid;
  v_kid          uuid;
  v_actor_family uuid;
begin
  v_family := public.current_family_id();
  if v_family is null then
    raise exception 'caller not in a family';
  end if;

  v_kid := public.current_kid_id();
  if v_kid is not null and v_kid <> p_actor_profile_id then
    raise exception 'kid session may only act as itself';
  end if;

  select family_id into v_actor_family
    from public.profiles where id = p_actor_profile_id;
  if v_actor_family is null or v_actor_family <> v_family then
    raise exception 'actor not in caller family';
  end if;

  return p_actor_profile_id;
end $$;

revoke all on function public.resolve_actor_profile_id(uuid) from public;
grant execute on function public.resolve_actor_profile_id(uuid) to authenticated;
