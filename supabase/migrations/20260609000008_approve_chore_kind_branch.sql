-- supabase/migrations/20260609000008_approve_chore_kind_branch.sql
-- approve_chore now branches on chores.kind. Star chores behave exactly as
-- before (insert into star_ledger, bump global streaks, run check_achievements).
-- Skill tasks credit privilege_token_ledger and bump the per-chore skill
-- streak — they intentionally do not touch star_ledger, the global streaks
-- table, or the achievements pipeline.

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

  -- ── Skill task path ─────────────────────────────────────────────────────
  if chore_kind = 'skill' then
    update public.chore_instances
      set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=null
      where id = instance_id;

    insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
    values (caller_family, inst.completed_by, token_value, 'skill_approved', instance_id);

    perform public.bump_skill_streak(inst.chore_id);
    return;
  end if;

  -- ── Star chore path (unchanged behavior) ────────────────────────────────
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
