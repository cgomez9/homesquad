-- delete_account(): hard-delete the calling user.
-- If they are the last parent in their family, cascade-delete the family.
-- If a co-parent exists, only the calling profile + their auth.users row are removed.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id       uuid := auth.uid();
  v_family_id     uuid;
  v_other_parents int;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select family_id into v_family_id
  from public.profiles
  where user_id = v_user_id and type = 'parent';

  if v_family_id is null then
    -- mid-onboarding edge case: user has no parent profile yet
    delete from auth.users where id = v_user_id;
    return;
  end if;

  select count(*) into v_other_parents
  from public.profiles
  where family_id = v_family_id
    and type = 'parent'
    and user_id != v_user_id;

  if v_other_parents = 0 then
    delete from public.families where id = v_family_id;
  else
    delete from public.profiles where user_id = v_user_id;
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
