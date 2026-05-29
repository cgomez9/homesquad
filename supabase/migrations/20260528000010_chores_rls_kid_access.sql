-- supabase/migrations/20260528000010_chores_rls_kid_access.sql
-- Extend chores SELECT policy to accept kid sessions.
-- The old policy gated on type = 'parent' via a profiles join, which excludes
-- kid-device sessions (those have no profiles row). Replacing with
-- current_family_id() which already resolves both parent and kid sessions.

drop policy chores_select_own_family on public.chores;

create policy chores_select_own_family on public.chores
  for select using (
    family_id = public.current_family_id()
  );
