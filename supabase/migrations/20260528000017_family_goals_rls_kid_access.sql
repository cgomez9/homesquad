-- supabase/migrations/20260528000017_family_goals_rls_kid_access.sql
-- Extend family_goals SELECT policy to accept kid sessions.
-- The existing policy gates on a profiles exists check (no type restriction),
-- but kid-device sessions have no profiles row. Replacing with
-- current_family_id() which resolves both parent and kid sessions.
-- Kids need to see the current family goal on the home/leaderboard screen.

drop policy family_goals_read_own_family on public.family_goals;

create policy family_goals_read_own_family on public.family_goals
  for select using (
    family_id = public.current_family_id()
  );
