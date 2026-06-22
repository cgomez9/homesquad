-- supabase/migrations/20260618000001_create_chore_restores_today_instance.sql
-- Bugfix: the skill-kind redefinition of create_chore (20260609000002)
-- accidentally dropped the `perform public.ensure_today_instance(new_id)` call
-- that 20260509000001 had added. As a result, any chore/skill task created via
-- the RPC since 2026-06-09 gets no chore_instance until the next daily cron run,
-- so it never appears on the kid's home (which renders chore_instances, not the
-- chores table). Symptom surfaced on skill tasks because those were the newly
-- created rows being tested.
--
-- This migration:
--   1. Redefines create_chore identically to 20260609000002 but with the
--      ensure_today_instance call restored.
--   2. Backfills today's instance for any active chore that is missing the
--      instance for its current next_due_at (idempotent; only touches rows
--      that actually lack their instance).

create or replace function public.create_chore(
  family_id           uuid,
  title               text,
  description         text,
  star_value          int,
  assignee_profile_id uuid,
  verification_mode   text,
  recurrence          jsonb,
  kind                text default 'chore',
  token_value         int  default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  new_id uuid;
  initial_next_due timestamptz;
begin
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent' and profiles.family_id = create_chore.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  if assignee_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = assignee_profile_id and profiles.family_id = create_chore.family_id
  ) then
    raise exception 'assignee % not in family %', assignee_profile_id, family_id;
  end if;

  -- kind/value consistency: caller-facing errors before the DB XOR fires.
  if kind = 'chore' then
    if star_value is null then raise exception 'star_value required for kind=chore'; end if;
    if token_value is not null then raise exception 'token_value not allowed for kind=chore'; end if;
  elsif kind = 'skill' then
    if token_value is null then raise exception 'token_value required for kind=skill'; end if;
    if star_value is not null then raise exception 'star_value not allowed for kind=skill'; end if;
  else
    raise exception 'kind must be chore or skill (got %)', kind;
  end if;

  perform public.next_occurrence(recurrence, now());
  initial_next_due := public.next_occurrence(recurrence, now() - interval '1 day');

  insert into public.chores(
    family_id, title, description, star_value, assignee_profile_id,
    verification_mode, recurrence, next_due_at, created_by, kind, token_value
  ) values (
    create_chore.family_id, create_chore.title, create_chore.description,
    create_chore.star_value, create_chore.assignee_profile_id,
    create_chore.verification_mode, create_chore.recurrence,
    initial_next_due, caller_profile, create_chore.kind, create_chore.token_value
  ) returning id into new_id;

  -- Restored: materialize today's instance immediately so the kid sees the task
  -- without waiting for the daily cron. The cron handles future days.
  perform public.ensure_today_instance(new_id);

  return new_id;
end;
$$;

-- Backfill: any active chore missing the instance for its current next_due_at.
-- ensure_today_instance is idempotent (on conflict do nothing) and only acts
-- when next_due_at is within the 24h window, so this is safe to run once.
do $$
declare r record;
begin
  for r in
    select c.id
    from public.chores c
    where c.active
      and c.next_due_at is not null
      and c.next_due_at <= now() + interval '24 hours'
      and not exists (
        select 1 from public.chore_instances ci
        where ci.chore_id = c.id and ci.due_at = c.next_due_at
      )
  loop
    perform public.ensure_today_instance(r.id);
  end loop;
end $$;
