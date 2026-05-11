create or replace function public.check_achievements(p_profile_id uuid)
  returns text[]
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  p_family_id uuid;
  stars_earned int;
  streak_max int;
  chore_count int;
  redemption_count int;
  unlocked text[];
begin
  select profiles.family_id into p_family_id from public.profiles where id = p_profile_id;
  if p_family_id is null then return '{}'; end if;

  select coalesce(sum(delta), 0)::int into stars_earned
    from public.star_ledger where profile_id = p_profile_id and delta > 0;

  select coalesce(greatest(current_count, longest_count), 0)::int into streak_max
    from public.streaks where profile_id = p_profile_id;
  streak_max := coalesce(streak_max, 0);

  select count(*)::int into chore_count
    from public.chore_instances where completed_by = p_profile_id and status = 'approved';

  select count(*)::int into redemption_count
    from public.redemptions where kid_profile_id = p_profile_id and status = 'fulfilled';

  with candidates(k) as (
    select unnest(array[
      case when stars_earned     >= 1   then 'first_star'   end,
      case when stars_earned     >= 100 then 'stars_100'    end,
      case when stars_earned     >= 500 then 'stars_500'    end,
      case when streak_max       >= 7   then 'streak_7'     end,
      case when streak_max       >= 30  then 'streak_30'    end,
      case when chore_count      >= 1   then 'first_chore'  end,
      case when chore_count      >= 25  then 'chores_25'    end,
      case when redemption_count >= 1   then 'first_reward' end
    ])
  ),
  ins as (
    insert into public.achievements(family_id, profile_id, achievement_key)
    select p_family_id, p_profile_id, k from candidates where k is not null
    on conflict (profile_id, achievement_key) do nothing
    returning achievement_key
  )
  select coalesce(array_agg(achievement_key), '{}'::text[]) into unlocked from ins;

  return unlocked;
end;
$$;
