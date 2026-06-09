-- supabase/migrations/20260609000012_finish_chore_parent_skill_credits_kid.sql
-- When a parent finishes a skill task on a kid's behalf, credit the chore's
-- assigned kid (chore_instances.assignee_profile_id) with token_value and
-- bump that chore's skill streak. Previously the parent-skill path no-oped
-- because we didn't want to "guess" the recipient — chore_instances always
-- carries the assignee snapshot, so we can use it directly. If the instance
-- is unassigned at parent-finish time, we still no-op (no kid to credit).
--
-- All other branches (parent-star, kid-skill auto, kid-star auto,
-- kid-photo, kid-approval) are unchanged from 20260609000007.

create or replace function public.finish_chore(
  instance_id      uuid,
  actor_profile_id uuid,
  photo_url        text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mode         text;
  v_actor_type   text;
  v_kind         text;
  v_star_value   int;
  v_token_value  int;
  v_chore_id     uuid;
  v_family       uuid;
  v_inst_assignee uuid;
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  select c.id, c.verification_mode, c.kind, c.star_value, c.token_value,
         ci.family_id, ci.assignee_profile_id, p.type
    into v_chore_id, v_mode, v_kind, v_star_value, v_token_value,
         v_family, v_inst_assignee, v_actor_type
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

  -- ── Parent path ───────────────────────────────────────────────────────────
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
    elsif v_kind = 'skill' and v_inst_assignee is not null then
      -- Credit the intended kid (instance snapshot). If unassigned, no-op:
      -- tokens are per-kid and we don't have a recipient.
      insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
      values (v_family, v_inst_assignee, v_token_value, 'skill_approved', instance_id);

      perform public.bump_skill_streak(v_chore_id);
    end if;
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

  update public.chore_instances
     set status       = 'finished',
         finished_at  = now(),
         completed_at = now(),
         completed_by = actor_profile_id
   where id = instance_id;
end $$;

revoke all on function public.finish_chore(uuid, uuid, text) from public;
grant execute on function public.finish_chore(uuid, uuid, text) to authenticated;
