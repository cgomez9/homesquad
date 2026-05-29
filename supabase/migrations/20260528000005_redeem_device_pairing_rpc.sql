-- supabase/migrations/20260528000005_redeem_device_pairing_rpc.sql
-- Kid device (anonymous Supabase session) redeems a pairing code, binding
-- the auth.uid() to a kid_id via kid_devices. Single generic error on every
-- failure path. Idempotent on retry by the same auth.uid.

create or replace function public.redeem_device_pairing(
  pair_code   text,
  device_name text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_code public.kid_pairing_codes%rowtype;
  v_existing public.kid_devices%rowtype;
  v_recent_failures int;
  v_ip inet;
begin
  if auth.uid() is null then
    raise exception 'Invalid or expired code';
  end if;

  -- Defensive guard: device_name is normally Device.deviceName from expo-device
  -- which is a short OS string. Reject anything outside reasonable bounds with
  -- the same generic error to avoid enumeration.
  if device_name is null or char_length(device_name) < 1 or char_length(device_name) > 200 then
    raise exception 'Invalid or expired code';
  end if;

  -- Rate limit: >= 10 failures in last 10 min from the caller's IP -> reject.
  -- x-forwarded-for is a comma-separated list when there are multiple proxies
  -- ("client, lb1, lb2"). Take only the leftmost (client) IP. NULL/empty -> no
  -- IP context, so rate limiting is skipped (managed-platform fallback).
  v_ip := nullif(
    trim(split_part(
      coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''),
      ',', 1
    )),
    ''
  )::inet;
  if v_ip is not null then
    select count(*) into v_recent_failures
      from public.pairing_redeem_attempts
      where ip = v_ip and attempted_at > now() - interval '10 minutes';
    if v_recent_failures >= 10 then
      raise exception 'Invalid or expired code';
    end if;
  end if;

  -- Idempotency: same auth.uid already paired via this exact code?
  -- Join on both kid_id AND the code being used_at (so a different code for
  -- the same kid does NOT trigger the idempotency short-circuit).
  select kd.* into v_existing
    from public.kid_devices kd
    join public.kid_pairing_codes pc
      on pc.kid_id = kd.kid_id
     and pc.code = pair_code
     and pc.used_at is not null
    where kd.user_id = auth.uid()
    limit 1;
  if v_existing.id is not null then
    return v_existing.kid_id;
  end if;

  -- One auth.uid maps to at most one kid_device. Different code -> reject.
  if exists (select 1 from public.kid_devices where user_id = auth.uid()) then
    if v_ip is not null then
      insert into public.pairing_redeem_attempts(ip) values (v_ip);
    end if;
    raise exception 'Invalid or expired code';
  end if;

  select * into v_code
    from public.kid_pairing_codes
    where code = pair_code
    for update;

  if v_code.code is null
     or v_code.used_at is not null
     or v_code.expires_at < now()
  then
    if v_ip is not null then
      insert into public.pairing_redeem_attempts(ip) values (v_ip);
    end if;
    raise exception 'Invalid or expired code';
  end if;

  update public.kid_pairing_codes set used_at = now() where code = v_code.code;

  insert into public.kid_devices(kid_id, family_id, user_id, device_name)
    values (v_code.kid_id, v_code.family_id, auth.uid(), device_name);

  return v_code.kid_id;
end;
$$;

revoke all on function public.redeem_device_pairing(text, text) from public;
grant execute on function public.redeem_device_pairing(text, text) to authenticated;
