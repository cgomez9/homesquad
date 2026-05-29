-- Parent unpairs a kid device. Deletes the auth.users row, which cascades
-- to kid_devices. Refresh tokens for that user become invalid immediately.

create or replace function public.revoke_kid_device(device_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  caller_family uuid;
  v_user_id     uuid;
begin
  select family_id into caller_family
    from public.profiles
    where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select user_id into v_user_id
    from public.kid_devices
    where id = device_id and family_id = caller_family;
  if v_user_id is null then
    raise exception 'device_id % not in caller family', device_id;
  end if;

  delete from auth.users where id = v_user_id;
  -- kid_devices row removed by FK cascade on user_id.
end;
$$;

revoke all on function public.revoke_kid_device(uuid) from public;
grant execute on function public.revoke_kid_device(uuid) to authenticated;
