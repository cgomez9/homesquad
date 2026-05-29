-- supabase/migrations/20260529000003_credit_family_pool.sql
-- Inserts a star_ledger row on behalf of a parent who just finished a chore,
-- crediting the family's active goal. The existing check_active_goal trigger
-- fires after the INSERT and flips status to 'completed' when cumulative
-- positive deltas reach target_stars.
--
-- Design note: family_goals has NO current_progress / target_progress columns.
-- Progress is computed on read (get_active_goal RPC sums star_ledger.delta).
-- Clamping is handled by the check_active_goal trigger (idempotent, only
-- flips goals whose status is still 'active').
--
-- No-op when no active goal exists: the INSERT is guarded by a subquery that
-- checks for an active goal; if none exists the function simply returns without
-- inserting any row.
--
-- Signature change from the plan: added p_profile_id (required by star_ledger.profile_id
-- NOT NULL). finish_chore (Task 7) must call credit_family_pool(v_family, actor_profile_id, v_star_value).

create or replace function public.credit_family_pool(
  p_family_id  uuid,
  p_profile_id uuid,
  p_amount     int
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Guard: only insert if an active goal exists for this family.
  if not exists (
    select 1 from public.family_goals
     where family_id = p_family_id and status = 'active'
  ) then
    return;
  end if;

  insert into public.star_ledger(family_id, profile_id, delta, reason)
  values (p_family_id, p_profile_id, p_amount, 'chore_approved');
end $$;

revoke all on function public.credit_family_pool(uuid, uuid, int) from public;
grant execute on function public.credit_family_pool(uuid, uuid, int) to authenticated;
