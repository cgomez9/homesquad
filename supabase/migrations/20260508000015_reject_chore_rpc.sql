create or replace function public.reject_chore(instance_id uuid, reason text default '')
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  inst           public.chore_instances%rowtype;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;

  if inst.status = 'rejected' then return; end if;
  if inst.status <> 'submitted' then raise exception 'instance % is not submitted (status=%)', instance_id, inst.status; end if;

  update public.chore_instances
    set status='rejected', approved_by=caller_profile, approved_at=now(), rejection_reason=coalesce(reason, '')
    where id = instance_id;
end;
$$;
