-- supabase/migrations/20260528000004_start_device_pairing_rpc.sql
-- Parent generates a 6-digit, 5-minute, single-use code for pairing a kid device.

create or replace function public.start_device_pairing(target_kid_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
declare
  caller_family uuid;
  v_code        char(6);
  v_expires     timestamptz;
  v_kid_family  uuid;
  v_attempts    int := 0;
begin
  select family_id into caller_family
    from public.profiles
    where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select family_id into v_kid_family
    from public.profiles
    where id = target_kid_id and type = 'kid';
  if v_kid_family is null or v_kid_family <> caller_family then
    raise exception 'kid_id % not a kid in caller family', target_kid_id;
  end if;

  v_expires := now() + interval '5 minutes';

  -- Retry on collision (extremely rare with 1M codespace + few outstanding).
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at)
      values (v_code, target_kid_id, caller_family, auth.uid(), v_expires);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique pairing code after 5 attempts';
      end if;
    end;
  end loop;

  return query select v_code::text, v_expires;
end;
$$;

revoke all on function public.start_device_pairing(uuid) from public;
grant execute on function public.start_device_pairing(uuid) to authenticated;
