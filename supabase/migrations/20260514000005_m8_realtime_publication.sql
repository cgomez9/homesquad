-- Opt family_goals into supabase_realtime so the kid celebration banner
-- and the active-goal card invalidate on UPDATE. Local dev resets the
-- publication empty on db reset, so this must live in a migration.
-- (Per M6 late fix 7583eb4 — known gotcha for any new broadcasting table.)
--
-- push_outbox is intentionally NOT added: only the server-side drain worker
-- reads it.

alter publication supabase_realtime add table public.family_goals;
