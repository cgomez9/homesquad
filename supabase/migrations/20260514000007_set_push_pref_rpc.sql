create or replace function public.set_push_pref(
  p_event_type text,
  p_enabled    boolean
) returns jsonb
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_prefs      jsonb;
begin
  select id into v_profile_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  update public.profiles
     set push_prefs = jsonb_set(coalesce(push_prefs, '{}'::jsonb),
                                array[p_event_type],
                                to_jsonb(p_enabled),
                                true)
   where id = v_profile_id
  returning push_prefs into v_prefs;

  return v_prefs;
end;
$$;

revoke all on function public.set_push_pref(text, boolean) from public;
grant execute on function public.set_push_pref(text, boolean) to authenticated;
