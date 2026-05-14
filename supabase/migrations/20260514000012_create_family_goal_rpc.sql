-- supabase/migrations/20260514000012_create_family_goal_rpc.sql
-- SECURITY DEFINER RPC so authenticated parents can insert into family_goals
-- without a direct INSERT policy. Catches unique_violation from the partial
-- unique index (one active goal per family) and re-raises as 'already_active'.
create or replace function public.create_family_goal(
  p_title        text,
  p_target_stars int,
  p_description  text default null
) returns public.family_goals
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_family_id  uuid;
  v_row        public.family_goals;
begin
  select id, family_id into v_profile_id, v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  begin
    insert into public.family_goals (family_id, title, target_stars,
                                      description, created_by)
    values (v_family_id, p_title, p_target_stars, p_description, v_profile_id)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'already_active';
  end;

  return v_row;
end;
$$;

revoke all on function public.create_family_goal(text, int, text) from public;
grant execute on function public.create_family_goal(text, int, text) to authenticated;
