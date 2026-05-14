-- supabase/migrations/20260514000002_profiles_push_prefs.sql
-- Adds per-parent push notification preferences as jsonb on profiles.
-- Opt-out model: missing key = treated as enabled. Only the owning user
-- (auth.uid() = profiles.user_id) can UPDATE push_prefs via RLS.

alter table public.profiles
  add column push_prefs jsonb not null default '{}'::jsonb;

comment on column public.profiles.push_prefs is
  'jsonb map of event_type -> boolean. Missing key = delivered. Only the owning user can UPDATE this column.';

create policy profiles_update_own_push_prefs
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
