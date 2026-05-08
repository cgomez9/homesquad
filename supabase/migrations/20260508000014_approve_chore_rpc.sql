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
  star_value     int;
  s              public.streaks%rowtype;
begin
  -- caller must be a parent
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;

  -- Idempotent re-call on already-approved instance.
  if inst.status = 'approved' then return; end if;
  if inst.status <> 'submitted' then raise exception 'instance % is not submitted (status=%)', instance_id, inst.status; end if;

  -- Snapshot star_value from the chore template.
  select c.star_value into star_value from public.chores c where c.id = inst.chore_id;

  -- 1. Update instance.
  update public.chore_instances
    set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=star_value
    where id = instance_id;

  -- 2. Append ledger row.
  insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
  values (caller_family, inst.completed_by, star_value, 'chore_approved', instance_id);

  -- 3. Streak upsert.
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
end;
$$;
