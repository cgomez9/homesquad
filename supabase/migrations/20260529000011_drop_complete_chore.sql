-- supabase/migrations/20260529000011_drop_complete_chore.sql
-- complete_chore is superseded by start_chore + finish_chore.
-- The bridge migration 20260529000009 kept complete_chore writing 'finished'
-- so the test suite stayed green during the m11 series. Now we drop it.

drop function if exists public.complete_chore(uuid, uuid, text);
