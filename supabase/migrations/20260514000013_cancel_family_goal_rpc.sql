-- supabase/migrations/20260514000013_cancel_family_goal_rpc.sql
create or replace function public.cancel_family_goal(p_goal_id uuid)
  returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_family_id is null then
    raise exception 'not_a_parent';
  end if;

  -- Idempotent: silent no-op if already terminal or non-existent / cross-family.
  update public.family_goals
     set status = 'canceled'
   where id = p_goal_id
     and family_id = v_family_id
     and status = 'active';
end;
$$;

revoke all on function public.cancel_family_goal(uuid) from public;
grant execute on function public.cancel_family_goal(uuid) to authenticated;
