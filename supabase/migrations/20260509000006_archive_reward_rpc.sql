create or replace function public.archive_reward(reward_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_family uuid; target_family uuid;
begin
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select r.family_id into target_family from public.rewards r where r.id = archive_reward.reward_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'reward % not in caller family', reward_id;
  end if;

  update public.rewards set active = false where id = archive_reward.reward_id;
end;
$$;
