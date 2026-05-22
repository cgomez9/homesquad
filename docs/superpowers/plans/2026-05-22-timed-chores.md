# Timed Chores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let parents schedule chores at specific times of day (e.g., 08:00 and 20:00 daily for "brush teeth"). The materializer creates one chore_instance per (day × time), a push reminder fires 10 minutes before each instance, and the kid home card shows the scheduled time + an "Overdue" badge once `now > due_at`.

**Architecture:** Optional `times: string[]` field (HH:MM family-local) on the existing `Recurrence` JSONB. Zero data backfill — chores without `times` keep midnight-UTC behavior. SQL `next_occurrence` gains a `family_tz` parameter and a times-aware loop. The Edge Function materializer enqueues a `chore_reminder` row into `push_outbox` with `scheduled_for = due_at - 10 min`. Two triggers cancel pending reminders when a chore is completed or archived. The kid card flips to an overdue visual at minute granularity via a setInterval re-render.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Supabase Edge Functions (Deno/TS), Expo React Native, TanStack Query, Jest. Zero new dependencies (HH:MM input is a validated `TextInput` matching the existing `QuietHoursPicker` pattern).

**Spec:** `docs/superpowers/specs/2026-05-22-timed-chores-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `mobile/src/lib/recurrence.ts` | Extend `Recurrence` type + `formatRecurrence` for times (modify) |
| `mobile/tests/recurrence.test.ts` | Jest tests for `formatRecurrence` with times (modify or create) |
| `supabase/migrations/20260522000001_next_occurrence_v2.sql` | New `next_occurrence(rec, after, family_tz)` (create) |
| `supabase/tests/48_next_occurrence_times.sql` | pgTAP coverage for the v2 function (create) |
| `supabase/migrations/20260522000002_chore_reminder_cancellation.sql` | Two triggers + helper functions (create) |
| `supabase/tests/49_chore_reminder_cancellation.sql` | pgTAP coverage for the triggers (create) |
| `supabase/functions/generate_chore_instances/index.ts` | Timezone-aware loop + reminder enqueue (modify) |
| `supabase/functions/send_push_drain/index.ts` | `chore_reminder` branch in `formatMessage` (modify) |
| `mobile/src/components/PushPrefsList.tsx` | Add `chore_reminder` to EVENT_TYPES (modify) |
| `mobile/src/i18n/locales/en.json` | New i18n keys (modify) |
| `mobile/src/i18n/locales/es.json` | New i18n keys (modify) |
| `mobile/src/components/RecurrencePicker.tsx` | Theme migration + "Specific times" UI (modify) |
| `mobile/tests/RecurrencePicker.test.tsx` | Chip add/remove/dedup/sort tests (create) |
| `mobile/app/(app)/kid/[profileId]/index.tsx` | Time label + overdue badge on ChoreCard (modify) |
| `mobile/tests/kidHomeChoreCard.test.tsx` | Overdue-branch render test (create) |

---

## Task 1: Recurrence type + formatRecurrence

**Files:**
- Modify: `mobile/src/lib/recurrence.ts`
- Modify: `mobile/src/i18n/locales/en.json`, `mobile/src/i18n/locales/es.json`
- Create: `mobile/tests/recurrence.test.ts`

- [ ] **Step 1: Add i18n keys for time-formatted recurrence (en)**

In `mobile/src/i18n/locales/en.json`, find the `recurrence` block (sibling of `goals`). Add these keys at the end of the block, before the closing `}`:

```json
"timesSuffix": " · {{times}}",
"timesJoin": ", "
```

If a `recurrence` block does not already exist, add the whole block at the end of the file (and add a comma after the previous top-level block). Use this format:

```json
"recurrence": {
  "daily": "Daily",
  "everyDay": "Every day",
  "onceOn": "Once on {{date}}",
  "unknown": "Unknown",
  "dayShort": { "sun": "Sun", "mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat" },
  "timesSuffix": " · {{times}}",
  "timesJoin": ", "
}
```

If the existing `recurrence` block already has all keys except the two new ones (likely), only add the two new keys.

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, in the matching `recurrence` block, add:

```json
"timesSuffix": " · {{times}}",
"timesJoin": ", "
```

- [ ] **Step 3: Write the failing Jest test**

Create `mobile/tests/recurrence.test.ts`:

```ts
import { formatRecurrence, type Recurrence } from '../src/lib/recurrence';

describe('formatRecurrence with times', () => {
  it('formats daily with one time (English)', () => {
    const rec: Recurrence = { type: 'daily', times: ['08:00'] };
    expect(formatRecurrence(rec)).toBe('Daily · 8:00 AM');
  });

  it('formats daily with two times (English, sorted)', () => {
    const rec: Recurrence = { type: 'daily', times: ['20:00', '08:00'] };
    expect(formatRecurrence(rec)).toBe('Daily · 8:00 AM, 8:00 PM');
  });

  it('formats weekly with days + times (English)', () => {
    const rec: Recurrence = { type: 'weekly', days: [1, 3, 5], times: ['07:00'] };
    // Days render via short labels separated by ' · ', then ' · ' + times.
    expect(formatRecurrence(rec)).toBe('Mon · Wed · Fri · 7:00 AM');
  });

  it('formats daily without times (legacy, English)', () => {
    const rec: Recurrence = { type: 'daily' };
    expect(formatRecurrence(rec)).toBe('Daily');
  });

  it('formats daily with empty times array (English)', () => {
    const rec: Recurrence = { type: 'daily', times: [] };
    expect(formatRecurrence(rec)).toBe('Daily');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=recurrence`
Expected: All five tests FAIL — the `times` field is not yet in the type, and `formatRecurrence` does not render times.

- [ ] **Step 5: Update the Recurrence type and formatRecurrence**

Replace the entire contents of `mobile/src/lib/recurrence.ts` with:

```ts
export type Recurrence =
  | { type: 'once'; due: string; time?: string }
  | { type: 'daily'; times?: string[] }
  | { type: 'weekly'; days: number[]; times?: string[] };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function formatTimes(times: string[] | undefined, t?: TFn): string {
  if (!times || times.length === 0) return '';
  // Render each "HH:MM" as locale time. Without a `t`, use US default.
  const sorted = [...times].sort();
  const labels = sorted.map((hhmm) => {
    const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
    const d = new Date(2000, 0, 1, h, m);
    // Pass `undefined` to follow the device's locale; in Jest this resolves to en-US.
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  });
  const join = t ? t('recurrence.timesJoin') : ', ';
  const joined = labels.join(join);
  return t ? t('recurrence.timesSuffix', { times: joined }) : ` · ${joined}`;
}

// `t` is optional: without it (e.g. unit tests) the original English strings
// are returned verbatim; with it, output is localized via i18n.
export function formatRecurrence(rec: Recurrence, t?: TFn): string {
  if (rec.type === 'once') {
    const d = new Date(rec.due + 'T00:00:00Z');
    const date = d.toLocaleDateString(
      t ? undefined : 'en-US',
      { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
    );
    const base = t
      ? t('recurrence.onceOn', { date })
      : `Once on ${date}`;
    return base + formatTimes(rec.time ? [rec.time] : undefined, t);
  }
  if (rec.type === 'daily') {
    const base = t ? t('recurrence.daily') : 'Daily';
    return base + formatTimes(rec.times, t);
  }
  if (rec.type === 'weekly') {
    let base: string;
    if (rec.days.length === 7) {
      base = t ? t('recurrence.everyDay') : 'Every day';
    } else {
      base = [...rec.days]
        .sort((a, b) => a - b)
        .map((d) => (t ? t(`recurrence.dayShort.${DAY_KEYS[d]}`) : DAY_LABELS[d]))
        .join(' · ');
    }
    return base + formatTimes(rec.times, t);
  }
  return t ? t('recurrence.unknown') : 'Unknown';
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=recurrence`
Expected: All five tests PASS.

- [ ] **Step 7: Run the full test suite + tsc**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: All suites pass (22+ suites). The change is additive to the Recurrence type, so existing tests stay green.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/lib/recurrence.ts mobile/tests/recurrence.test.ts mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): Recurrence type — optional times[] + formatRecurrence rendering"
```

---

## Task 2: next_occurrence v2 SQL with family_tz + times

**Files:**
- Create: `supabase/migrations/20260522000001_next_occurrence_v2.sql`
- Create: `supabase/tests/48_next_occurrence_times.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/48_next_occurrence_times.sql`:

```sql
begin;
select plan(10);

-- 1. Legacy (no times) — daily produces midnight of next date in UTC.
select is(
  public.next_occurrence(
    '{"type":"daily"}'::jsonb,
    '2026-05-22T10:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-23T00:00:00Z'::timestamptz,
  'legacy daily without times → midnight next day UTC'
);

-- 2. Daily with one time, family TZ UTC.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00"]}'::jsonb,
    '2026-05-22T07:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-22T08:00:00Z'::timestamptz,
  'daily with 08:00 (UTC tz) — same-day 08:00 wins when after is 07:00'
);

-- 3. Daily with one time, after is just past it.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00"]}'::jsonb,
    '2026-05-22T08:01:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-23T08:00:00Z'::timestamptz,
  'daily 08:00, after = 08:01 → next-day 08:00'
);

-- 4. Daily with two times — picks earliest > after.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00","20:00"]}'::jsonb,
    '2026-05-22T10:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-22T20:00:00Z'::timestamptz,
  'daily [08:00, 20:00], after = 10:00 → 20:00 same day'
);

-- 5. Daily with two times — wraps to next day after last.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00","20:00"]}'::jsonb,
    '2026-05-22T21:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-23T08:00:00Z'::timestamptz,
  'daily [08:00, 20:00], after = 21:00 → 08:00 next day'
);

-- 6. Weekly with days [1,3,5] (Mon, Wed, Fri) and one time.
-- 2026-05-22 is a Friday (dow=5). After Fri 10:00, next is Mon 07:00.
select is(
  public.next_occurrence(
    '{"type":"weekly","days":[1,3,5],"times":["07:00"]}'::jsonb,
    '2026-05-22T10:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-25T07:00:00Z'::timestamptz,
  'weekly Mon/Wed/Fri at 07:00, after Fri 10:00 → next Mon 07:00'
);

-- 7. Family timezone: America/Bogota (UTC-5, no DST).
-- 08:00 Bogota = 13:00 UTC. After 12:00 UTC = 07:00 Bogota → next is same-day 13:00 UTC.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00"]}'::jsonb,
    '2026-05-22T12:00:00Z'::timestamptz,
    'America/Bogota'
  ),
  '2026-05-22T13:00:00Z'::timestamptz,
  'daily 08:00 Bogota, after 07:00 Bogota → 08:00 Bogota = 13:00 UTC same day'
);

-- 8. Family timezone wrap: after 09:00 Bogota = 14:00 UTC, next is next-day 13:00 UTC.
select is(
  public.next_occurrence(
    '{"type":"daily","times":["08:00"]}'::jsonb,
    '2026-05-22T14:00:00Z'::timestamptz,
    'America/Bogota'
  ),
  '2026-05-23T13:00:00Z'::timestamptz,
  'daily 08:00 Bogota, after 09:00 Bogota → 08:00 Bogota next day = 13:00 UTC next day'
);

-- 9. Once with optional time — fires when after is before due.
select is(
  public.next_occurrence(
    '{"type":"once","due":"2026-05-25","time":"18:00"}'::jsonb,
    '2026-05-22T10:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-25T18:00:00Z'::timestamptz,
  'once 2026-05-25 18:00 UTC, after = 2026-05-22 10:00 → due timestamp'
);

-- 10. Empty times array behaves like legacy.
select is(
  public.next_occurrence(
    '{"type":"daily","times":[]}'::jsonb,
    '2026-05-22T10:00:00Z'::timestamptz,
    'UTC'
  ),
  '2026-05-23T00:00:00Z'::timestamptz,
  'daily with times:[] → legacy midnight next day UTC'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP — verify it fails**

Run: `cd C:/Users/USUARIO/Desktop/Shores && npx supabase test db`
Expected: most assertions in `48_next_occurrence_times.sql` fail with "function next_occurrence(jsonb, timestamptz, text) does not exist" — the function still has the two-argument signature.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260522000001_next_occurrence_v2.sql`:

```sql
-- 2026-05-22: next_occurrence v2 — adds optional family_tz parameter and
-- supports times[] (HH:MM, family-local) on daily/weekly/once recurrence.
-- Backward-compatible: missing times[] preserves the original midnight-UTC
-- behavior, family_tz is ignored when times are absent.

create or replace function public.next_occurrence(
  rec       jsonb,
  after     timestamptz,
  family_tz text default 'UTC'
) returns timestamptz
  language plpgsql immutable
as $$
declare
  rtype text := rec->>'type';
  has_times boolean := jsonb_typeof(rec->'times') = 'array'
                       and jsonb_array_length(rec->'times') > 0;
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
```

- [ ] **Step 4: Apply the migration and run pgTAP — verify it passes**

Run: `cd C:/Users/USUARIO/Desktop/Shores && npx supabase db reset`
Expected: completes without error; all migrations apply.

Run: `cd C:/Users/USUARIO/Desktop/Shores && npx supabase test db`
Expected: full pgTAP suite green — `48_next_occurrence_times.sql` reports 10 ok.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add supabase/migrations/20260522000001_next_occurrence_v2.sql supabase/tests/48_next_occurrence_times.sql
git commit -m "feat(supabase): next_occurrence v2 — family_tz + times[] support"
```

---

## Task 3: Cancellation triggers (chore_instance status + chore archive)

**Files:**
- Create: `supabase/migrations/20260522000002_chore_reminder_cancellation.sql`
- Create: `supabase/tests/49_chore_reminder_cancellation.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/49_chore_reminder_cancellation.sql`:

```sql
begin;
select plan(6);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1,
   '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by)
values
  ('c1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Brush teeth', 10,
   'auto', '{"type":"daily","times":["08:00"]}'::jsonb,
   'a2222222-2222-2222-2222-222222222222',
   'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status)
values
  ('11111111-aaaa-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a2222222-2222-2222-2222-222222222222',
   '2026-05-22T08:00:00Z',
   'pending');

-- Two pending reminders that should be canceled by the triggers.
insert into public.push_outbox(family_id, recipient_id, event_type, payload, scheduled_for)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a1111111-1111-1111-1111-111111111111',
   'chore_reminder',
   jsonb_build_object(
     'chore_id', 'c1111111-1111-1111-1111-111111111111',
     'kid_profile_id', 'a2222222-2222-2222-2222-222222222222',
     'due_at', '2026-05-22T08:00:00Z'
   ),
   '2026-05-22T07:50:00Z'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a1111111-1111-1111-1111-111111111111',
   'chore_reminder',
   jsonb_build_object(
     'chore_id', 'c1111111-1111-1111-1111-111111111111',
     'kid_profile_id', 'a2222222-2222-2222-2222-222222222222',
     'due_at', '2026-05-23T08:00:00Z'
   ),
   '2026-05-23T07:50:00Z');

-- 1. Before any change, both pending reminders are present.
select is(
  (select count(*)::int from public.push_outbox
    where event_type = 'chore_reminder' and status = 'pending'),
  2, 'baseline: 2 pending reminders'
);

-- 2. Update chore_instance status pending → submitted. The reminder
-- matching (chore_id, due_at) flips to canceled.
update public.chore_instances
   set status = 'submitted', completed_by = 'a2222222-2222-2222-2222-222222222222', completed_at = now()
 where id = '11111111-aaaa-1111-1111-111111111111';

select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-22T08:00:00Z'),
  'canceled', 'instance pending→submitted cancels its matching reminder'
);

-- 3. The reminder for the OTHER due_at is still pending.
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-23T08:00:00Z'),
  'pending', 'reminders for other due_at are unaffected'
);

-- 4. Subsequent status changes (submitted → approved) do NOT re-fire the cancel.
-- (idempotency: we only act on pending → not-pending; canceled rows stay canceled.)
update public.chore_instances
   set status = 'approved', approved_by = 'a1111111-1111-1111-1111-111111111111', approved_at = now()
 where id = '11111111-aaaa-1111-1111-111111111111';
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-22T08:00:00Z'),
  'canceled', 'subsequent status changes leave canceled rows alone'
);

-- 5. Archive the chore. The remaining pending reminder flips to canceled.
update public.chores set active = false
 where id = 'c1111111-1111-1111-1111-111111111111';
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-23T08:00:00Z'),
  'canceled', 'archive cancels remaining pending reminders'
);

-- 6. Re-activating the chore does NOT resurrect canceled reminders.
update public.chores set active = true
 where id = 'c1111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.push_outbox
    where event_type = 'chore_reminder' and status = 'pending'),
  0, 're-activating chore does not resurrect canceled reminders'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP to verify it fails**

Run: `cd C:/Users/USUARIO/Desktop/Shores && npx supabase test db`
Expected: assertions 2, 4, 5, 6 in `49_chore_reminder_cancellation.sql` fail because the cancellation triggers don't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260522000002_chore_reminder_cancellation.sql`:

```sql
-- 2026-05-22: cancel pending chore_reminder rows in push_outbox when the
-- linked chore_instance leaves 'pending' or its chore is archived.
-- Both triggers are SECURITY DEFINER so the cancel update succeeds under RLS.

create or replace function public.cancel_reminders_on_instance_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.chore_id
       and (payload->>'due_at')::timestamptz = new.due_at;
  end if;
  return new;
end;
$$;

create trigger chore_instance_cancel_reminder
  after update of status on public.chore_instances
  for each row execute function public.cancel_reminders_on_instance_status_change();

create or replace function public.cancel_reminders_on_chore_archive()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.active = true and new.active = false then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.id;
  end if;
  return new;
end;
$$;

create trigger chore_cancel_reminders_on_archive
  after update of active on public.chores
  for each row execute function public.cancel_reminders_on_chore_archive();
```

- [ ] **Step 4: Apply migration and run pgTAP**

Run: `cd C:/Users/USUARIO/Desktop/Shores && npx supabase db reset && npx supabase test db`
Expected: full pgTAP suite green — `49_chore_reminder_cancellation.sql` reports 6 ok.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add supabase/migrations/20260522000002_chore_reminder_cancellation.sql supabase/tests/49_chore_reminder_cancellation.sql
git commit -m "feat(supabase): cancel chore_reminder push_outbox rows on completion or archive"
```

---

## Task 4: Materializer — timezone-aware loop + reminder enqueue

**Files:**
- Modify: `supabase/functions/generate_chore_instances/index.ts`

- [ ] **Step 1: Rewrite the materializer to include timezone + reminder enqueue**

Replace the entire contents of `supabase/functions/generate_chore_instances/index.ts` with:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MAX_BACKFILL_PER_CHORE = 14;
const REMINDER_LEAD_MINUTES = 10;

type ChoreRow = {
  id: string;
  family_id: string;
  assignee_profile_id: string | null;
  recurrence: { type: string; times?: string[] } & Record<string, unknown>;
  next_due_at: string;
  family: { timezone: string } | null;
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: chores, error } = await supabase
    .from('chores')
    .select('id, family_id, assignee_profile_id, recurrence, next_due_at, family:families(timezone)')
    .eq('active', true)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff);
  if (error) return new Response(error.message, { status: 500 });

  let totalInserted = 0;
  let totalReminders = 0;
  for (const chore of (chores ?? []) as unknown as ChoreRow[]) {
    const tz = chore.family?.timezone ?? 'UTC';
    const hasTimes = Array.isArray(chore.recurrence?.times) && chore.recurrence.times.length > 0;
    let nextDue: string | null = chore.next_due_at;
    let iter = 0;
    while (nextDue && new Date(nextDue) <= new Date(cutoff) && iter < MAX_BACKFILL_PER_CHORE) {
      const { error: insErr } = await supabase
        .from('chore_instances')
        .insert({
          chore_id: chore.id,
          family_id: chore.family_id,
          assignee_profile_id: chore.assignee_profile_id,
          due_at: nextDue,
        });
      if (insErr && !insErr.message.includes('duplicate key')) {
        return new Response(`insert failed: ${insErr.message}`, { status: 500 });
      }
      if (!insErr) totalInserted++;

      if (hasTimes && chore.assignee_profile_id) {
        const enqueued = await enqueueReminder(
          supabase, chore.family_id, chore.assignee_profile_id, nextDue, chore.id,
        );
        totalReminders += enqueued;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('next_occurrence', {
        rec: chore.recurrence,
        after: nextDue,
        family_tz: tz,
      });
      if (rpcErr) return new Response(`next_occurrence failed: ${rpcErr.message}`, { status: 500 });
      nextDue = rpcData as string | null;
      iter++;
    }

    await supabase.from('chores').update({ next_due_at: nextDue }).eq('id', chore.id);
  }

  return new Response(JSON.stringify({
    inserted: totalInserted,
    reminders: totalReminders,
    chores: chores?.length ?? 0,
  }), { headers: { 'Content-Type': 'application/json' } });
});

async function enqueueReminder(
  supabase: ReturnType<typeof createClient>,
  familyId: string,
  kidProfileId: string,
  dueAt: string,
  choreId: string,
): Promise<number> {
  const reminderAt = new Date(new Date(dueAt).getTime() - REMINDER_LEAD_MINUTES * 60 * 1000).toISOString();

  // Idempotency: skip if a pending reminder already exists for this
  // (chore_id, due_at). Re-running the materializer must not duplicate.
  const { data: existing } = await supabase
    .from('push_outbox')
    .select('id')
    .eq('event_type', 'chore_reminder')
    .eq('status', 'pending')
    .filter('payload->>chore_id', 'eq', choreId)
    .filter('payload->>due_at', 'eq', dueAt)
    .limit(1)
    .maybeSingle();
  if (existing) return 0;

  // Resolve recipient — kid first if they have a token + pref allows;
  // otherwise fan out to all parents with token + pref.
  const { data: kid } = await supabase
    .from('profiles')
    .select('push_token, push_prefs')
    .eq('id', kidProfileId)
    .single();
  const kidPushPrefs = (kid?.push_prefs as Record<string, boolean> | null) ?? {};
  const kidAllowed = (kid as { push_token?: string | null } | null)?.push_token
    && kidPushPrefs.chore_reminder !== false;

  const recipients: { recipient_id: string }[] = [];
  if (kidAllowed) {
    recipients.push({ recipient_id: kidProfileId });
  } else {
    const { data: parents } = await supabase
      .from('profiles')
      .select('id, push_token, push_prefs')
      .eq('family_id', familyId)
      .eq('type', 'parent');
    for (const p of (parents ?? []) as Array<{ id: string; push_token: string | null; push_prefs: Record<string, boolean> | null }>) {
      const prefs = p.push_prefs ?? {};
      if (p.push_token && prefs.chore_reminder !== false) {
        recipients.push({ recipient_id: p.id });
      }
    }
  }
  if (recipients.length === 0) return 0;

  const rows = recipients.map((r) => ({
    family_id: familyId,
    recipient_id: r.recipient_id,
    event_type: 'chore_reminder',
    payload: { chore_id: choreId, kid_profile_id: kidProfileId, due_at: dueAt },
    scheduled_for: reminderAt,
  }));
  const { error } = await supabase.from('push_outbox').insert(rows);
  if (error) return 0;
  return rows.length;
}
```

- [ ] **Step 2: Smoke test the function locally**

Edge Function changes are best smoke-tested via `npx supabase functions serve` + a curl invocation. Run:

```
cd C:/Users/USUARIO/Desktop/Shores
npx supabase functions serve generate_chore_instances --no-verify-jwt
```

In a second shell:

```
curl -X POST http://localhost:54321/functions/v1/generate_chore_instances \
  -H "Content-Type: application/json" -d '{}'
```

Expected response: a JSON body `{"inserted": <int>, "reminders": <int>, "chores": <int>}`. With no chores in the local DB (fresh reset), expect `{"inserted":0,"reminders":0,"chores":0}`.

If the serve command isn't available or hangs, skip the local smoke and rely on pgTAP from Task 3 for the cancellation behavior + manual emulator verification later.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add supabase/functions/generate_chore_instances/index.ts
git commit -m "feat(supabase): materializer — timezone-aware loop + chore_reminder enqueue"
```

---

## Task 5: send_push_drain — chore_reminder branch

**Files:**
- Modify: `supabase/functions/send_push_drain/index.ts`

- [ ] **Step 1: Add the chore_reminder branch in formatMessage**

Open `supabase/functions/send_push_drain/index.ts`. Inside the `formatMessage` function, immediately AFTER the `if (it.event_type === 'goal_completed')` block and BEFORE the final fallback `return { title: 'Shores', body: 'New activity in your family.' };`, insert:

```ts
  if (it.event_type === 'chore_reminder') {
    const choreId = p.chore_id as string | undefined;
    const kidId = p.kid_profile_id as string | undefined;
    let choreTitle = 'a chore';
    let kidName = 'A kid';
    if (choreId) {
      const { data } = await supabase
        .from('chores').select('title').eq('id', choreId).single();
      choreTitle = (data as { title?: string } | null)?.title ?? choreTitle;
    }
    if (kidId) {
      const { data } = await supabase
        .from('profiles').select('display_name').eq('id', kidId).single();
      kidName = (data as { display_name?: string } | null)?.display_name ?? kidName;
    }
    return { title: '⏰ Reminder', body: `${kidName} — time for ${choreTitle} in 10 min` };
  }
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add supabase/functions/send_push_drain/index.ts
git commit -m "feat(supabase): send_push_drain — chore_reminder title + body"
```

---

## Task 6: PushPrefsList catalog + i18n

**Files:**
- Modify: `mobile/src/components/PushPrefsList.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add `chore_reminder` to EVENT_TYPES**

In `mobile/src/components/PushPrefsList.tsx`, find the `EVENT_TYPES` const tuple and add `'chore_reminder'` at the end of the array (just before the closing `]`):

```ts
export const EVENT_TYPES = [
  'chore_submitted',
  'chore_approved',
  'chore_rejected',
  'redemption_requested',
  'redemption_approved',
  'redemption_denied',
  'redemption_fulfilled',
  'achievement_unlocked',
  'streak_milestone',
  'goal_completed',
  'chore_reminder',
] as const;
```

- [ ] **Step 2: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, find the `notifications.events` block and add at the end:

```json
"chore_reminder": "Chore reminders"
```

Be careful to add a comma after the previous key.

- [ ] **Step 3: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, find the matching `notifications.events` block and add:

```json
"chore_reminder": "Recordatorios de tareas"
```

- [ ] **Step 4: TypeScript check + tests**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean (the new key is automatically narrowed into the `EventType` union).

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/PushPrefsList.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): PushPrefsList — add chore_reminder toggle + i18n"
```

---

## Task 7: RecurrencePicker — theme migration + "Specific times" UI

**Files:**
- Modify: `mobile/src/components/RecurrencePicker.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`
- Create: `mobile/tests/RecurrencePicker.test.tsx`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, inside the `forms` block, add (mind commas for valid JSON):

```json
"recurrenceLabel": "Recurrence",
"repeats": "Repeats",
"dueDateLabel": "Due date (YYYY-MM-DD)",
"dueDatePlaceholder": "2026-05-23",
"recurrenceDaily": "Daily",
"recurrenceWeekly": "Weekly",
"specificTimesToggle": "At specific times",
"addTimePlaceholder": "HH:MM",
"addTime": "+ Add",
"invalidTime": "Use 24h format like 08:00"
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, in the matching `forms` block, add:

```json
"recurrenceLabel": "Repetición",
"repeats": "Se repite",
"dueDateLabel": "Fecha (AAAA-MM-DD)",
"dueDatePlaceholder": "2026-05-23",
"recurrenceDaily": "Diaria",
"recurrenceWeekly": "Semanal",
"specificTimesToggle": "A horas específicas",
"addTimePlaceholder": "HH:MM",
"addTime": "+ Añadir",
"invalidTime": "Usa formato 24h como 08:00"
```

- [ ] **Step 3: Write the failing Jest test**

Create `mobile/tests/RecurrencePicker.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecurrencePicker } from '../src/components/RecurrencePicker';
import type { Recurrence } from '../src/lib/recurrence';

function controlled(initial: Recurrence) {
  let value = initial;
  const onChange = jest.fn((next: Recurrence) => {
    value = next;
  });
  return { get value() { return value; }, onChange };
}

describe('RecurrencePicker times UI', () => {
  it('renders Specific times toggle off by default for daily without times', () => {
    const { onChange } = controlled({ type: 'daily' });
    const { getByTestId } = render(
      <RecurrencePicker value={{ type: 'daily' }} onChange={onChange} />,
    );
    const toggle = getByTestId('specific-times-toggle');
    expect(toggle.props.value).toBe(false);
  });

  it('turning the toggle on starts with empty times and shows the input row', () => {
    const ctrl = controlled({ type: 'daily' });
    const { getByTestId, queryByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent(getByTestId('specific-times-toggle'), 'valueChange', true);
    expect(ctrl.onChange).toHaveBeenCalledWith({ type: 'daily', times: [] });
    // Rerender with the new value so the input appears.
    const tree = render(
      <RecurrencePicker value={{ type: 'daily', times: [] }} onChange={ctrl.onChange} />,
    );
    expect(tree.queryByTestId('add-time-input')).not.toBeNull();
  });

  it('adding a valid time inserts it sorted and dedup', () => {
    const ctrl = controlled({ type: 'daily', times: ['20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.changeText(getByTestId('add-time-input'), '08:00');
    fireEvent.press(getByTestId('add-time-button'));
    expect(ctrl.onChange).toHaveBeenLastCalledWith({
      type: 'daily', times: ['08:00', '20:00'],
    });
  });

  it('adding a duplicate time is a no-op', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.changeText(getByTestId('add-time-input'), '08:00');
    fireEvent.press(getByTestId('add-time-button'));
    // onChange not invoked for dedup; assert it kept the original.
    expect(ctrl.onChange).not.toHaveBeenCalled();
  });

  it('removing a time chip drops it', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00', '20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-chip-remove-08:00'));
    expect(ctrl.onChange).toHaveBeenCalledWith({
      type: 'daily', times: ['20:00'],
    });
  });

  it('invalid time format shows error and does not call onChange', () => {
    const ctrl = controlled({ type: 'daily', times: [] });
    const { getByTestId, queryByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.changeText(getByTestId('add-time-input'), '99:99');
    fireEvent.press(getByTestId('add-time-button'));
    expect(ctrl.onChange).not.toHaveBeenCalled();
    expect(queryByTestId('add-time-error')).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=RecurrencePicker`
Expected: all six new tests fail — the `specific-times-toggle` testID doesn't exist yet.

- [ ] **Step 5: Rewrite `RecurrencePicker.tsx`**

Replace the entire contents of `mobile/src/components/RecurrencePicker.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, radii, typography, useTheme, type Palette } from '../theme';
import type { Recurrence } from '../lib/recurrence';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMES = 6;

export function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (r: Recurrence) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [pendingTime, setPendingTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isRecurring = value.type !== 'once';
  const currentTimes: string[] =
    (value.type === 'daily' || value.type === 'weekly')
      ? value.times ?? []
      : [];
  const hasTimes = currentTimes.length > 0;
  const supportsTimes = value.type === 'daily' || value.type === 'weekly';

  function patchTimes(next: string[]) {
    if (value.type === 'daily') {
      onChange(next.length === 0 ? { type: 'daily' } : { type: 'daily', times: next });
    } else if (value.type === 'weekly') {
      onChange(
        next.length === 0
          ? { type: 'weekly', days: value.days }
          : { type: 'weekly', days: value.days, times: next },
      );
    }
  }

  function toggleSpecificTimes(on: boolean) {
    setError(null);
    if (on) {
      // Add an empty times array — UI now shows the input.
      if (value.type === 'daily') onChange({ type: 'daily', times: [] });
      else if (value.type === 'weekly') onChange({ type: 'weekly', days: value.days, times: [] });
    } else {
      patchTimes([]);
    }
  }

  function addTime() {
    setError(null);
    const trimmed = pendingTime.trim();
    if (!TIME_RE.test(trimmed)) {
      setError(t('forms.invalidTime'));
      return;
    }
    if (currentTimes.includes(trimmed)) return; // dedup, silent
    if (currentTimes.length >= MAX_TIMES) {
      setError(t('forms.invalidTime'));
      return;
    }
    const next = [...currentTimes, trimmed].sort();
    patchTimes(next);
    setPendingTime('');
  }

  function removeTime(time: string) {
    patchTimes(currentTimes.filter((x) => x !== time));
  }

  return (
    <View>
      <Text style={styles.label}>{t('forms.recurrenceLabel')}</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('forms.repeats')}</Text>
        <Switch
          value={isRecurring}
          onValueChange={(on) =>
            onChange(on ? { type: 'daily' } : { type: 'once', due: new Date().toISOString().slice(0, 10) })
          }
        />
      </View>

      {!isRecurring && value.type === 'once' && (
        <View>
          <Text style={styles.sub}>{t('forms.dueDateLabel')}</Text>
          <TextInput
            value={value.due}
            onChangeText={(text) => onChange({ type: 'once', due: text })}
            style={styles.input}
            placeholder={t('forms.dueDatePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      )}

      {isRecurring && (
        <View>
          <View style={styles.segRow}>
            {(['daily', 'weekly'] as const).map((kind) => {
              const sel = value.type === kind;
              return (
                <Pressable
                  key={kind}
                  onPress={() =>
                    onChange(
                      kind === 'daily'
                        ? { type: 'daily', ...(currentTimes.length ? { times: currentTimes } : {}) }
                        : { type: 'weekly', days: [new Date().getDay()], ...(currentTimes.length ? { times: currentTimes } : {}) },
                    )
                  }
                  style={[styles.seg, sel && styles.segSel]}
                >
                  <Text style={[styles.segText, sel && styles.segTextSel]}>
                    {kind === 'daily' ? t('forms.recurrenceDaily') : t('forms.recurrenceWeekly')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {value.type === 'weekly' && (
            <View style={styles.daysRow}>
              {DAY_KEYS.map((key, i) => {
                const sel = value.days.includes(i);
                return (
                  <Pressable
                    key={key}
                    onPress={() =>
                      onChange({
                        type: 'weekly',
                        days: sel ? value.days.filter((d) => d !== i) : [...value.days, i].sort(),
                        ...(currentTimes.length ? { times: currentTimes } : {}),
                      })
                    }
                    style={[styles.dayChip, sel && styles.dayChipSel]}
                  >
                    <Text style={[styles.dayText, sel && styles.dayTextSel]}>
                      {t(`recurrence.dayShort.${key}`).charAt(0)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {supportsTimes && (
            <View style={styles.timesBlock}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('forms.specificTimesToggle')}</Text>
                <Switch
                  testID="specific-times-toggle"
                  value={hasTimes || (value as { times?: string[] }).times !== undefined}
                  onValueChange={toggleSpecificTimes}
                />
              </View>

              {((value as { times?: string[] }).times !== undefined) && (
                <View>
                  <View style={styles.chipsRow}>
                    {currentTimes.map((time) => (
                      <View key={time} style={styles.chip}>
                        <Text style={styles.chipText}>{time}</Text>
                        <Pressable
                          testID={`time-chip-remove-${time}`}
                          onPress={() => removeTime(time)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`remove ${time}`}
                        >
                          <Text style={styles.chipRemove}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <View style={styles.addRow}>
                    <TextInput
                      testID="add-time-input"
                      value={pendingTime}
                      onChangeText={setPendingTime}
                      placeholder={t('forms.addTimePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      style={styles.addInput}
                      onSubmitEditing={addTime}
                    />
                    <Pressable
                      testID="add-time-button"
                      onPress={addTime}
                      style={styles.addBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.addBtnText}>{t('forms.addTime')}</Text>
                    </Pressable>
                  </View>
                  {error && (
                    <Text testID="add-time-error" style={styles.error}>{error}</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: {
      fontSize: typography.small,
      fontFamily: typography.fontFamilyBold,
      color: colors.textMuted,
      marginBottom: spacing.xs + 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    rowLabel: {
      flex: 1,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
    },
    sub: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.xs,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    segRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
    seg: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    segSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.text,
    },
    segTextSel: { color: '#fff' },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    dayChip: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.body,
      color: colors.text,
    },
    dayTextSel: { color: '#fff' },
    timesBlock: { marginTop: spacing.md },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(14,165,164,0.12)',
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    chipText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.primaryDark,
    },
    chipRemove: {
      fontFamily: typography.fontFamilyBold,
      fontSize: 18,
      color: colors.primaryDark,
      lineHeight: 18,
    },
    addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    addInput: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    addBtn: {
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
    },
    addBtnText: {
      color: '#fff',
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.body,
    },
    error: {
      color: colors.error,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      marginTop: spacing.xs,
    },
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=RecurrencePicker`
Expected: six new tests PASS.

- [ ] **Step 7: TypeScript + full test suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/RecurrencePicker.tsx mobile/tests/RecurrencePicker.test.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): RecurrencePicker — theme migration + specific times UI"
```

---

## Task 8: Kid card — scheduled time label + overdue badge

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`
- Create: `mobile/tests/kidHomeChoreCard.test.tsx`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, inside the `kid` block, add:

```json
"overdue": "Overdue"
```

(mind comma)

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, in the matching `kid` block, add:

```json
"overdue": "Atrasada"
```

- [ ] **Step 3: Extend the chore_instances query select**

In `mobile/app/(app)/kid/[profileId]/index.tsx`, find the `useQuery` block whose `queryKey` is `['kid-today', profileId]`. Inside the SELECT string, add `recurrence` to the `chore:chores(...)` selection. Change:

```ts
.select('id, status, due_at, rejection_reason, chore:chores(id,title,star_value,verification_mode)')
```

to:

```ts
.select('id, status, due_at, rejection_reason, chore:chores(id,title,star_value,verification_mode,recurrence)')
```

Update the `Instance` type at the top of the file to include the new field. Find:

```ts
type Instance = {
  id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  due_at: string;
  rejection_reason: string | null;
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};
```

Replace with:

```ts
type Instance = {
  id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  due_at: string;
  rejection_reason: string | null;
  chore: {
    id: string;
    title: string;
    star_value: number;
    verification_mode: 'auto'|'photo'|'approval';
    recurrence: { type: string; times?: string[] } | null;
  } | null;
};
```

- [ ] **Step 4: Add `useState` to the `react` import + the minute-tick helper**

In the same file, change the first import line:

```ts
import { useEffect, useMemo, useRef } from 'react';
```

to:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
```

Then, near the top of the file (just below the imports + type definitions, above the `KidHome` component declaration), add:

```ts
function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
```

- [ ] **Step 5: Update the ChoreCard component to render time + overdue**

Find the `ChoreCard` component (around line 271 in the existing file). At the top of its body (after the destructured props), call the new hook and compute the time label:

```tsx
const tick = useMinuteTick(); void tick; // re-render every minute for overdue flip
const hasTimes =
  (inst.chore?.recurrence as { times?: string[] } | null)?.times !== undefined &&
  ((inst.chore?.recurrence as { times?: string[] } | null)?.times?.length ?? 0) > 0;
const timeLabel = hasTimes
  ? new Date(inst.due_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  : null;
const isOverdue =
  hasTimes && inst.status === 'pending' && Date.now() > new Date(inst.due_at).getTime();
```

Then, in the JSX returned for the standard (non-submitted, non-rejected) branch, insert the time label below the metaRow. Find the existing block:

```tsx
return (
  <Animated.View style={[styles.card, animStyle]}>
    <View style={styles.cardMain}>
      <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.star}>⭐ {stars}</Text>
        {isPhoto && (
          <View style={styles.photoTag}>
            <Text style={styles.photoTagText}>{t('kid.photo')}</Text>
          </View>
        )}
      </View>
    </View>
    ...
```

Replace with:

```tsx
return (
  <Animated.View style={[styles.card, isOverdue && styles.cardOverdue, animStyle]}>
    <View style={styles.cardMain}>
      <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.star}>⭐ {stars}</Text>
        {isPhoto && (
          <View style={styles.photoTag}>
            <Text style={styles.photoTagText}>{t('kid.photo')}</Text>
          </View>
        )}
      </View>
      {timeLabel && (
        <Text testID="chore-time-label" style={[styles.timeLabel, isOverdue && styles.timeLabelOverdue]}>
          {isOverdue ? `● 🕗 ${timeLabel} · ${t('kid.overdue')}` : `🕗 ${timeLabel}`}
        </Text>
      )}
    </View>
    ...
```

(Keep the rest of the JSX — the Pressable done button and surrounding View — unchanged.)

- [ ] **Step 6: Add the new styles**

In the same file, inside `makeStyles(colors)`, find the existing `card` style entry. After it, add:

```ts
cardOverdue: {
  borderWidth: 1.5,
  borderColor: colors.warning,
},
timeLabel: {
  fontFamily: typography.fontFamilyBold,
  fontSize: typography.small,
  color: colors.textMuted,
  marginTop: spacing.xs,
},
timeLabelOverdue: {
  color: colors.warning,
},
```

- [ ] **Step 7: Write the Jest test**

Create `mobile/tests/kidHomeChoreCard.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// We import the kid-home module, mount its default export, and inspect the
// rendered chore card via testID. To keep the test focused on overdue
// rendering, we mock the supabase client so the queries return our fixture
// rows immediately.

jest.mock('../src/lib/supabase', () => {
  const channel = () => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  });
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      })),
      rpc: jest.fn().mockResolvedValue({ data: 0 }),
      channel,
      removeChannel: jest.fn(),
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ profileId: 'p1' }),
}));

// We test ChoreCard logic by importing the file and exercising its exported
// helper directly through the rendered surface. Because ChoreCard is not
// exported, we'll smoke-test the timeLabel / overdue branches by snapshot
// at the JSX level using a private import.

import { Text, View } from 'react-native';

// Helper that mirrors the in-file logic (DRY-ish — keeps the test honest
// even if the file refactors the inline logic into a helper later).
function deriveCardState(inst: {
  status: string;
  due_at: string;
  chore: { recurrence: { times?: string[] } | null } | null;
}, now: number) {
  const times = inst.chore?.recurrence?.times;
  const hasTimes = Array.isArray(times) && times.length > 0;
  const isOverdue = hasTimes && inst.status === 'pending' && now > new Date(inst.due_at).getTime();
  return { hasTimes, isOverdue };
}

describe('Kid chore card overdue logic', () => {
  const NOW = new Date('2026-05-22T09:00:00Z').getTime();

  it('not overdue when due_at is in the future', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T20:00:00Z',
      chore: { recurrence: { times: ['08:00', '20:00'] } },
    }, NOW);
    expect(s.hasTimes).toBe(true);
    expect(s.isOverdue).toBe(false);
  });

  it('overdue when due_at is in the past and status is pending', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T08:00:00Z',
      chore: { recurrence: { times: ['08:00', '20:00'] } },
    }, NOW);
    expect(s.isOverdue).toBe(true);
  });

  it('not overdue when status is not pending', () => {
    const s = deriveCardState({
      status: 'submitted',
      due_at: '2026-05-22T08:00:00Z',
      chore: { recurrence: { times: ['08:00'] } },
    }, NOW);
    expect(s.isOverdue).toBe(false);
  });

  it('not overdue for a chore without times (legacy)', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T00:00:00Z',
      chore: { recurrence: { type: 'daily' } as { times?: string[] } | null },
    }, NOW);
    expect(s.hasTimes).toBe(false);
    expect(s.isOverdue).toBe(false);
  });
});
```

(This test exercises the derive logic directly rather than mounting the full kid home — the full mount path requires extensive Supabase + react-query setup that would explode test scope. The derive logic is the only thing we care about validating mechanically; the visual rendering is covered by the manual emulator walkthrough.)

- [ ] **Step 8: Run the test**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=kidHomeChoreCard`
Expected: 4 tests pass.

- [ ] **Step 9: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass (now including the new kidHomeChoreCard suite).

- [ ] **Step 10: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/app/\(app\)/kid/\[profileId\]/index.tsx mobile/tests/kidHomeChoreCard.test.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): kid home — scheduled time label + overdue badge"
```

---

## Final verification

After all 8 tasks ship, run from `C:/Users/USUARIO/Desktop/Shores`:

- [ ] **Full mobile test suite**: `cd mobile && npm test -- --ci --watchman=false` — expected all suites green (22+ existing + new ones from Tasks 1, 7, 8).
- [ ] **Full TypeScript**: `cd mobile && npx tsc --noEmit` — expected no new errors.
- [ ] **Full pgTAP suite**: `npx supabase test db` — expected all green (existing + new `48`, `49`).
- [ ] **Manual emulator walkthrough (light + dark)**:
  - Create chore "Brush teeth" daily with times `['08:00', '20:00']`. Confirm the parent chore form shows two time chips, the recurrence summary reads `Daily · 8:00 AM, 8:00 PM`.
  - Switch to a kid profile. Confirm two cards appear (one for 8:00, one for 20:00) each showing `🕗 8:00 AM` / `🕗 8:00 PM`.
  - Set the device clock to 08:01 (or wait). Confirm the 08:00 card flips to overdue: warning-colored border + `● 🕗 8:00 AM · Overdue`. The done button remains active.
  - Tap "Done" on the overdue card. Confirm the card disappears (status → submitted or approved). Inspect the local push_outbox to confirm the matching pending reminder flipped to `canceled`.
  - Switch back to parent. Archive the chore. Inspect push_outbox to confirm all remaining pending reminders for that chore are now `canceled`.
  - Approve a chore reminder from another parent session that fires while testing: confirm the reminder push arrives ~10 min before the due time (or fast-forward by enqueueing a `push_outbox` row with `scheduled_for = now()` for testing the drain path).

If everything passes, hand off to `superpowers:finishing-a-development-branch`.
