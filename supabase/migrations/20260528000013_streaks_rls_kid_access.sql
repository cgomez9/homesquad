-- supabase/migrations/20260528000013_streaks_rls_kid_access.sql
-- Extend streaks SELECT policy to accept kid sessions.
-- Kids need to see their own streak count on the home screen.

drop policy streaks_select_own_family on public.streaks;

create policy streaks_select_own_family on public.streaks
  for select using (
    family_id = public.current_family_id()
  );
