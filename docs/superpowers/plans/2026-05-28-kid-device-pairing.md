# Kid Device Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let kids use HomeSquad on their own devices without ever putting a parent credential on the kid's phone. Parent generates a one-time code on their phone; kid app redeems it; server creates an anonymous Supabase session bound to a `kid_id` via a new `kid_devices` table.

**Architecture:** Three new Postgres tables (`kid_pairing_codes`, `kid_devices`, `pairing_redeem_attempts`) + three new RPCs (`start_device_pairing`, `redeem_device_pairing`, `revoke_kid_device`). `current_family_id()` is extended to resolve a kid session to its bound kid's family, so existing RLS policies start working for kid sessions automatically. Kid-actionable RPCs (`complete_chore`, `set_push_token`, others) are extended to accept kid-session callers. Mobile: a new pair-this-device screen on the kid side and a Devices section in parent settings.

**Tech Stack:** Supabase (Postgres + Anonymous Auth), React Native + Expo Router, expo-camera (new), Jest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-05-28-kid-device-pairing-design.md`

---

## File Structure

### New backend files
- `supabase/migrations/20260528000001_kid_devices_schema.sql` — tables + indexes + RLS for the two domain tables
- `supabase/migrations/20260528000002_pairing_redeem_attempts.sql` — rate-limit table + cleanup cron
- `supabase/migrations/20260528000003_kid_session_helpers.sql` — extend `current_family_id()`, add `current_kid_id()`
- `supabase/migrations/20260528000004_start_device_pairing_rpc.sql`
- `supabase/migrations/20260528000005_redeem_device_pairing_rpc.sql`
- `supabase/migrations/20260528000006_revoke_kid_device_rpc.sql`
- `supabase/migrations/20260528000007_complete_chore_accepts_kid_session.sql`
- `supabase/migrations/20260528000008_set_push_token_accepts_kid_session.sql`
- `supabase/tests/22_kid_devices_schema.sql`
- `supabase/tests/23_kid_session_helpers.sql`
- `supabase/tests/24_start_device_pairing_rpc.sql`
- `supabase/tests/25_redeem_device_pairing_rpc.sql`
- `supabase/tests/26_revoke_kid_device_rpc.sql`
- `supabase/tests/27_complete_chore_kid_session.sql`
- `supabase/tests/28_rls_regression_matrix.sql`

### New mobile files
- `mobile/src/lib/pairing.ts` — `startDevicePairing`, `redeemPairingCode`, `revokeKidDevice`, `signInAnonymouslyAndPair`
- `mobile/app/(pair)/_layout.tsx` — group layout for unauthenticated kid devices
- `mobile/app/(pair)/index.tsx` — Pair This Device screen
- `mobile/src/components/PairCodeInput.tsx` — 6-digit input control
- `mobile/src/components/KidDevicesList.tsx` — list with revoke per kid in parent settings
- `mobile/src/components/PairDeviceModal.tsx` — code + QR + countdown
- `mobile/src/hooks/useKidSession.ts` — resolves auth.uid → kid_devices row
- `mobile/tests/pairing.test.ts`
- `mobile/tests/pairCodeInput.test.tsx`
- `mobile/tests/kidDevicesList.test.tsx`
- `mobile/tests/pairDeviceModal.test.tsx`

### Modified mobile files
- `mobile/app/_layout.tsx` — route kid sessions to `/(app)/kid/[id]`; route unauthenticated-but-pair-capable to `/(pair)`
- `mobile/app/(app)/parent/settings.tsx` — add Devices section per kid
- `mobile/src/hooks/useFamily.ts` — accept kid sessions (currently parent-only)
- `mobile/src/lib/auth.ts` — `signOut` works for anon sessions too
- `mobile/package.json` — add `expo-camera`

---

## Task 1: Create kid_devices + kid_pairing_codes tables with RLS

**Files:**
- Create: `supabase/migrations/20260528000001_kid_devices_schema.sql`
- Test: `supabase/tests/22_kid_devices_schema.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/22_kid_devices_schema.sql
begin;
select plan(8);

select has_table('public', 'kid_pairing_codes', 'kid_pairing_codes exists');
select has_table('public', 'kid_devices',       'kid_devices exists');

select col_is_pk('public', 'kid_pairing_codes', 'code', 'kid_pairing_codes.code is PK');
select col_is_unique('public', 'kid_devices', 'user_id', 'kid_devices.user_id is unique');

-- Setup data
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

-- RLS: parent in family can see kid_devices in their family
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'TestDev');

select is(
  (select count(*) from public.kid_devices where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  1, 'parent sees kid device in their family');

-- RLS: a parent in another family cannot see this kid device
insert into auth.users(id, email) values ('33333333-3333-3333-3333-333333333333', 'other@b.test');
insert into public.families(id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '33333333-3333-3333-3333-333333333333');

set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select count(*) from public.kid_devices)::int,
  0, 'other-family parent sees no kid devices');

-- kid_pairing_codes: insert by parent
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at) values
  ('482619', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes');

select is(
  (select count(*) from public.kid_pairing_codes where code = '482619')::int,
  1, 'parent can insert pairing code in own family');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase db reset && supabase test db --file supabase/tests/22_kid_devices_schema.sql`
Expected: FAIL — `kid_pairing_codes` does not exist.

- [ ] **Step 3: Write minimal implementation**

```sql
-- supabase/migrations/20260528000001_kid_devices_schema.sql
-- Tables for kid-on-own-device pairing. See spec
-- docs/superpowers/specs/2026-05-28-kid-device-pairing-design.md

create table public.kid_pairing_codes (
  code         char(6)     primary key,
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  issued_by    uuid        not null references auth.users(id),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index kid_pairing_codes_open_idx
  on public.kid_pairing_codes (expires_at)
  where used_at is null;

create table public.kid_devices (
  id           uuid        primary key default gen_random_uuid(),
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  device_name  text        not null,
  push_token   text,
  paired_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

create index kid_devices_active_by_kid_idx
  on public.kid_devices (kid_id)
  where revoked_at is null;

alter table public.kid_pairing_codes enable row level security;
alter table public.kid_devices       enable row level security;

-- Parents in the family can see codes they (or another parent) issued.
create policy kid_pairing_codes_select_own_family
  on public.kid_pairing_codes for select
  using (family_id = public.current_family_id());

-- Parents in the family can insert codes for kids in their family.
-- (RPC is the intended path but this lets the parent app subscribe to
-- realtime inserts on the table without needing a SECURITY DEFINER read.)
create policy kid_pairing_codes_insert_own_family
  on public.kid_pairing_codes for insert
  with check (family_id = public.current_family_id());

-- Parents in the family see all paired devices in their family.
-- A kid session sees only its own row (joined via user_id = auth.uid()).
create policy kid_devices_select_own_family_or_self
  on public.kid_devices for select
  using (
    family_id = public.current_family_id()
    or user_id = auth.uid()
  );

-- Parents can update last_seen_at via the kid app's heartbeat (TODO future).
-- For now only revoke goes through the RPC, which is security definer.
-- Kid session can update its own push_token row.
create policy kid_devices_update_self
  on public.kid_devices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/22_kid_devices_schema.sql`
Expected: PASS — 8/8 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000001_kid_devices_schema.sql supabase/tests/22_kid_devices_schema.sql
git commit -m "feat(db): kid_devices + kid_pairing_codes tables with RLS"
```

---

## Task 2: pairing_redeem_attempts table + cleanup cron

**Files:**
- Create: `supabase/migrations/20260528000002_pairing_redeem_attempts.sql`

- [ ] **Step 1: Write the failing test (inline check via psql)**

This is infrastructure; the gate is "table exists and cron is scheduled." A pgTAP test isn't necessary — the next RPC tests will exercise the table.

Run the following after applying the migration:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -c "
  select count(*)::int from public.pairing_redeem_attempts;
  select schedule from cron.job where jobname = 'cleanup_pairing_redeem_attempts';
"
```
Expected after Step 3: `0` and `0 * * * *`.

- [ ] **Step 2: Confirm the table doesn't exist yet**

Run: `supabase db reset` (without the new migration in place yet — temporarily move/rename it). Then `psql ... -c "select * from public.pairing_redeem_attempts limit 1"`.
Expected: ERROR — relation does not exist.

(Skip this step if you're working forward in clean order; it's a sanity check.)

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000002_pairing_redeem_attempts.sql
-- Rate-limit attempt log for redeem_device_pairing. Read inside the RPC,
-- pruned hourly via pg_cron. Never queried from client code.

create table public.pairing_redeem_attempts (
  ip            inet        not null,
  attempted_at  timestamptz not null default now()
);

create index pairing_redeem_attempts_ip_time_idx
  on public.pairing_redeem_attempts (ip, attempted_at desc);

alter table public.pairing_redeem_attempts enable row level security;
-- No policies = no client access. RPC runs as security definer.

create or replace function public.cleanup_pairing_redeem_attempts()
returns void language sql security definer set search_path = public as $$
  delete from public.pairing_redeem_attempts
   where attempted_at < now() - interval '1 day'
$$;

revoke all on function public.cleanup_pairing_redeem_attempts() from public;
grant execute on function public.cleanup_pairing_redeem_attempts() to service_role;

select cron.schedule(
  'cleanup_pairing_redeem_attempts',
  '0 * * * *',  -- hourly on the hour
  $$ select public.cleanup_pairing_redeem_attempts() $$
);
```

- [ ] **Step 4: Run db reset and verify**

Run: `supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -c "select count(*)::int as n from public.pairing_redeem_attempts; select schedule from cron.job where jobname = 'cleanup_pairing_redeem_attempts';"`
Expected: `n=0` and `schedule=0 * * * *`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000002_pairing_redeem_attempts.sql
git commit -m "feat(db): pairing_redeem_attempts rate-limit log + hourly cleanup"
```

---

## Task 3: Extend current_family_id() + add current_kid_id()

**Files:**
- Create: `supabase/migrations/20260528000003_kid_session_helpers.sql`
- Test: `supabase/tests/23_kid_session_helpers.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/23_kid_session_helpers.sql
begin;
select plan(6);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),                       -- kid anon
  ('33333333-3333-3333-3333-333333333333', null);                       -- orphan anon

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;

-- parent session
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(public.current_family_id(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'parent resolves to own family');
select is(public.current_kid_id(),    null::uuid, 'parent has no kid_id');

-- kid session
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.current_family_id(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'kid session resolves to kid family');
select is(public.current_kid_id(),    'a2222222-2222-2222-2222-222222222222'::uuid, 'kid session resolves to kid_id');

-- orphan anon (no kid_devices row)
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(public.current_family_id(), null::uuid, 'orphan anon has no family');
select is(public.current_kid_id(),    null::uuid, 'orphan anon has no kid_id');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/23_kid_session_helpers.sql`
Expected: FAIL — kid session returns null family because the existing `current_family_id()` filters `type='parent'`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000003_kid_session_helpers.sql
-- Extend current_family_id() so kid sessions (auth.uid in kid_devices)
-- resolve to the kid's family. Add current_kid_id() for write-side checks.

create or replace function public.current_family_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select family_id from (
    select family_id, 1 as ord
      from public.profiles
      where user_id = auth.uid() and type = 'parent'
    union all
    select family_id, 2 as ord
      from public.kid_devices
      where user_id = auth.uid() and revoked_at is null
  ) s
  order by ord
  limit 1
$$;

create or replace function public.current_kid_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select kid_id from public.kid_devices
    where user_id = auth.uid() and revoked_at is null
    limit 1
$$;

comment on function public.current_kid_id is
  'Returns the kid_id for a kid-session caller (anon user bound to a kid_device), or null.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/23_kid_session_helpers.sql`
Expected: PASS — 6/6 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000003_kid_session_helpers.sql supabase/tests/23_kid_session_helpers.sql
git commit -m "feat(db): current_family_id resolves kid sessions; add current_kid_id"
```

---

## Task 4: start_device_pairing RPC

**Files:**
- Create: `supabase/migrations/20260528000004_start_device_pairing_rpc.sql`
- Test: `supabase/tests/24_start_device_pairing_rpc.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/24_start_device_pairing_rpc.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

-- Other family + kid (to test foreign kid rejection)
insert into auth.users(id, email) values ('99999999-9999-9999-9999-999999999999', 'other@b.test');
insert into public.families(id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'K2', 2, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Happy path: returns a 6-digit code and ~5min expiry, inserts the row
select lives_ok(
  $$ select public.start_device_pairing('a2222222-2222-2222-2222-222222222222') $$,
  'parent generates code for own kid'
);
select is(
  (select length(code) from public.kid_pairing_codes
     where kid_id = 'a2222222-2222-2222-2222-222222222222' order by created_at desc limit 1),
  6, 'code is 6 chars');
select is(
  (select code ~ '^[0-9]{6}$' from public.kid_pairing_codes
     where kid_id = 'a2222222-2222-2222-2222-222222222222' order by created_at desc limit 1),
  true, 'code is all digits');

-- Foreign kid rejected
prepare foreign_kid as select public.start_device_pairing('b2222222-2222-2222-2222-222222222222');
select throws_ok('foreign_kid', null, null, 'foreign-family kid rejected');

-- Non-parent caller rejected
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare other_parent as select public.start_device_pairing('a2222222-2222-2222-2222-222222222222');
select throws_ok('other_parent', null, null, 'parent in other family rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/24_start_device_pairing_rpc.sql`
Expected: FAIL — `start_device_pairing` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000004_start_device_pairing_rpc.sql
-- Parent generates a 6-digit, 5-minute, single-use code for pairing a kid device.

create or replace function public.start_device_pairing(target_kid_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
declare
  caller_family uuid;
  v_code        char(6);
  v_expires     timestamptz;
  v_kid_family  uuid;
  v_attempts    int := 0;
begin
  select family_id into caller_family
    from public.profiles
    where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select family_id into v_kid_family
    from public.profiles
    where id = target_kid_id and type = 'kid';
  if v_kid_family is null or v_kid_family <> caller_family then
    raise exception 'kid_id % not a kid in caller family', target_kid_id;
  end if;

  v_expires := now() + interval '5 minutes';

  -- Retry on collision (extremely rare with 1M codespace + few outstanding).
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at)
      values (v_code, target_kid_id, caller_family, auth.uid(), v_expires);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique pairing code after 5 attempts';
      end if;
    end;
  end loop;

  return query select v_code::text, v_expires;
end;
$$;

revoke all on function public.start_device_pairing(uuid) from public;
grant execute on function public.start_device_pairing(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/24_start_device_pairing_rpc.sql`
Expected: PASS — 5/5 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000004_start_device_pairing_rpc.sql supabase/tests/24_start_device_pairing_rpc.sql
git commit -m "feat(db): start_device_pairing RPC — 6-digit, 5-min, single-use code"
```

---

## Task 5: redeem_device_pairing RPC

**Files:**
- Create: `supabase/migrations/20260528000005_redeem_device_pairing_rpc.sql`
- Test: `supabase/tests/25_redeem_device_pairing_rpc.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/25_redeem_device_pairing_rpc.sql
begin;
select plan(7);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),  -- anon kid 1
  ('33333333-3333-3333-3333-333333333333', null),  -- anon kid 2 (for "second redeem fails")
  ('44444444-4444-4444-4444-444444444444', null);  -- anon kid 3 (for idempotent retry)

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);

-- Seed three codes: valid, expired, used
insert into public.kid_pairing_codes(code, kid_id, family_id, issued_by, expires_at, used_at) values
  ('111111', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes', null),
  ('222222', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() - interval '1 minute',  null),
  ('333333', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now() + interval '5 minutes', now());

set local role authenticated;

-- Happy path: anon kid 1 redeems 111111
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.redeem_device_pairing('111111', 'KidPhone') $$,
  'valid code redeems'
);
select is(
  (select kid_id from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'kid_devices row links anon user to kid');
select is(
  (select used_at is not null from public.kid_pairing_codes where code = '111111'),
  true, 'code marked used');

-- Idempotency: anon kid 1 redeems 111111 again => no error, no duplicate
select lives_ok(
  $$ select public.redeem_device_pairing('111111', 'KidPhone') $$,
  'idempotent retry by same anon user succeeds'
);
select is(
  (select count(*)::int from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'still exactly one device row');

-- Expired code rejected
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare expired_redeem as select public.redeem_device_pairing('222222', 'KidPhone2');
select throws_ok('expired_redeem', null, 'Invalid or expired code', 'expired code rejected with generic error');

-- Used (by different user) code rejected
prepare used_redeem as select public.redeem_device_pairing('333333', 'KidPhone3');
select throws_ok('used_redeem', null, 'Invalid or expired code', 'used code rejected with generic error');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/25_redeem_device_pairing_rpc.sql`
Expected: FAIL — `redeem_device_pairing` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000005_redeem_device_pairing_rpc.sql
-- Kid device (anonymous Supabase session) redeems a pairing code, binding
-- the auth.uid() to a kid_id via kid_devices. Single generic error on every
-- failure path. Idempotent on retry by the same auth.uid.

create or replace function public.redeem_device_pairing(
  pair_code   text,
  device_name text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_code public.kid_pairing_codes%rowtype;
  v_existing public.kid_devices%rowtype;
  v_recent_failures int;
  v_ip inet;
begin
  if auth.uid() is null then
    raise exception 'Invalid or expired code';
  end if;

  -- Rate limit: >= 10 failures in last 10 min from the caller's IP → reject.
  v_ip := nullif(current_setting('request.headers', true)::jsonb->>'x-forwarded-for','')::inet;
  if v_ip is not null then
    select count(*) into v_recent_failures
      from public.pairing_redeem_attempts
      where ip = v_ip and attempted_at > now() - interval '10 minutes';
    if v_recent_failures >= 10 then
      raise exception 'Invalid or expired code';
    end if;
  end if;

  -- Idempotency: same auth.uid already has a kid_devices row for this code?
  select kd.* into v_existing
    from public.kid_devices kd
    join public.kid_pairing_codes pc
      on pc.kid_id = kd.kid_id and pc.code = pair_code
    where kd.user_id = auth.uid()
    limit 1;
  if v_existing.id is not null then
    return v_existing.kid_id;
  end if;

  -- One auth.uid maps to at most one kid_device. Different code → reject.
  if exists (select 1 from public.kid_devices where user_id = auth.uid()) then
    if v_ip is not null then
      insert into public.pairing_redeem_attempts(ip) values (v_ip);
    end if;
    raise exception 'Invalid or expired code';
  end if;

  select * into v_code
    from public.kid_pairing_codes
    where code = pair_code
    for update;

  if v_code.code is null
     or v_code.used_at is not null
     or v_code.expires_at < now()
  then
    if v_ip is not null then
      insert into public.pairing_redeem_attempts(ip) values (v_ip);
    end if;
    raise exception 'Invalid or expired code';
  end if;

  update public.kid_pairing_codes set used_at = now() where code = v_code.code;

  insert into public.kid_devices(kid_id, family_id, user_id, device_name)
    values (v_code.kid_id, v_code.family_id, auth.uid(), device_name);

  return v_code.kid_id;
end;
$$;

revoke all on function public.redeem_device_pairing(text, text) from public;
grant execute on function public.redeem_device_pairing(text, text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/25_redeem_device_pairing_rpc.sql`
Expected: PASS — 7/7 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000005_redeem_device_pairing_rpc.sql supabase/tests/25_redeem_device_pairing_rpc.sql
git commit -m "feat(db): redeem_device_pairing RPC — anon caller, single error, idempotent"
```

---

## Task 6: revoke_kid_device RPC

**Files:**
- Create: `supabase/migrations/20260528000006_revoke_kid_device_rpc.sql`
- Test: `supabase/tests/26_revoke_kid_device_rpc.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/26_revoke_kid_device_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),  -- anon kid device
  ('99999999-9999-9999-9999-999999999999', 'other@b.test');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999');

insert into public.kid_devices(id, kid_id, family_id, user_id, device_name) values
  ('d0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;

-- Other-family parent can't revoke
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare other_revoke as select public.revoke_kid_device('d0000000-0000-0000-0000-000000000001');
select throws_ok('other_revoke', null, null, 'other-family parent cannot revoke');

-- Owning parent can revoke
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.revoke_kid_device('d0000000-0000-0000-0000-000000000001') $$,
  'owning parent revokes'
);

-- Side effect: kid_devices row is gone (cascade via auth.users delete)
select is(
  (select count(*)::int from public.kid_devices where id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'kid_devices row removed by cascade');
-- Side effect: auth.users row is gone
select is(
  (select count(*)::int from auth.users where id = '22222222-2222-2222-2222-222222222222'),
  0, 'anon auth.users row deleted');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/26_revoke_kid_device_rpc.sql`
Expected: FAIL — `revoke_kid_device` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000006_revoke_kid_device_rpc.sql
-- Parent unpairs a kid device. Deletes the auth.users row, which cascades
-- to kid_devices. Refresh tokens for that user become invalid immediately.

create or replace function public.revoke_kid_device(device_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  caller_family uuid;
  v_user_id     uuid;
begin
  select family_id into caller_family
    from public.profiles
    where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select user_id into v_user_id
    from public.kid_devices
    where id = device_id and family_id = caller_family;
  if v_user_id is null then
    raise exception 'device_id % not in caller family', device_id;
  end if;

  delete from auth.users where id = v_user_id;
  -- kid_devices row removed by FK cascade on user_id.
end;
$$;

revoke all on function public.revoke_kid_device(uuid) from public;
grant execute on function public.revoke_kid_device(uuid) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/26_revoke_kid_device_rpc.sql`
Expected: PASS — 4/4 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000006_revoke_kid_device_rpc.sql supabase/tests/26_revoke_kid_device_rpc.sql
git commit -m "feat(db): revoke_kid_device RPC — deletes anon user, cascades device row"
```

---

## Task 7: Extend complete_chore to accept kid sessions

**Files:**
- Create: `supabase/migrations/20260528000007_complete_chore_accepts_kid_session.sql`
- Test: `supabase/tests/27_complete_chore_kid_session.sql`

**Background:** `complete_chore` currently checks `where user_id = auth.uid() and type = 'parent'`. Kids on a parent's device act under the parent's session (existing PIN model). For kid-on-own-device, the caller is a kid session — `auth.uid()` resolves via `kid_devices`, not `profiles`. The RPC must accept both.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/27_complete_chore_kid_session.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);  -- kid anon

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P',    1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Luna', 2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Theo', 3, null);

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'LunaPhone');

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Brush teeth', 5, 'auto', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now()),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now());

set local role authenticated;

-- Kid session completes a chore assigned to themselves: OK
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.complete_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid session completes own chore'
);
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'approved', 'auto chore status approved');

-- Kid session cannot complete chore as a sibling
prepare as_sibling as select public.complete_chore('11111111-bbbb-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333');
select throws_ok('as_sibling', null, null, 'kid session rejected when acting as sibling');

-- Parent session still works (regression check)
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.complete_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'parent session still works');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/27_complete_chore_kid_session.sql`
Expected: FAIL — kid session call raises "caller is not a parent".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000007_complete_chore_accepts_kid_session.sql
-- complete_chore now accepts kid-session callers in addition to parent
-- callers. Kid callers may only act as themselves (kid_profile_id must
-- equal current_kid_id()). Otherwise the body is unchanged from the
-- 2026-05-18 redefinition.

create or replace function public.complete_chore(
  instance_id     uuid,
  kid_profile_id  uuid,
  photo_url       text default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family   uuid;
  caller_kid_id   uuid;
  inst            public.chore_instances%rowtype;
  chore_mode      text;
  kid_family      uuid;
  kid_type        text;
begin
  -- Resolve caller. Accept parent OR kid session.
  caller_family := public.current_family_id();
  caller_kid_id := public.current_kid_id();
  if caller_family is null then
    raise exception 'caller is not authenticated to any family';
  end if;
  if caller_kid_id is not null and caller_kid_id <> kid_profile_id then
    raise exception 'kid session may only act as itself';
  end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status not in ('pending','rejected') then
    raise exception 'instance % cannot be completed (status=%)', instance_id, inst.status;
  end if;

  select profiles.family_id, profiles.type into kid_family, kid_type
    from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in caller family', kid_profile_id;
  end if;

  if inst.assignee_profile_id is not null and inst.assignee_profile_id <> kid_profile_id then
    raise exception 'kid_profile_id % is not the assignee of instance %', kid_profile_id, instance_id;
  end if;

  select c.verification_mode into chore_mode from public.chores c where c.id = inst.chore_id;

  if chore_mode = 'auto' then
    update public.chore_instances
      set status = 'approved', completed_by = kid_profile_id, completed_at = now(),
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  elsif chore_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now(),
          photo_url = complete_chore.photo_url,
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  elsif chore_mode = 'approval' then
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now(),
          rejection_reason = null, approved_by = null, approved_at = null
      where id = instance_id;
  else
    raise exception 'unknown verification_mode: %', chore_mode;
  end if;
end;
$$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/27_complete_chore_kid_session.sql`
Also run the existing regression: `supabase test db --file supabase/tests/11_complete_chore_rpc.sql`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000007_complete_chore_accepts_kid_session.sql supabase/tests/27_complete_chore_kid_session.sql
git commit -m "feat(db): complete_chore accepts kid-session callers, gated on current_kid_id"
```

---

## Task 8: set_push_token accepts kid sessions (write to kid_devices)

**Files:**
- Create: `supabase/migrations/20260528000008_set_push_token_accepts_kid_session.sql`

- [ ] **Step 1: Write the failing test**

Add a section to `supabase/tests/27_complete_chore_kid_session.sql` or create a new file. For brevity, inline check:

```sql
-- Append to a new file: supabase/tests/27b_set_push_token_kid_session.sql
begin;
select plan(2);

insert into auth.users(id, email) values
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.set_push_token('ExpoPushToken[abc]') $$,
  'kid session writes push token');
select is(
  (select push_token from public.kid_devices where user_id = '22222222-2222-2222-2222-222222222222'),
  'ExpoPushToken[abc]',
  'token landed on kid_devices');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db --file supabase/tests/27b_set_push_token_kid_session.sql`
Expected: FAIL — `set_push_token` finds no profile for caller and raises.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528000008_set_push_token_accepts_kid_session.sql
-- set_push_token writes to kid_devices for kid sessions, profiles for parent
-- sessions. Caller picks by which path resolves auth.uid() first.

create or replace function public.set_push_token(token text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_device  uuid;
begin
  select id into caller_profile from public.profiles where user_id = auth.uid();
  if caller_profile is not null then
    update public.profiles set push_token = token where id = caller_profile;
    return;
  end if;

  select id into caller_device from public.kid_devices where user_id = auth.uid() and revoked_at is null;
  if caller_device is not null then
    update public.kid_devices set push_token = token, last_seen_at = now() where id = caller_device;
    return;
  end if;

  raise exception 'no profile or device for caller';
end;
$$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db --file supabase/tests/27b_set_push_token_kid_session.sql`
Expected: PASS — 2/2 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528000008_set_push_token_accepts_kid_session.sql supabase/tests/27b_set_push_token_kid_session.sql
git commit -m "feat(db): set_push_token writes to kid_devices for kid sessions"
```

---

## Task 9: Audit + extend other kid-actionable RPCs

**Files:**
- Investigation only; produces zero-N additional migrations + tests.

This task is an audit, not a fixed change. The kid app reads/writes a small set of data. Walk through every RPC the kid screens currently call and decide:
- Already works for kid sessions? (RLS-only reads, no auth.uid checks)
- Needs the same treatment as `complete_chore`? (extend to accept kid caller, gate write on `current_kid_id`)
- Truly parent-only? (leave alone)

- [ ] **Step 1: Enumerate kid-callable RPCs**

```bash
grep -rE "supabase\.rpc\(" mobile/app/\(app\)/kid mobile/src/lib mobile/src/components | grep -v test
```

Expected to surface (minimum): `complete_chore` (handled in Task 7), `set_push_token` (Task 8), `redeem_reward` or similar reward-claim RPC, `mark_celebrations_seen` / cursor RPC, `get_leaderboard` (read-only — RLS handles).

- [ ] **Step 2: For each surfaced RPC, write a failing test like Task 7**

For each RPC that fails when called from a kid session, mirror the Task 7 pattern: kid session test → migration that resolves the caller via both paths → kid acting as self only.

- [ ] **Step 3: Implement each migration**

One migration per RPC, each named `20260528000009_<rpc_name>_accepts_kid_session.sql`, `…000010_…`, etc.

- [ ] **Step 4: Run the full test suite**

Run: `supabase db reset && supabase test db`
Expected: every existing test plus the new ones pass.

- [ ] **Step 5: Commit each migration separately**

```bash
# repeat per RPC fixed
git add supabase/migrations/<file> supabase/tests/<file>
git commit -m "feat(db): <rpc_name> accepts kid-session callers"
```

---

## Task 10: RLS regression matrix

**Files:**
- Create: `supabase/tests/28_rls_regression_matrix.sql`

This is one consolidated test that exercises every existing policy against (parent session, kid session, no session). It is the gate that says "we did not break existing RLS while extending it."

- [ ] **Step 1: Enumerate policies**

```bash
grep -REn "create policy" supabase/migrations | wc -l
```
Note the count for the test plan.

- [ ] **Step 2: Write the test**

```sql
-- supabase/tests/28_rls_regression_matrix.sql
-- Exercises every existing policy against three session shapes:
--   1) parent session in family A
--   2) kid session bound to kid X in family A
--   3) parent session in family B
--   4) anonymous session not bound to any kid_device
-- Each row of the matrix asserts the expected SELECT count or write outcome.

begin;
select plan(/* fill with policy count × 4 once enumerated */ 32);

-- Setup: families A and B, parent + 2 kids each, one paired kid device in A
-- (data setup omitted here for brevity — copy from Task 7 + add family B mirror)

-- ... assertions per policy
-- Example pattern for SELECT policies:
set local "request.jwt.claims" to '{"sub":"<parent-A-uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chores),
  /* expected: family A chore count */ 1,
  'parent A sees A chores');

set local "request.jwt.claims" to '{"sub":"<kid-A-anon-uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chores),
  /* expected: family A chore count */ 1,
  'kid A sees A chores');

set local "request.jwt.claims" to '{"sub":"<parent-B-uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chores),
  /* expected: family B chore count */ 0,
  'parent B sees no A chores');

set local "request.jwt.claims" to '{"sub":"<orphan-anon-uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chores),
  0,
  'orphan anon sees no chores');

-- ... repeat across all tables/policies

select * from finish();
rollback;
```

The actual contents are mechanical and dependent on the policy count from Step 1. Build the test file iteratively: add a section per policy, run after each addition.

- [ ] **Step 3: Run the test**

Run: `supabase test db --file supabase/tests/28_rls_regression_matrix.sql`
Expected: PASS — every assertion green. Any failure points to a policy that doesn't behave as the spec promises; either fix the policy or fix the expectation.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/28_rls_regression_matrix.sql
git commit -m "test(db): RLS regression matrix — every policy × (parent | kid | orphan) session"
```

---

## Task 11: Enable Anonymous Auth in Supabase config

**Files:**
- Modify: `supabase/config.toml`
- Cloud: Supabase dashboard manual step (documented in commit message)

- [ ] **Step 1: Update local config**

Open `supabase/config.toml` and find the `[auth]` block. Add or set:

```toml
[auth]
enable_anonymous_sign_ins = true
```

- [ ] **Step 2: Apply locally**

Run: `supabase stop && supabase start`
Expected: anonymous auth enabled in the local stack.

- [ ] **Step 3: Verify**

```bash
curl -X POST "$(supabase status -o env | grep API_URL | cut -d= -f2)/auth/v1/signup" \
  -H "apikey: $(supabase status -o env | grep ANON_KEY | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"is_anonymous": true}'
```
Expected: 200 with a session payload.

- [ ] **Step 4: Cloud step (manual, document in commit)**

In the Supabase cloud dashboard for the HomeSquad project: Authentication → Providers → Anonymous Sign-Ins → enable. (No code; record the action in the commit message.)

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml
git commit -m "feat(auth): enable Supabase anonymous sign-in (local config + cloud dashboard toggled)"
```

---

## Task 12: Add expo-camera dependency

**Files:**
- Modify: `mobile/package.json`, `mobile/app.json`

- [ ] **Step 1: Install**

```bash
cd mobile
npx expo install expo-camera
```

- [ ] **Step 2: Register plugin in app.json**

In `mobile/app.json`, add `expo-camera` to the `plugins` array with the camera-permission text:

```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  "expo-audio",
  "expo-apple-authentication",
  [
    "@react-native-google-signin/google-signin",
    { "iosUrlScheme": "com.googleusercontent.apps.000000000000-placeholder" }
  ],
  "expo-localization",
  [
    "expo-camera",
    {
      "cameraPermission": "HomeSquad uses the camera to scan a pairing code from a parent's phone.",
      "recordAudioAndroid": false
    }
  ]
]
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run existing tests (regression)**

Run: `cd mobile && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json
git commit -m "chore(mobile): add expo-camera for kid-device pairing QR scanner"
```

---

## Task 13: pairing.ts library — startDevicePairing, redeemPairingCode, revokeKidDevice, signInAnonymouslyAndPair

**Files:**
- Create: `mobile/src/lib/pairing.ts`
- Test: `mobile/tests/pairing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/pairing.test.ts
import {
  startDevicePairing,
  redeemPairingCode,
  revokeKidDevice,
  signInAnonymouslyAndPair,
} from '../src/lib/pairing';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { signInAnonymously: jest.fn() },
    rpc: jest.fn(),
  },
}));
jest.mock('expo-device', () => ({ deviceName: 'TestDevice' }));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => jest.clearAllMocks());

describe('startDevicePairing', () => {
  it('calls rpc(start_device_pairing) with kid_id and returns code + expiry', async () => {
    mockedRpc.mockResolvedValue({ data: [{ code: '482619', expires_at: '2026-05-28T12:05:00Z' }], error: null } as any);
    const result = await startDevicePairing('kid-uuid-1');
    expect(mockedRpc).toHaveBeenCalledWith('start_device_pairing', { target_kid_id: 'kid-uuid-1' });
    expect(result).toEqual({ code: '482619', expiresAt: new Date('2026-05-28T12:05:00Z') });
  });

  it('throws when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'nope' } } as any);
    await expect(startDevicePairing('x')).rejects.toThrow('nope');
  });
});

describe('redeemPairingCode', () => {
  it('passes code + device name to rpc(redeem_device_pairing)', async () => {
    mockedRpc.mockResolvedValue({ data: 'kid-uuid-1', error: null } as any);
    const kidId = await redeemPairingCode('482619');
    expect(mockedRpc).toHaveBeenCalledWith('redeem_device_pairing', {
      pair_code: '482619',
      device_name: 'TestDevice',
    });
    expect(kidId).toBe('kid-uuid-1');
  });

  it('throws the generic error when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'Invalid or expired code' } } as any);
    await expect(redeemPairingCode('000000')).rejects.toThrow('Invalid or expired code');
  });
});

describe('revokeKidDevice', () => {
  it('calls rpc(revoke_kid_device) with device id', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await revokeKidDevice('dev-uuid-1');
    expect(mockedRpc).toHaveBeenCalledWith('revoke_kid_device', { device_id: 'dev-uuid-1' });
  });
});

describe('signInAnonymouslyAndPair', () => {
  it('signs in anonymously then redeems', async () => {
    mockedAuth.signInAnonymously.mockResolvedValue({ data: { session: {} }, error: null } as any);
    mockedRpc.mockResolvedValue({ data: 'kid-uuid-1', error: null } as any);
    const kidId = await signInAnonymouslyAndPair('482619');
    expect(mockedAuth.signInAnonymously).toHaveBeenCalled();
    expect(mockedRpc).toHaveBeenCalledWith('redeem_device_pairing', { pair_code: '482619', device_name: 'TestDevice' });
    expect(kidId).toBe('kid-uuid-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest tests/pairing.test.ts`
Expected: FAIL — `src/lib/pairing.ts` does not exist.

- [ ] **Step 3: Write the library**

```typescript
// mobile/src/lib/pairing.ts
import * as Device from 'expo-device';
import { supabase } from './supabase';

export type PairingCode = { code: string; expiresAt: Date };

export async function startDevicePairing(kidId: string): Promise<PairingCode> {
  const { data, error } = await supabase.rpc('start_device_pairing', { target_kid_id: kidId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { code: row.code, expiresAt: new Date(row.expires_at) };
}

export async function redeemPairingCode(code: string): Promise<string> {
  const deviceName = Device.deviceName ?? 'Kid device';
  const { data, error } = await supabase.rpc('redeem_device_pairing', {
    pair_code: code,
    device_name: deviceName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function revokeKidDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_kid_device', { device_id: deviceId });
  if (error) throw new Error(error.message);
}

export async function signInAnonymouslyAndPair(code: string): Promise<string> {
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw new Error(signInError.message);
  return redeemPairingCode(code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest tests/pairing.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/pairing.ts mobile/tests/pairing.test.ts
git commit -m "feat(mobile): pairing.ts — start, redeem, revoke, and anon-sign-in helpers"
```

---

## Task 14: PairCodeInput component (6-digit boxed input)

**Files:**
- Create: `mobile/src/components/PairCodeInput.tsx`
- Test: `mobile/tests/pairCodeInput.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/pairCodeInput.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PairCodeInput } from '../src/components/PairCodeInput';

describe('PairCodeInput', () => {
  it('renders 6 boxes', () => {
    const { getAllByTestId } = render(<PairCodeInput value="" onChange={() => {}} />);
    expect(getAllByTestId('pair-digit')).toHaveLength(6);
  });

  it('calls onChange with concatenated digits as user types', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={onChange} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), '4');
    expect(onChange).toHaveBeenLastCalledWith('4');
    fireEvent.changeText(getByTestId('pair-hidden-input'), '48');
    expect(onChange).toHaveBeenLastCalledWith('48');
  });

  it('strips non-digits and caps at 6 chars', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={onChange} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), 'abc1234567');
    expect(onChange).toHaveBeenLastCalledWith('123456');
  });

  it('calls onSubmit when 6 digits entered', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), '482619');
    expect(onSubmit).toHaveBeenCalledWith('482619');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest tests/pairCodeInput.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

```typescript
// mobile/src/components/PairCodeInput.tsx
import { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme, type Palette, radii, spacing, typography } from '../theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: (code: string) => void;
};

export function PairCodeInput({ value, onChange, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const inputRef = useRef<TextInput>(null);

  function handleChange(next: string) {
    const cleaned = next.replace(/\D/g, '').slice(0, 6);
    onChange(cleaned);
    if (cleaned.length === 6 && onSubmit) onSubmit(cleaned);
  }

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} testID="pair-digit" style={[styles.box, value.length === i && styles.boxActive]}>
            <Text style={styles.digit}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        testID="pair-hidden-input"
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={styles.hidden}
      />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
    box: {
      width: 44,
      height: 56,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxActive: { borderColor: colors.primary },
    digit: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest tests/pairCodeInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/PairCodeInput.tsx mobile/tests/pairCodeInput.test.tsx
git commit -m "feat(mobile): PairCodeInput — 6-digit boxed numeric input"
```

---

## Task 15: PairThisDevice screen (kid side)

**Files:**
- Create: `mobile/app/(pair)/_layout.tsx`
- Create: `mobile/app/(pair)/index.tsx`

- [ ] **Step 1: Write the layout (no test — pure routing wrapper)**

```typescript
// mobile/app/(pair)/_layout.tsx
import { Slot } from 'expo-router';
export default function PairLayout() {
  return <Slot />;
}
```

- [ ] **Step 2: Write the screen**

```typescript
// mobile/app/(pair)/index.tsx
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { PairCodeInput } from '../../src/components/PairCodeInput';
import { signInAnonymouslyAndPair } from '../../src/lib/pairing';
import { TidePoolBackground } from '../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography, radii } from '../../src/theme';

export default function PairThisDevice() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedOnce, setScannedOnce] = useState(false);

  async function submitCode(pairCode: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const kidId = await signInAnonymouslyAndPair(pairCode);
      router.replace(`/(app)/kid/${kidId}` as never);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code. Ask a parent for a new one.');
      setCode('');
      setScannedOnce(false);
      setSubmitting(false);
    }
  }

  function onBarCodeScanned({ data }: { data: string }) {
    if (scannedOnce) return;
    const cleaned = data.replace(/\D/g, '');
    if (cleaned.length === 6) {
      setScannedOnce(true);
      setCode(cleaned);
      submitCode(cleaned);
    }
  }

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <View style={styles.content}>
        <Text style={styles.title}>Pair this device</Text>
        <Text style={styles.subtitle}>Ask a parent to open Settings → Kids → Pair a device.</Text>

        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={submitting ? undefined : onBarCodeScanned}
          />
        ) : (
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Enable camera to scan</Text>
          </Pressable>
        )}

        <View style={styles.divider}>
          <Text style={styles.dividerText}>or type the code</Text>
        </View>

        <PairCodeInput value={code} onChange={setCode} onSubmit={submitCode} />

        {submitting && <ActivityIndicator color={colors.primary} style={styles.spinner} />}
        {error && <Text style={styles.err}>{error}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: Platform.OS === 'android' ? 80 : 60,
      gap: spacing.lg,
    },
    title: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    subtitle: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },
    camera: { height: 240, borderRadius: radii.lg, overflow: 'hidden', marginTop: spacing.md },
    permBtn: {
      height: 240,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    permBtnText: { fontFamily: typography.fontFamilySemi, color: colors.primary },
    divider: { alignItems: 'center', marginTop: spacing.md },
    dividerText: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.tiny, letterSpacing: 1.4, textTransform: 'uppercase' },
    spinner: { marginTop: spacing.md },
    err: { color: colors.error, fontFamily: typography.fontFamilySemi, textAlign: 'center', marginTop: spacing.md },
  });
```

- [ ] **Step 3: Manual smoke (no automated test for the screen — covered by integration test in Task 21)**

Boot the app on an emulator with no auth. App should land on the pair screen (after Task 16 wires routing). For now, navigate to `/(pair)` manually via `router.push('/(pair)')` in a debug hook to eyeball it.

- [ ] **Step 4: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(pair\)/_layout.tsx mobile/app/\(pair\)/index.tsx
git commit -m "feat(mobile): pair-this-device screen — QR scanner + 6-digit fallback"
```

---

## Task 16: Root layout — route kid sessions and pair-pending devices

**Files:**
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/src/hooks/useFamily.ts`
- Create: `mobile/src/hooks/useKidSession.ts`

**Goal:** A device whose Supabase session has a matching `kid_devices` row routes straight to `/(app)/kid/[kid_id]`. A device with an authenticated session but no matching row (orphan anon or never-paired) routes to `/(pair)`. Parent sessions behave as today.

- [ ] **Step 1: Create useKidSession hook**

```typescript
// mobile/src/hooks/useKidSession.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type KidSessionState =
  | { status: 'loading' }
  | { status: 'not-kid' }
  | { status: 'kid'; kidId: string; familyId: string; deviceId: string };

export function useKidSession(userId: string | undefined): KidSessionState {
  const [state, setState] = useState<KidSessionState>({ status: 'loading' });

  useEffect(() => {
    if (!userId) {
      setState({ status: 'not-kid' });
      return;
    }
    let cancelled = false;

    supabase
      .from('kid_devices')
      .select('id, kid_id, family_id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({ status: 'not-kid' });
          return;
        }
        setState({ status: 'kid', kidId: data.kid_id, familyId: data.family_id, deviceId: data.id });
      });

    return () => { cancelled = true; };
  }, [userId]);

  return state;
}
```

- [ ] **Step 2: Update useFamily to handle kid sessions**

`useFamily` currently filters profiles by `type='parent'`. For kid sessions there is no `profiles` row keyed to `auth.uid()`. Compose it with `useKidSession`:

```typescript
// mobile/src/hooks/useFamily.ts — full replacement
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useKidSession } from './useKidSession';

type FamilyState =
  | { status: 'loading' }
  | { status: 'no-family' }
  | { status: 'has-family'; familyId: string };

const refetchListeners = new Set<() => void>();
export function refetchFamily() { refetchListeners.forEach((fn) => fn()); }

export function useFamily(userId: string | undefined): FamilyState {
  const [state, setState] = useState<FamilyState>({ status: 'loading' });
  const [refetchToken, setRefetchToken] = useState(0);
  const kidSession = useKidSession(userId);

  useEffect(() => {
    const bump = () => setRefetchToken((t) => t + 1);
    refetchListeners.add(bump);
    return () => { refetchListeners.delete(bump); };
  }, []);

  useEffect(() => {
    if (!userId) { setState({ status: 'no-family' }); return; }

    // Kid session shortcut — family comes from kid_devices.
    if (kidSession.status === 'kid') {
      setState({ status: 'has-family', familyId: kidSession.familyId });
      return;
    }
    if (kidSession.status === 'loading') {
      setState({ status: 'loading' });
      return;
    }

    let cancelled = false;
    supabase
      .from('profiles')
      .select('family_id')
      .eq('user_id', userId)
      .eq('type', 'parent')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('useFamily error', error); setState({ status: 'no-family' }); return; }
        setState(data ? { status: 'has-family', familyId: data.family_id } : { status: 'no-family' });
      });
    return () => { cancelled = true; };
  }, [userId, refetchToken, kidSession]);

  return state;
}
```

- [ ] **Step 3: Update root layout routing**

In `mobile/app/_layout.tsx`, replace the routing effect:

```typescript
// excerpt: routing effect inside RootLayout
const kidSession = useKidSession(userId);

useEffect(() => {
  if (auth.status === 'loading') return;
  if (auth.status === 'authenticated' && (kidSession.status === 'loading' || family.status === 'loading')) return;

  const inAuthGroup       = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === '(onboarding)';
  const inPairGroup       = segments[0] === '(pair)';
  const inAppGroup        = segments[0] === '(app)';

  // Unauthenticated → login (existing behavior).
  if (auth.status === 'unauthenticated') {
    if (!inAuthGroup) router.replace('/(auth)/login');
    return;
  }

  // Authenticated anon with no kid_device row → pair screen.
  if (kidSession.status === 'not-kid' && family.status === 'no-family') {
    // distinguish: parent who hasn't created family yet vs orphan anon.
    // Orphan anon = no profile row at all. Cheap check: if session.user.is_anonymous → pair group.
    const isAnon = !!(auth.status === 'authenticated' && auth.session.user.is_anonymous);
    if (isAnon) {
      if (!inPairGroup) router.replace('/(pair)');
      return;
    }
    if (!inOnboardingGroup) router.replace('/(onboarding)/welcome');
    return;
  }

  // Kid session → land on kid mode for the bound kid.
  if (kidSession.status === 'kid') {
    if (!inAppGroup) router.replace(`/(app)/kid/${kidSession.kidId}` as never);
    return;
  }

  // Parent with family in auth group → bounce to app (existing behavior).
  if (family.status === 'has-family' && inAuthGroup) {
    router.replace('/(app)');
  }
}, [auth, kidSession, family, segments]);
```

Also import `useKidSession` at the top.

- [ ] **Step 4: Type check + smoke**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: green.

Manual: launch app fresh (no session) → login screen. Sign in as parent → existing flow. (Kid flow exercised in Task 21.)

- [ ] **Step 5: Commit**

```bash
git add mobile/app/_layout.tsx mobile/src/hooks/useFamily.ts mobile/src/hooks/useKidSession.ts
git commit -m "feat(mobile): root routing — kid session → /(app)/kid/[id]; orphan anon → /(pair)"
```

---

## Task 17: KidDevicesList component for parent settings

**Files:**
- Create: `mobile/src/components/KidDevicesList.tsx`
- Test: `mobile/tests/kidDevicesList.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/kidDevicesList.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { KidDevicesList } from '../src/components/KidDevicesList';
import { revokeKidDevice } from '../src/lib/pairing';

jest.mock('../src/lib/pairing', () => ({ revokeKidDevice: jest.fn().mockResolvedValue(undefined) }));

const devices = [
  { id: 'd1', device_name: "Luna's iPad", last_seen_at: '2026-05-28T10:00:00Z' },
  { id: 'd2', device_name: "Luna's Phone", last_seen_at: '2026-05-28T09:00:00Z' },
];

describe('KidDevicesList', () => {
  it('renders one row per device', () => {
    const { getByText } = render(<KidDevicesList kidId="k1" devices={devices} onPair={() => {}} onChanged={() => {}} />);
    expect(getByText("Luna's iPad")).toBeTruthy();
    expect(getByText("Luna's Phone")).toBeTruthy();
  });

  it('calls onPair when "Pair a new device" pressed', () => {
    const onPair = jest.fn();
    const { getByText } = render(<KidDevicesList kidId="k1" devices={[]} onPair={onPair} onChanged={() => {}} />);
    fireEvent.press(getByText(/pair a new device/i));
    expect(onPair).toHaveBeenCalledWith('k1');
  });

  it('confirms then calls revokeKidDevice', async () => {
    const onChanged = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { getByTestId } = render(<KidDevicesList kidId="k1" devices={devices} onPair={() => {}} onChanged={onChanged} />);
    fireEvent.press(getByTestId('revoke-d1'));
    expect(Alert.alert).toHaveBeenCalled();
    await Promise.resolve();
    expect(revokeKidDevice).toHaveBeenCalledWith('d1');
    expect(onChanged).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest tests/kidDevicesList.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

```typescript
// mobile/src/components/KidDevicesList.tsx
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';
import { revokeKidDevice } from '../lib/pairing';

export type KidDevice = { id: string; device_name: string; last_seen_at: string };

type Props = {
  kidId: string;
  devices: KidDevice[];
  onPair: (kidId: string) => void;
  onChanged: () => void;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function KidDevicesList({ kidId, devices, onPair, onChanged }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function confirmRevoke(d: KidDevice) {
    Alert.alert(
      'Unpair this device?',
      `${d.device_name} will be signed out and need a new code to use HomeSquad again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeKidDevice(d.id);
              onChanged();
            } catch (e) {
              Alert.alert('Could not unpair', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Devices</Text>
      {devices.length === 0 && <Text style={styles.empty}>No devices paired yet.</Text>}
      {devices.map((d) => (
        <View key={d.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{d.device_name}</Text>
            <Text style={styles.meta}>Last seen {formatRelative(d.last_seen_at)}</Text>
          </View>
          <Pressable testID={`revoke-${d.id}`} onPress={() => confirmRevoke(d)} style={styles.revokeBtn}>
            <Text style={styles.revokeText}>Unpair</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onPair(kidId)} style={styles.pairBtn}>
        <Text style={styles.pairBtnText}>+ Pair a new device</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, gap: spacing.sm },
    label: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      color: colors.textMuted,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    empty: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.body },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    name: { fontFamily: typography.fontFamilyBold, color: colors.text, fontSize: typography.body },
    meta: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.tiny, marginTop: 2 },
    revokeBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.bg },
    revokeText: { fontFamily: typography.fontFamilyBold, color: colors.error, fontSize: typography.tiny },
    pairBtn: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
    pairBtnText: { fontFamily: typography.fontFamilyBold, color: colors.primary, fontSize: typography.body },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest tests/kidDevicesList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/KidDevicesList.tsx mobile/tests/kidDevicesList.test.tsx
git commit -m "feat(mobile): KidDevicesList — per-kid device list with revoke action"
```

---

## Task 18: PairDeviceModal — code display, QR, countdown, realtime auto-dismiss

**Files:**
- Create: `mobile/src/components/PairDeviceModal.tsx`
- Test: `mobile/tests/pairDeviceModal.test.tsx`

- [ ] **Step 1: Add the QR rendering dependency**

```bash
cd mobile && npx expo install react-native-svg
# QR rendering — pick the maintained library:
npm install react-native-qrcode-svg
```

Verify in `package.json`. Commit at end of task with the modal.

- [ ] **Step 2: Write the failing test**

```typescript
// mobile/tests/pairDeviceModal.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PairDeviceModal } from '../src/components/PairDeviceModal';
import { startDevicePairing } from '../src/lib/pairing';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/pairing', () => ({ startDevicePairing: jest.fn() }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  },
}));

describe('PairDeviceModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a code on open and shows it', async () => {
    (startDevicePairing as jest.Mock).mockResolvedValue({
      code: '482619',
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    const { findByText } = render(<PairDeviceModal kidId="k1" visible onClose={() => {}} onPaired={() => {}} />);
    expect(await findByText(/482619/)).toBeTruthy();
  });

  it('calls onPaired when realtime payload arrives', async () => {
    (startDevicePairing as jest.Mock).mockResolvedValue({
      code: '482619',
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    let captured: ((p: any) => void) | undefined;
    (supabase.channel as jest.Mock).mockReturnValue({
      on: jest.fn((_e, _f, cb) => { captured = cb; return { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }; }),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    });
    const onPaired = jest.fn();
    render(<PairDeviceModal kidId="k1" visible onClose={() => {}} onPaired={onPaired} />);
    await waitFor(() => expect(captured).toBeDefined());
    captured!({ new: { kid_id: 'k1', device_name: 'KidPhone' } });
    expect(onPaired).toHaveBeenCalledWith({ kid_id: 'k1', device_name: 'KidPhone' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest tests/pairDeviceModal.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Write the component**

```typescript
// mobile/src/components/PairDeviceModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { startDevicePairing } from '../lib/pairing';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';

type PairedPayload = { kid_id: string; device_name: string };

type Props = {
  kidId: string;
  visible: boolean;
  onClose: () => void;
  onPaired: (payload: PairedPayload) => void;
};

export function PairDeviceModal({ kidId, visible, onClose, onPaired }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setCode(null); setExpiresAt(null); return; }
    let cancelled = false;
    startDevicePairing(kidId)
      .then((res) => { if (!cancelled) { setCode(res.code); setExpiresAt(res.expiresAt); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to generate code'); });
    return () => { cancelled = true; };
  }, [visible, kidId]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const channel = supabase
      .channel(`pair-watch-${kidId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kid_devices', filter: `kid_id=eq.${kidId}` },
        (payload: { new: PairedPayload }) => onPaired(payload.new),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, kidId, onPaired]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0;
  const mm = Math.floor(remainingMs / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000).toString().padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.card}>
          <Text style={styles.title}>Pair this kid's device</Text>
          {!code && !error && <ActivityIndicator color={colors.primary} />}
          {code && (
            <>
              <QRCode value={code} size={180} backgroundColor="transparent" />
              <Text style={styles.code}>{code.slice(0, 3)}  {code.slice(3)}</Text>
              <Text style={styles.timer}>{remainingMs > 0 ? `Code expires in ${mm}:${ss}` : 'Code expired'}</Text>
            </>
          )}
          {error && <Text style={styles.err}>{error}</Text>}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bg: { flex: 1, backgroundColor: 'rgba(6,40,38,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, alignItems: 'center', gap: spacing.lg, minWidth: 300 },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2 - 4, color: colors.text },
    code: { fontFamily: typography.fontFamilyBold, fontSize: 36, letterSpacing: 4, color: colors.text },
    timer: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.body },
    err: { color: colors.error, fontFamily: typography.fontFamilySemi, textAlign: 'center' },
    cancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.bg },
    cancelText: { fontFamily: typography.fontFamilyBold, color: colors.text },
  });
```

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `cd mobile && npx jest tests/pairDeviceModal.test.tsx`
Expected: PASS.

```bash
git add mobile/src/components/PairDeviceModal.tsx mobile/tests/pairDeviceModal.test.tsx mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): PairDeviceModal — code/QR/countdown + realtime auto-dismiss"
```

---

## Task 19: Wire Devices section into parent Settings

**Files:**
- Modify: `mobile/app/(app)/parent/settings.tsx`

- [ ] **Step 1: Read the current Kids section in settings.tsx to find the insertion point**

```bash
grep -n "kids" mobile/app/\(app\)/parent/settings.tsx
```

Identify where kids are listed. The Devices subsection lives inside each kid's row (or under each kid block).

- [ ] **Step 2: Add device-list query and pair-modal state**

In `Settings` component (`mobile/app/(app)/parent/settings.tsx`):

```typescript
// near the other useQuery calls
const { data: kidDevicesMap, refetch: refetchDevices } = useQuery({
  queryKey: ['kid-devices'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('kid_devices')
      .select('id, kid_id, device_name, last_seen_at')
      .is('revoked_at', null);
    if (error) throw error;
    const byKid = new Map<string, { id: string; device_name: string; last_seen_at: string }[]>();
    for (const row of data ?? []) {
      const arr = byKid.get(row.kid_id) ?? [];
      arr.push({ id: row.id, device_name: row.device_name, last_seen_at: row.last_seen_at });
      byKid.set(row.kid_id, arr);
    }
    return byKid;
  },
});

// state for the pair modal
const [pairKidId, setPairKidId] = useState<string | null>(null);
```

In the kids-list render block, below each kid row, render:

```tsx
import { KidDevicesList } from '../../../src/components/KidDevicesList';
import { PairDeviceModal } from '../../../src/components/PairDeviceModal';

// inside the kids map:
<KidDevicesList
  kidId={kid.id}
  devices={kidDevicesMap?.get(kid.id) ?? []}
  onPair={(id) => setPairKidId(id)}
  onChanged={() => refetchDevices()}
/>
```

At the screen root, render the modal:

```tsx
{pairKidId && (
  <PairDeviceModal
    visible
    kidId={pairKidId}
    onClose={() => setPairKidId(null)}
    onPaired={() => { setPairKidId(null); refetchDevices(); }}
  />
)}
```

- [ ] **Step 3: Type check + run all tests**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 4: Manual smoke (parent emulator only)**

Sign in as parent on emulator. Navigate to Settings → Kids → confirm "+ Pair a new device" appears under each kid. Tap it → modal opens, code is shown. (Redeem flow exercised in Task 21.)

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(app\)/parent/settings.tsx
git commit -m "feat(mobile): parent Settings — per-kid Devices section + pair modal"
```

---

## Task 20: Register kid-device push token after pair completes

**Files:**
- Modify: `mobile/src/lib/pushNotifications.ts` (or wherever push registration happens — search)

- [ ] **Step 1: Find the existing push registration hook/util**

```bash
grep -rn "set_push_token\|setNotificationHandler\|getExpoPushTokenAsync" mobile/src mobile/app | head -10
```

Identify the function that runs post-sign-in to register the push token (likely `registerPushToken()` somewhere). Note its current trigger.

- [ ] **Step 2: Trigger it on kid sessions too**

In `mobile/app/_layout.tsx`, find the effect that runs `registerPushToken()` for authenticated users. Confirm it does NOT gate on parent profile. If it does, broaden it to fire whenever `auth.status === 'authenticated'` regardless of session type.

The server-side `set_push_token` (Task 8) writes to `kid_devices` when caller is a kid session and `profiles` when caller is a parent session — no client-side branching needed.

- [ ] **Step 3: Smoke test on emulator**

After Task 21 (pairing works end-to-end), confirm via SQL:

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -c \
  "select kid_id, device_name, push_token is not null as has_token from public.kid_devices;"
```

Expected: `has_token=t` for the paired kid device after sign-in.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/_layout.tsx  # or whichever file changed
git commit -m "feat(mobile): register push token for kid sessions (writes to kid_devices via RPC)"
```

---

## Task 21: Manual two-emulator acceptance gate

**Files:**
- Create: `docs/superpowers/specs/2026-05-28-kid-device-pairing-acceptance.md`

This is the spec's "binary gate." It is not automated. Run it on two emulators side by side and record the outcome.

- [ ] **Step 1: Boot two emulators**

```bash
# Emulator A: parent device
emulator -avd Pixel_7_API_34 -port 5554 &
# Emulator B: kid device (different AVD or second port)
emulator -avd Pixel_7_API_34_2 -port 5556 &
```

If you only have one Pixel-7-API-34 AVD, clone it via `avdmanager create avd -n Pixel_7_API_34_2 -k '...'` or use one emulator + one physical device.

- [ ] **Step 2: Install the app on both**

Build a preview APK: `eas build --profile preview --platform android` (or use `expo run:android` against each device).

- [ ] **Step 3: Run the acceptance checklist**

```
1. [ ] Cold-launch on Emulator A → land on welcome → sign in as parent
2. [ ] Navigate Settings → Kids → Luna → tap "+ Pair a new device" → 6-digit code + QR visible
3. [ ] Cold-launch on Emulator B → land on Pair This Device screen
4. [ ] Type the 6-digit code from Emulator A into Emulator B
5. [ ] Emulator B routes to Luna's kid-mode home within 3 seconds
6. [ ] Emulator A modal flips to "✓ Paired to <device name>" and auto-dismisses
7. [ ] Emulator B chore list shows Luna's chores (data already exists from parent setup)
8. [ ] Emulator B: tap an auto-verified chore → status flips to approved
9. [ ] Emulator A: refresh approvals tab → no submission for auto chore (correct)
10. [ ] Emulator B: tap an approval-mode chore → status submitted
11. [ ] Emulator A: approvals tab shows the submission
12. [ ] Emulator A: approve it → Emulator B sees star count update (realtime)
13. [ ] Emulator A: Settings → Kids → Luna → Devices → tap Unpair on the row → confirm
14. [ ] Emulator B: tap any chore → routed to "This device was unpaired" → "Pair again"
15. [ ] OS check: on Emulator B, Settings → Accounts → confirm NO Google account associated with HomeSquad parent
16. [ ] Verify no profile rows leak: psql -c "select count(*) from profiles where user_id = '<emulator B anon uid>'" → 0
```

- [ ] **Step 4: Document results**

Write the result of each step into `docs/superpowers/specs/2026-05-28-kid-device-pairing-acceptance.md`:

```markdown
# Kid Device Pairing — Acceptance Results

**Date:** [date you ran this]
**Builds:** preview APK <hash>
**Emulators:** A: Pixel_7_API_34 (port 5554), B: Pixel_7_API_34_2 (port 5556)

## Results
1. [x] PASS — cold launch on A
2. [x] PASS — modal showed code 482619
...
```

- [ ] **Step 5: Commit + tag**

If all 16 steps pass:

```bash
git add docs/superpowers/specs/2026-05-28-kid-device-pairing-acceptance.md
git commit -m "docs(spec): kid device pairing — acceptance gate results (all 16 PASS)"
git tag m10-kid-device-pairing
```

If any step fails, document the failure, do NOT tag, return to the relevant task, and re-run.

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-28-kid-device-pairing-design.md`):**

- Pairing ceremony ASCII diagram → covered by Tasks 4, 5, 15, 18 (server RPCs + kid screen + parent modal).
- Supabase Anonymous Auth choice → Task 11.
- `kid_pairing_codes` + `kid_devices` + `pairing_redeem_attempts` schema → Tasks 1, 2.
- `current_family_id()` extension + `current_kid_id()` → Task 3.
- `start_device_pairing` RPC → Task 4.
- `redeem_device_pairing` RPC with rate limit + idempotency + single error → Task 5.
- `revoke_kid_device` RPC → Task 6.
- Write policies on kid-actionable tables gated on `actor_kid_id = current_kid_id()` → Tasks 7, 9 (audit).
- Rate-limit per-IP attempt counter → embedded in Task 5 + Task 2 cleanup cron.
- Parent UX (Devices section + pair modal + revoke + realtime auto-dismiss) → Tasks 17, 18, 19.
- Kid UX (Pair This Device + QR + code) → Tasks 14, 15.
- Routing for kid sessions and orphan anon → Task 16.
- Push token integration → Tasks 8, 20.
- RLS regression matrix → Task 10.
- Two-emulator acceptance gate → Task 21.

**Placeholder scan:** the only deliberate placeholder is Task 10 (RLS matrix), where the test body depends on the policy enumeration done in its Step 1. This is acceptable — the structure is fully specified, only the per-policy assertion list is bound at execution time.

**Type consistency:** `startDevicePairing` returns `{code, expiresAt: Date}` in Task 13; consumed as such in Task 18. `redeemPairingCode` returns `string` (the kid_id); consumed in Tasks 13 and 15. `revokeKidDevice` returns `void`; consumed in Task 17. `useKidSession` returns the discriminated union used in Tasks 16. All consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-kid-device-pairing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
