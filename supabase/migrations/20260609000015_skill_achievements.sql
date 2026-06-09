-- supabase/migrations/20260609000015_skill_achievements.sql
-- Extend the achievement pipeline for skill tasks.
--
-- 1. check_achievements gains:
--    - star_chore_count narrowed to chores.kind='chore' (existing first_chore
--      and chores_25 should mean star chores; skill tasks get their own).
--      Existing data is unchanged: every pre-feature chore row defaults to
--      kind='chore'.
--    - skill_chore_count for skill-task approvals.
--    - skill_streak_max for the highest current/longest streak across any
--      kind='skill' chore currently assigned to this kid.
--    - Four new keys: first_skill_task, skill_tasks_25, skill_tasks_100,
--      skill_streak_14.
--
-- 2. approve_chore + finish_chore skill paths now call check_achievements.
--    Previously these paths returned before the achievement check (which only
--    fired on the star path) — so even after this migration, skill-only kids
--    would never unlock achievements. Bug-bug-style omission from
--    20260609000008 / 20260609000012; fixing it here in the same migration
--    that introduces the new keys to avoid an in-between state.

create or replace function public.check_achievements(p_profile_id uuid)
  returns text[]
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  p_family_id      uuid;
  stars_earned     int;
  streak_max       int;
  star_chore_count int;
  skill_chore_count int;
  skill_streak_max int;
  redemption_count int;
  unlocked         text[];
begin
  select profiles.family_id into p_family_id from public.profiles where id = p_profile_id;
  if p_family_id is null then return '{}'; end if;

  select coalesce(sum(delta), 0)::int into stars_earned
    from public.star_ledger where profile_id = p_profile_id and delta > 0;

  select coalesce(greatest(current_count, longest_count), 0)::int into streak_max
    from public.streaks where profile_id = p_profile_id;
  streak_max := coalesce(streak_max, 0);

  select count(*)::int into star_chore_count
    from public.chore_instances ci
    join public.chores c on c.id = ci.chore_id
   where ci.completed_by = p_profile_id
     and ci.status       = 'approved'
     and c.kind          = 'chore';

  select count(*)::int into skill_chore_count
    from public.chore_instances ci
    join public.chores c on c.id = ci.chore_id
   where ci.completed_by = p_profile_id
     and ci.status       = 'approved'
     and c.kind          = 'skill';

  select coalesce(max(greatest(current_skill_streak, longest_skill_streak)), 0)::int
    into skill_streak_max
    from public.chores
   where assignee_profile_id = p_profile_id and kind = 'skill';

  select count(*)::int into redemption_count
    from public.redemptions where kid_profile_id = p_profile_id and status = 'fulfilled';

  with candidates(k) as (
    select unnest(array[
      case when stars_earned      >= 10  then 'stargazer'        end,
      case when stars_earned      >= 100 then 'stars_100'        end,
      case when stars_earned      >= 500 then 'stars_500'        end,
      case when streak_max        >= 7   then 'streak_7'         end,
      case when streak_max        >= 30  then 'streak_30'        end,
      case when star_chore_count  >= 1   then 'first_chore'      end,
      case when star_chore_count  >= 25  then 'chores_25'        end,
      case when redemption_count  >= 1   then 'first_reward'     end,
      case when skill_chore_count >= 1   then 'first_skill_task' end,
      case when skill_chore_count >= 25  then 'skill_tasks_25'   end,
      case when skill_chore_count >= 100 then 'skill_tasks_100'  end,
      case when skill_streak_max  >= 14  then 'skill_streak_14'  end
    ])
  ),
  ins as (
    insert into public.achievements(family_id, profile_id, achievement_key)
    select p_family_id, p_profile_id, k from candidates where k is not null
    on conflict (profile_id, achievement_key) do nothing
    returning achievement_key
  )
  select coalesce(array_agg(achievement_key), '{}'::text[]) into unlocked from ins;

  return unlocked;
end;
$$;

-- ── approve_chore: call check_achievements on the skill path ─────────────────

create or replace function public.approve_chore(instance_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  inst           public.chore_instances%rowtype;
  chore_kind     text;
  star_value     int;
  token_value    int;
  s              public.streaks%rowtype;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status = 'approved' then return; end if;
  if inst.status <> 'finished' then raise exception 'instance % is not finished (status=%)', instance_id, inst.status; end if;

  select c.kind, c.star_value, c.token_value
    into chore_kind, star_value, token_value
    from public.chores c where c.id = inst.chore_id;

  if chore_kind = 'skill' then
    update public.chore_instances
      set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=null
      where id = instance_id;

    insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
    values (caller_family, inst.completed_by, token_value, 'skill_approved', instance_id);

    perform public.bump_skill_streak(inst.chore_id);
    perform public.check_achievements(inst.completed_by);
    return;
  end if;

  update public.chore_instances
    set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=star_value
    where id = instance_id;

  insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
  values (caller_family, inst.completed_by, star_value, 'chore_approved', instance_id);

  select * into s from public.streaks where profile_id = inst.completed_by;
  if s.profile_id is null then
    insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date)
    values (inst.completed_by, caller_family, 1, 1, current_date);
  elsif s.last_completion_date = current_date then
    null;
  elsif s.last_completion_date = current_date - 1 then
    update public.streaks
      set current_count = s.current_count + 1,
          longest_count = greatest(s.longest_count, s.current_count + 1),
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  else
    update public.streaks
      set current_count = 1,
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  end if;

  perform public.check_achievements(inst.completed_by);
end;
$$;

-- ── finish_chore: call check_achievements on both skill paths ────────────────

create or replace function public.finish_chore(
  instance_id      uuid,
  actor_profile_id uuid,
  photo_url        text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mode          text;
  v_actor_type    text;
  v_kind          text;
  v_star_value    int;
  v_token_value   int;
  v_chore_id      uuid;
  v_family        uuid;
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
      insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
      values (v_family, v_inst_assignee, v_token_value, 'skill_approved', instance_id);

      perform public.bump_skill_streak(v_chore_id);
      perform public.check_achievements(v_inst_assignee);
    end if;
    return;
  end if;

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
      perform public.check_achievements(actor_profile_id);
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
