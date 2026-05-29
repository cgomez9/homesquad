-- set_push_token writes to kid_devices for kid sessions, profiles for parent
-- sessions. Caller picks by which path resolves auth.uid() first.

create or replace function public.set_push_token(token text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_device  uuid;
begin
  select id into caller_profile from public.profiles where user_id = auth.uid();
  if caller_profile is not null then
    update public.profiles set push_token = token where id = caller_profile;
    return;
  end if;

  select id into caller_device from public.kid_devices where user_id = auth.uid() and revoked_at is null;
  if caller_device is not null then
    update public.kid_devices set push_token = token, last_seen_at = now() where id = caller_device;
    return;
  end if;

  raise exception 'no profile or device for caller';
end;
$$;
