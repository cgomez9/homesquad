-- supabase/migrations/20260514000014_get_active_goal_rpc.sql
-- Returns the active goal for a family + computed progress_stars
-- (sum of positive star_ledger deltas since goal.created_at). Zero rows
-- when no active goal exists. Caller must be in the family — enforced by
-- the family_goals + star_ledger RLS policies.

create or replace function public.get_active_goal(p_family_id uuid)
  returns table (
    id            uuid,
    family_id     uuid,
    title         text,
    description   text,
    target_stars  int,
    status        text,
    created_by    uuid,
    created_at    timestamptz,
    completed_at  timestamptz,
    progress_stars int
  )
  language sql stable security invoker
  set search_path = public
as $$
  select g.id, g.family_id, g.title, g.description, g.target_stars,
         g.status, g.created_by, g.created_at, g.completed_at,
         coalesce((
           select sum(delta)::int from public.star_ledger sl
            where sl.family_id = g.family_id
              and sl.delta > 0
              and sl.created_at >= g.created_at
         ), 0) as progress_stars
    from public.family_goals g
   where g.family_id = p_family_id
     and g.status    = 'active'
   limit 1;
$$;

grant execute on function public.get_active_goal(uuid) to authenticated;
