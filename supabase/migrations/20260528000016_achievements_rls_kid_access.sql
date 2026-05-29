-- supabase/migrations/20260528000016_achievements_rls_kid_access.sql
-- Extend achievements SELECT policy to accept kid sessions.
-- Kids need to see their badges on the badges screen.

drop policy achievements_select_own_family on public.achievements;

create policy achievements_select_own_family on public.achievements
  for select using (
    family_id = public.current_family_id()
  );
