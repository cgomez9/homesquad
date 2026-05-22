-- 2026-05-22: next_occurrence v2 — adds optional family_tz parameter and
-- supports times[] (HH:MM, family-local) on daily/weekly/once recurrence.
-- Backward-compatible: missing times[] preserves the original midnight-UTC
-- behavior, family_tz is ignored when times are absent.

-- Drop old 2-arg signature first so PostgreSQL does not keep a second overload.
-- Callers that pass 2 args will now hit the 3-arg function (default family_tz='UTC').
drop function if exists public.next_occurrence(jsonb, timestamptz);

create or replace function public.next_occurrence(
  rec       jsonb,
  after     timestamptz,
  family_tz text default 'UTC'
) returns timestamptz
  language plpgsql immutable
as $$
declare
  rtype text := rec->>'type';
  has_times boolean := coalesce(
                         jsonb_typeof(rec->'times') = 'array'
                         and jsonb_array_length(rec->'times') > 0,
                         false
                       );
  due_str text;
  due_date date;
  time_str text;
  d_local date;
  candidate timestamptz;
  i int;
  dow_int int;
  weekly_days jsonb;
begin
  if rtype = 'once' then
    due_str := rec->>'due';
    if due_str is null then
      raise exception 'recurrence type=once requires "due"';
    end if;
    time_str := coalesce(rec->>'time', '00:00');
    candidate := ((due_str::date)::timestamp + time_str::time)
                 at time zone family_tz;
    if candidate > after then return candidate; else return null; end if;

  elsif rtype = 'daily' then
    if not has_times then
      return ((after::date) + interval '1 day')::timestamptz;
    end if;
    -- Scan today + 14 days, picking the earliest (date, time) > after.
    d_local := (after at time zone family_tz)::date;
    for i in 0..14 loop
      for time_str in
        select value from jsonb_array_elements_text(rec->'times') order by value
      loop
        candidate := ((d_local + i)::timestamp + time_str::time)
                     at time zone family_tz;
        if candidate > after then return candidate; end if;
      end loop;
    end loop;
    raise exception 'next_occurrence: no daily candidate within 15 days (impossible)';

  elsif rtype = 'weekly' then
    weekly_days := coalesce(rec->'days', '[]'::jsonb);
    if jsonb_array_length(weekly_days) = 0 then
      raise exception 'recurrence type=weekly requires non-empty "days"';
    end if;
    if not has_times then
      -- Legacy weekly: midnight of next matching weekday.
      for i in 1..7 loop
        candidate := ((after::date) + (i || ' days')::interval)::timestamptz;
        dow_int := extract(dow from candidate)::int;
        if exists (
          select 1 from jsonb_array_elements_text(weekly_days) x
          where x.value::int = dow_int
        ) then
          return candidate;
        end if;
      end loop;
      raise exception 'next_occurrence: no matching weekday in 7-day search (impossible)';
    end if;
    -- Weekly with times: scan today + 14 days, only on matching weekdays.
    d_local := (after at time zone family_tz)::date;
    for i in 0..14 loop
      dow_int := extract(dow from (d_local + i))::int;
      if exists (
        select 1 from jsonb_array_elements_text(weekly_days) x
        where x.value::int = dow_int
      ) then
        for time_str in
          select value from jsonb_array_elements_text(rec->'times') order by value
        loop
          candidate := ((d_local + i)::timestamp + time_str::time)
                       at time zone family_tz;
          if candidate > after then return candidate; end if;
        end loop;
      end if;
    end loop;
    raise exception 'next_occurrence: no weekly candidate within 15 days (impossible)';

  else
    raise exception 'unknown recurrence type: %', rtype;
  end if;
end;
$$;
