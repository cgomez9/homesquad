-- M7 follow-up: free-tier-compatible replacement for app.settings.* GUC.
--
-- Cloud Supabase free tier doesn't let the `postgres` role run
-- `alter database postgres set app.settings.*`, so the M5 push triggers
-- (which read `current_setting('app.settings.functions_base_url', true)`)
-- can never get their URL on free tier — pg_net no-ops silently.
--
-- This migration creates a private config table that security-definer
-- functions can read but no PostgREST endpoint can. The follow-up
-- migration (20260512000002_triggers_use_app_config.sql) rewrites the
-- three trigger functions to read from this table instead of GUC.
--
-- Local dev environments that already have app.settings.* set get a
-- one-time auto-migration: the do-block below copies any existing values
-- into the new table on first apply, so `supabase db reset` keeps working
-- without manual seed steps.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

revoke all on table private.app_config from public;

-- One-time auto-import from app.settings.* (local dev convenience).
-- On cloud free tier these GUCs return null and the inserts are skipped.
do $$
declare v_url text;
        v_key text;
begin
  v_url := current_setting('app.settings.functions_base_url', true);
  if v_url is not null and v_url <> '' then
    insert into private.app_config(key, value)
    values ('functions_base_url', v_url)
    on conflict (key) do nothing;
  end if;

  v_key := current_setting('app.settings.service_role_key', true);
  if v_key is not null and v_key <> '' then
    insert into private.app_config(key, value)
    values ('service_role_key', v_key)
    on conflict (key) do nothing;
  end if;
end $$;
