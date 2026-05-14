-- supabase/migrations/20260514000016_get_leaderboard_rpc.sql
-- Per-kid this-week + all-time star rankings within a family.
-- Earned-not-net: only positive star_ledger.delta rows count.
-- Week bucket: Monday 00:00 in family TZ.

create or replace function public.get_leaderboard(p_family_id uuid)
  returns table (
    profile_id     uuid,
    display_name   text,
    avatar_id      int,
    week_stars     int,
    all_time_stars int,
    week_rank      int,
    all_time_rank  int
  )
  language sql stable security invoker
  set search_path = public
as $$
  with family_tz as (
    select timezone from public.families where id = p_family_id
  ),
  week_start as (
    select (date_trunc(
              'week',
              (now() at time zone (select timezone from family_tz))
            ) at time zone (select timezone from family_tz)) as ts
  ),
  base as (
    select p.id           as profile_id,
           p.display_name,
           p.avatar_id,
           coalesce(sum(case
             when sl.delta > 0 and sl.created_at >= (select ts from week_start)
             then sl.delta else 0
           end), 0)::int as week_stars,
           coalesce(sum(case
             when sl.delta > 0 then sl.delta else 0
           end), 0)::int as all_time_stars
      from public.profiles p
      left join public.star_ledger sl on sl.profile_id = p.id
     where p.family_id = p_family_id
       and p.type      = 'kid'
     group by p.id, p.display_name, p.avatar_id
  )
  select profile_id, display_name, avatar_id, week_stars, all_time_stars,
         rank() over (order by week_stars     desc, all_time_stars desc,
                                display_name asc)::int as week_rank,
         rank() over (order by all_time_stars desc, display_name asc)::int as all_time_rank
    from base
   order by week_rank, display_name;
$$;

grant execute on function public.get_leaderboard(uuid) to authenticated;
