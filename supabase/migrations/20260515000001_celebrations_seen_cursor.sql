-- supabase/migrations/20260515000001_celebrations_seen_cursor.sql
-- Per-kid watermark for in-app celebration replay. NULL = "never opened
-- since this feature shipped" — the client sets a baseline on first open
-- so historical wins are not dumped retroactively (see design §6.1).

alter table public.profiles
  add column celebrations_seen_at timestamptz;

-- Advance a kid profile's celebration cursor. Caller must be a parent in
-- the same family as p_profile_id, and the target must be a kid profile.
-- Monotonic: never moves backward, so concurrent / out-of-order calls are
-- safe. p_seen_at is required (defensive: this RPC is exposed to the
-- `authenticated` role, so reject a NULL argument explicitly rather than
-- relying on caller discipline).
create or replace function public.mark_celebrations_seen(
  p_profile_id uuid,
  p_seen_at    timestamptz
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_caller_family uuid;
  v_target_family uuid;
begin
  if p_seen_at is null then
    raise exception 'p_seen_at_required';
  end if;

  select family_id into v_caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_caller_family is null then
    raise exception 'not_a_parent';
  end if;

  select family_id into v_target_family
  from public.profiles
  where id = p_profile_id and type = 'kid';

  if v_target_family is null or v_target_family <> v_caller_family then
    raise exception 'profile_not_in_family';
  end if;

  update public.profiles
     set celebrations_seen_at =
           greatest(coalesce(celebrations_seen_at, 'epoch'::timestamptz), p_seen_at)
   where id = p_profile_id;
end;
$$;

revoke all on function public.mark_celebrations_seen(uuid, timestamptz) from public;
grant execute on function public.mark_celebrations_seen(uuid, timestamptz) to authenticated;
