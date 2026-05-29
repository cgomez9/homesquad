-- Actor releases a pending chore they previously claimed. Started chores
-- cannot be released — only a parent UPDATE override can rescue those.

create or replace function public.release_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set assignee_profile_id = null
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id = actor_profile_id
     and status = 'pending';
  if not found then
    raise exception 'chore not releasable';
  end if;
end $$;

revoke all on function public.release_chore(uuid, uuid) from public;
grant execute on function public.release_chore(uuid, uuid) to authenticated;
