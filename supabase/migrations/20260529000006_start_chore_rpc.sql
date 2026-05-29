-- Actor moves an assigned chore from pending or rejected to started.

create or replace function public.start_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set status = 'started',
         started_at = now(),
         rejection_reason = null,
         approved_by = null,
         approved_at = null
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id = actor_profile_id
     and status in ('pending', 'rejected');
  if not found then
    raise exception 'chore not startable';
  end if;
end $$;

revoke all on function public.start_chore(uuid, uuid) from public;
grant execute on function public.start_chore(uuid, uuid) to authenticated;
