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
  inst            public.chore_instances%rowtype;
  chore_mode      text;
  kid_family      uuid;
  kid_type        text;
begin
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status <> 'pending' then raise exception 'instance % is not pending (status=%)', instance_id, inst.status; end if;

  select profiles.family_id, profiles.type into kid_family, kid_type
  from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in caller family', kid_profile_id;
  end if;

  -- Assignee match against the INSTANCE snapshot, not the chore template.
  if inst.assignee_profile_id is not null and inst.assignee_profile_id <> kid_profile_id then
    raise exception 'kid_profile_id % is not the assignee of instance %', kid_profile_id, instance_id;
  end if;

  select c.verification_mode into chore_mode from public.chores c where c.id = inst.chore_id;

  if chore_mode = 'auto' then
    update public.chore_instances
      set status = 'approved', completed_by = kid_profile_id, completed_at = now()
      where id = instance_id;
  elsif chore_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now(), photo_url = complete_chore.photo_url
      where id = instance_id;
  elsif chore_mode = 'approval' then
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now()
      where id = instance_id;
  else
    raise exception 'unknown verification_mode: %', chore_mode;
  end if;
end;
$$;
