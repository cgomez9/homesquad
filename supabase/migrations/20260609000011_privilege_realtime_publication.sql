-- supabase/migrations/20260609000011_privilege_realtime_publication.sql
-- Opt the privilege/skill-task tables into supabase_realtime so the kid
-- token chip + privileges screen + parent approval queue invalidate on
-- INSERT/UPDATE. Local dev resets the publication empty on db reset, so
-- this must live in a migration. (Same gotcha as 20260514000005.)
--
-- Push triggers for privilege_redemptions (mirroring 20260511000008) are
-- intentionally deferred to a future polish migration — v1 ships with
-- realtime invalidation only.

alter publication supabase_realtime add table public.privilege_token_ledger;
alter publication supabase_realtime add table public.privileges;
alter publication supabase_realtime add table public.privilege_redemptions;
