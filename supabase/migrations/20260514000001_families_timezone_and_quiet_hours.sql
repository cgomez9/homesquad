-- supabase/migrations/20260514000001_families_timezone_and_quiet_hours.sql
-- Adds family-level timezone and quiet-hours columns. Existing rows default
-- to 'UTC' and 21:00-07:00. Settings UI lets parents edit later.

alter table public.families
  add column timezone            text    not null default 'UTC',
  add column quiet_hours_enabled boolean not null default true,
  add column quiet_hours_start   time    not null default '21:00'::time,
  add column quiet_hours_end     time    not null default '07:00'::time;

comment on column public.families.timezone is
  'IANA timezone name (e.g. America/Bogota). Used for quiet-hours wall-clock and leaderboard week boundary.';
comment on column public.families.quiet_hours_enabled is
  'When true, send_push enqueues into push_outbox with scheduled_for=next quiet_hours_end. When false, scheduled_for=now().';
