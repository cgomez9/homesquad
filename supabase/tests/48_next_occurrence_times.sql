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
