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
