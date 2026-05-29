-- supabase/migrations/20260529000008b_complete_chore_finished_state.sql
-- complete_chore still sets 'submitted' for photo/approval modes; the CHECK
-- constraint added in 20260529000001 no longer allows that value.
-- Body copied verbatim from 20260528000007 (the latest redefinition) with
-- 'submitted' -> 'finished'. Task 9 (notify_push_chore) will drop complete_chore
-- entirely; this migration keeps the test suite green in the interim.

create or replace function public.complete_chore(
  instance_id     uuid,
  kid_profile_id  uuid,
  photo_url       text default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family   uuid;
  caller_kid_id   uuid;
  inst            public.chore_instances%rowtype;
  chore_mode      text;
  kid_family      uuid;
  kid_type        text;
begin
  -- Resolve caller. Accept parent OR kid session.
  caller_family := public.current_family_id();
  caller_kid_id := public.current_kid_id();
  if caller_family is null then
    raise exception 'caller is not authenticated to any family';
  end if;
  if caller_kid_id is not null and caller_kid_id <> kid_profile_id then
    raise exception 'kid session may only act as itself';
  end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status not in ('pending','rejected') then
    raise exception 'instance % cannot be completed (status=%)', instance_id, inst.status;
  end if;

  select profiles.family_id, profiles.type into kid_family, kid_type
    from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in caller family', kid_profile_id;
  end if;

  if inst.assignee_profile_id is not null and inst.assignee_profile_id <> kid_profile_id then
    raise exception 'kid_profile_id % is not the assignee of instance %', kid_profile_id, instance_id;
  end if;

  select c.verification_mode into chore_mode from public.chores c where c.id = inst.chore_id;

  if chore_mode = 'auto' then
    update public.chore_instances
      set status = 'approved', completed_by = kid_profile_id, completed_at = now(),
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  elsif chore_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
      set status = 'finished', completed_by = kid_profile_id, completed_at = now(),
          photo_url = complete_chore.photo_url,
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  elsif chore_mode = 'approval' then
    update public.chore_instances
      set status = 'finished', completed_by = kid_profile_id, completed_at = now(),
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  else
    raise exception 'unknown verification_mode: %', chore_mode;
  end if;
end;
$$;
