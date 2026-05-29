-- supabase/migrations/20260528000014_rewards_rls_kid_access.sql
-- Extend rewards SELECT policy to accept kid sessions.
-- Kids need to see the rewards catalog on the rewards screen.
-- INSERT/UPDATE policies are intentionally left parent-only.

drop policy rewards_select_own_family on public.rewards;

create policy rewards_select_own_family on public.rewards
  for select using (
    family_id = public.current_family_id()
  );
