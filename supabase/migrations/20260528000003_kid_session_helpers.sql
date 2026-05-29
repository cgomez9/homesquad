-- supabase/migrations/20260528000003_kid_session_helpers.sql
-- Extend current_family_id() so kid sessions (auth.uid in kid_devices)
-- resolve to the kid's family. Add current_kid_id() for write-side checks.

create or replace function public.current_family_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select family_id from (
    select family_id, 1 as ord
      from public.profiles
      where user_id = auth.uid() and type = 'parent'
    union all
    select family_id, 2 as ord
      from public.kid_devices
      where user_id = auth.uid() and revoked_at is null
  ) s
  order by ord
  limit 1
$$;

create or replace function public.current_kid_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select kid_id from public.kid_devices
    where user_id = auth.uid() and revoked_at is null
    limit 1
$$;

comment on function public.current_kid_id is
  'Returns the kid_id for a kid-session caller (anon user bound to a kid_device), or null.';

comment on function public.current_family_id is
  'Returns the family_id for the calling session. Resolves parent profiles and kid-device sessions. Null if the session is not associated with any family.';

-- Drop the test-convenience INSERT policy added in 20260528000001. Now that
-- this migration extends current_family_id() to resolve kid sessions, that
-- policy would allow a paired kid session to INSERT kid_devices rows
-- arbitrarily within its family — an escalation path the security-definer
-- redeem_device_pairing RPC (Task 5) does not need.
drop policy kid_devices_insert_own_family on public.kid_devices;
