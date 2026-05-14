-- supabase/migrations/20260514000008_send_push_function.sql
-- DB-level send_push: enqueues per-recipient rows into push_outbox, with
-- per-event mute and quiet-hours scheduling applied at enqueue time.
-- Replaces the M5 net.http_post path; triggers will be rewired in Task 10.
--
-- Quiet-hours wraparound:
--   - start <= end  (same-day window)  → in_quiet = current in [start, end)
--   - start >  end  (midnight wrap)    → in_quiet = current >= start OR current < end
-- scheduled_for when in_quiet:
--   - start >  end AND current >= start  → tomorrow's quiet_hours_end (family TZ → UTC)
--   - otherwise                          → today's quiet_hours_end (family TZ → UTC)

create or replace function public.send_push(
  p_family_id  uuid,
  p_event_type text,
  p_payload    jsonb
) returns int
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_family       record;
  v_now_tz       timestamptz := now();
  v_local_time   time;
  v_local_date   date;
  v_in_quiet     boolean := false;
  v_scheduled_at timestamptz;
  v_target_date  date;
  v_count        int := 0;
begin
  select id, timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
    into v_family
  from public.families where id = p_family_id;

  if v_family.id is null then
    return 0;
  end if;

  v_local_time := ((v_now_tz at time zone v_family.timezone)::time);
  v_local_date := ((v_now_tz at time zone v_family.timezone)::date);

  if v_family.quiet_hours_enabled then
    if v_family.quiet_hours_start <= v_family.quiet_hours_end then
      v_in_quiet := v_local_time >= v_family.quiet_hours_start
                and v_local_time <  v_family.quiet_hours_end;
    else
      v_in_quiet := v_local_time >= v_family.quiet_hours_start
                 or v_local_time <  v_family.quiet_hours_end;
    end if;
  end if;

  if v_in_quiet then
    if v_family.quiet_hours_start > v_family.quiet_hours_end
       and v_local_time >= v_family.quiet_hours_start
    then
      v_target_date := v_local_date + 1;
    else
      v_target_date := v_local_date;
    end if;
    v_scheduled_at := ((v_target_date::timestamp + v_family.quiet_hours_end)
                       at time zone v_family.timezone);
  else
    v_scheduled_at := v_now_tz;
  end if;

  insert into public.push_outbox (family_id, recipient_id, event_type,
                                  payload, scheduled_for)
  select p_family_id, p.id, p_event_type, p_payload, v_scheduled_at
    from public.profiles p
   where p.family_id  = p_family_id
     and p.type       = 'parent'
     and p.push_token is not null
     and coalesce((p.push_prefs ->> p_event_type)::boolean, true) = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.send_push(uuid, text, jsonb) from public;
grant execute on function public.send_push(uuid, text, jsonb) to authenticated, service_role;
