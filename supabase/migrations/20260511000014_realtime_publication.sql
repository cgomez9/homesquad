-- Realtime is OFF by default for every table in Supabase. Subscribers in the
-- mobile app (M5: subscribeToFamily; M6: AchievementBanner + kid-home feedback
-- channels) silently receive zero events until tables are added to the
-- supabase_realtime publication.
--
-- This migration opts the four tables in. It runs on every db reset because
-- Postgres recreates the publication empty when the cluster initializes.

alter publication supabase_realtime add table public.chore_instances;
alter publication supabase_realtime add table public.redemptions;
alter publication supabase_realtime add table public.star_ledger;
alter publication supabase_realtime add table public.achievements;
