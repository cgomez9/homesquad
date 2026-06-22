-- supabase/migrations/20260622000001_chore_generator_pure_sql.sql
--
-- Bugfix: the daily chore-instance generator never ran in production.
--
-- The generate_chore_instances_daily cron (20260508000010) POSTs to an Edge
-- Function using current_setting('app.settings.functions_base_url', true).
-- On Supabase free tier that GUC can't be set, so the URL resolves to NULL and
-- every nightly run fails with `null value in column "url"` (confirmed in
-- cron.job_run_details). On top of that, the generate_chore_instances Edge
-- Function isn't deployed to prod (only send_push is). Net result: no recurring
-- chore_instances are ever materialized, so the kid home — which shows only
-- today's instances — goes empty the day after a chore is created.
--
-- Fix: replace the HTTP-to-Edge-Function hop with a pure-SQL generator called
-- directly by cron, mirroring the drain_push_outbox cron (job 2) which uses the
-- same self-contained pattern and succeeds every minute. No pg_net, no Edge
-- Function, no service-role secret — nothing that can silently no-op on free
-- tier.
--
-- Reminder enqueueing (push_outbox rows for timed chores) that the Edge
-- Function also did is intentionally NOT ported here — it has never run in prod
-- (the cron always failed) so this is not a regression, and it only applies to
-- chores with explicit recurrence.times. Tracked as a follow-up.

create or replace function public.generate_due_chore_instances()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_cutoff   timestamptz := now() + interval '24 hours';
  v_inserted int := 0;
  v_chores   int := 0;
  v_skipped  int := 0;
  c          record;
  v_tz       text;
  v_next     timestamptz;
  v_iter     int;
  v_ins      int;
begin
  for c in
    select id, family_id, assignee_profile_id, recurrence, next_due_at
    from public.chores
    where active
      and next_due_at is not null
      and next_due_at <= v_cutoff
  loop
    v_chores := v_chores + 1;
    begin
      select coalesce(f.timezone, 'UTC') into v_tz
        from public.families f where f.id = c.family_id;
      v_tz := coalesce(v_tz, 'UTC');

      v_next := c.next_due_at;
      v_iter := 0;
      -- Materialize each due occurrence up to the 24h cutoff, backfilling any
      -- missed days. Capped at 14 iterations (matches the Edge Function) so a
      -- long-stale chore can't spin, and the iter cap also bounds the loop if
      -- next_occurrence ever fails to advance.
      while v_next is not null and v_next <= v_cutoff and v_iter < 14 loop
        insert into public.chore_instances(chore_id, family_id, assignee_profile_id, due_at)
        values (c.id, c.family_id, c.assignee_profile_id, v_next)
        on conflict (chore_id, due_at) do nothing;
        get diagnostics v_ins = row_count;
        v_inserted := v_inserted + v_ins;

        v_next := public.next_occurrence(c.recurrence, v_next, v_tz);
        v_iter := v_iter + 1;
      end loop;

      update public.chores set next_due_at = v_next where id = c.id;
    exception when others then
      -- Don't let one chore with a malformed recurrence block the rest.
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object('chores', v_chores, 'inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

-- Repoint the daily cron at the pure-SQL generator. Unschedule guarded so the
-- migration is safe whether or not the old job name exists.
do $$
begin
  perform cron.unschedule('generate_chore_instances_daily');
exception when others then
  null;
end $$;

select cron.schedule(
  'generate_chore_instances_daily',
  '5 0 * * *',  -- 00:05 UTC every day
  $$select public.generate_due_chore_instances();$$
);

-- Run once now so today's missing instances are materialized immediately
-- rather than waiting for the next 00:05 UTC tick.
select public.generate_due_chore_instances();
