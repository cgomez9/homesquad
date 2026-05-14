-- supabase/migrations/20260514000017_family_goals_replica_identity_full.sql
-- Realtime UPDATE payloads need the full old row so the goal_completed
-- banner can detect status transitions (active → completed). Default replica
-- identity only ships the primary key in old.
alter table public.family_goals replica identity full;
