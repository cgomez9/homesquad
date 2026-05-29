-- supabase/migrations/20260529000007_finish_chore_rpc.sql
-- finish_chore: 6-cell matrix (3 verification modes × 2 actor types).
--
--   kid  + auto     -> approved immediately; star_ledger row for the kid;
--                       streaks/achievements fire via existing triggers.
--   kid  + photo    -> finished (awaits parent review); photo_url required.
--   kid  + approval -> finished (awaits parent review).
--   parent + any    -> approved immediately; credit_family_pool(family, parent, stars)
--                       inserts a star_ledger row attributed to the parent;
--                       check_active_goal trigger handles goal completion.
--
-- The SELECT … FOR UPDATE lock prevents two concurrent transactions from
-- finishing the same instance simultaneously.

create or replace function public.finish_chore(
  instance_id      uuid,
  actor_profile_id uuid,
  photo_url        text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mode       text;
  v_actor_type text;
  v_star_value int;
  v_family     uuid;
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  select c.verification_mode, c.star_value, ci.family_id, p.type
    into v_mode, v_star_value, v_family, v_actor_type
    from public.chore_instances ci
    join public.chores          c  on c.id = ci.chore_id
    join public.profiles        p  on p.id = actor_profile_id
   where ci.id                  = instance_id
     and ci.assignee_profile_id = actor_profile_id
     and ci.status              = 'started'
   for update;

  if not found then
    raise exception 'chore not finishable';
  end if;

  -- ── Parent path: bypass verification mode, approve immediately ─────────────
  if v_actor_type = 'parent' then
    update public.chore_instances
       set status       = 'approved',
           finished_at  = now(),
           approved_at  = now(),
           approved_by  = actor_profile_id,
           completed_at = now(),
           completed_by = actor_profile_id
     where id = instance_id;

    -- credit_family_pool (Task 3): inserts a star_ledger row attributed to
    -- the parent; the check_active_goal trigger fires after the INSERT and
    -- flips the goal to 'completed' when cumulative deltas reach target_stars.
    perform public.credit_family_pool(v_family, actor_profile_id, v_star_value);
    return;
  end if;

  -- ── Kid path: behaviour depends on verification mode ──────────────────────
  if v_mode = 'auto' then
    -- Auto-approved: kid gets stars immediately.
    update public.chore_instances
       set status        = 'approved',
           finished_at   = now(),
           approved_at   = now(),
           approved_by   = actor_profile_id,
           completed_at  = now(),
           completed_by  = actor_profile_id,
           stars_awarded = v_star_value
     where id = instance_id;

    insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
    values (v_family, actor_profile_id, v_star_value, 'chore_approved', instance_id);
    return;
  end if;

  if v_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;

    update public.chore_instances
       set status       = 'finished',
           finished_at  = now(),
           completed_at = now(),
           completed_by = actor_profile_id,
           photo_url    = finish_chore.photo_url
     where id = instance_id;
    return;
  end if;

  -- approval mode: move to finished; parent will approve/reject separately.
  update public.chore_instances
     set status       = 'finished',
         finished_at  = now(),
         completed_at = now(),
         completed_by = actor_profile_id
   where id = instance_id;
end $$;

revoke all on function public.finish_chore(uuid, uuid, text) from public;
grant execute on function public.finish_chore(uuid, uuid, text) to authenticated;
