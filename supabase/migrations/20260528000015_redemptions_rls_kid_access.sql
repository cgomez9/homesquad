-- supabase/migrations/20260528000015_redemptions_rls_kid_access.sql
-- Extend redemptions SELECT policy to accept kid sessions.
-- Kids need to see their redemption history on the rewards screen.

drop policy redemptions_select_own_family on public.redemptions;

create policy redemptions_select_own_family on public.redemptions
  for select using (
    family_id = public.current_family_id()
  );
