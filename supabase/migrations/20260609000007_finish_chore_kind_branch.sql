-- supabase/migrations/20260609000007_finish_chore_kind_branch.sql
-- finish_chore now branches on chores.kind. The change is purely additive
-- for star chores (behavior unchanged from 20260529000007). Skill tasks
-- credit privilege_token_ledger instead of star_ledger and bump the
-- per-chore skill streak.
--
-- Parent-path note: when a parent finishes a skill task on a kid's behalf,
-- we do NOT credit tokens. The star-path equivalent uses credit_family_pool
-- which targets the family-goal pool (no specific kid); tokens are per-kid
-- and we don't want to guess the recipient. The instance is still marked
-- approved so the UI reflects completion. Re-evaluate if real users hit this.

create or replace function public.finish_chore(
  instance_id      uuid,
  actor_profile_id uuid,
  photo_url        text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mode        text;
  v_actor_type  text;
  v_kind        text;
  v_star_value  int;
  v_token_value int;
  v_chore_id    uuid;
  v_family      uuid;
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  select c.id, c.verification_mode, c.kind, c.star_value, c.token_value, ci.family_id, p.type
    into v_chore_id, v_mode, v_kind, v_star_value, v_token_value, v_family, v_actor_type
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

  -- ── Parent path: approve immediately ──────────────────────────────────────
  if v_actor_type = 'parent' then
    update public.chore_instances
       set status       = 'approved',
           finished_at  = now(),
           approved_at  = now(),
           approved_by  = actor_profile_id,
           completed_at = now(),
           completed_by = actor_profile_id
     where id = instance_id;

    if v_kind = 'chore' then
      perform public.credit_family_pool(v_family, actor_profile_id, v_star_value);
    end if;
    -- Skill kind: see header note. No ledger insert, no streak bump.
    return;
  end if;

  -- ── Kid path ──────────────────────────────────────────────────────────────
  if v_mode = 'auto' then
    if v_kind = 'skill' then
      update public.chore_instances
         set status        = 'approved',
             finished_at   = now(),
             approved_at   = now(),
             approved_by   = actor_profile_id,
             completed_at  = now(),
             completed_by  = actor_profile_id,
             stars_awarded = null
       where id = instance_id;

      insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
      values (v_family, actor_profile_id, v_token_value, 'skill_approved', instance_id);

      perform public.bump_skill_streak(v_chore_id);
      return;
    end if;

    -- star chore auto-path (unchanged from 20260529000007)
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
