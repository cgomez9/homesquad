-- supabase/migrations/20260528000012_star_ledger_rls_kid_access.sql
-- Extend star_ledger SELECT policy to accept kid sessions.
-- Kids need to see their own star balance and history on the home screen.

drop policy star_ledger_select_own_family on public.star_ledger;

create policy star_ledger_select_own_family on public.star_ledger
  for select using (
    family_id = public.current_family_id()
  );
