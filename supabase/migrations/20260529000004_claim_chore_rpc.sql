-- Any family member self-claims an unassigned, pending chore. Race-protected
-- by the assignee IS NULL clause: only one concurrent claim wins.

create or replace function public.claim_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set assignee_profile_id = actor_profile_id
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id is null
     and status = 'pending';
  if not found then
    raise exception 'chore not claimable';
  end if;
end $$;

revoke all on function public.claim_chore(uuid, uuid) from public;
grant execute on function public.claim_chore(uuid, uuid) to authenticated;
