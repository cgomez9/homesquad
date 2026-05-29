-- supabase/migrations/20260528000011_chore_instances_rls_kid_access.sql
-- Extend chore_instances SELECT policy to accept kid sessions.
-- The old policy gated on type = 'parent' via a profiles join, which excludes
-- kid-device sessions (those have no profiles row). Replacing with
-- current_family_id() which already resolves both parent and kid sessions.
-- UPDATE policy is intentionally left parent-only (approve/reject flow).

drop policy chore_instances_select_own_family on public.chore_instances;

create policy chore_instances_select_own_family on public.chore_instances
  for select using (
    family_id = public.current_family_id()
  );
