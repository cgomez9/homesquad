create or replace function public.set_quiet_hours(
  p_enabled  boolean,
  p_start    time,
  p_end      time,
  p_timezone text
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_family_id  uuid;
begin
  -- Caller must be a parent.
  select id, family_id into v_profile_id, v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  -- Validate timezone against pg_timezone_names.
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;

  update public.families
     set quiet_hours_enabled = p_enabled,
         quiet_hours_start   = p_start,
         quiet_hours_end     = p_end,
         timezone            = p_timezone
   where id = v_family_id;
end;
$$;

revoke all on function public.set_quiet_hours(boolean, time, time, text) from public;
grant execute on function public.set_quiet_hours(boolean, time, time, text) to authenticated;
