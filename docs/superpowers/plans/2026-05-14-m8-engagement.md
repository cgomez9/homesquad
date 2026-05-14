# M8 Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six engagement features carved off from M5 + M6 — leaderboard, family co-op goals, quiet hours, per-event mute, push retry queue, streak milestone pushes — as a single milestone that rides existing M3–M6 infrastructure.

**Architecture:** One DB-backed `push_outbox` table mediates between event-firing triggers and the Expo Push API; quiet-hours, mute, and retry are three filter/scheduling layers on the same table. Leaderboard and active goal are read-only RPCs against the existing `star_ledger`. The existing M5 `send_push` Edge Function splits into a DB function (`send_push` — enqueues) and a new Edge Function (`send_push_drain` — formats messages and POSTs to Expo).

**Tech Stack:** Postgres 15 + Supabase + pgTAP + pg_cron + pg_net + Deno Edge Functions, React Native 0.81 + Expo SDK 54 + TanStack Query 5 + Jest + jest-expo.

**Spec:** `docs/superpowers/specs/2026-05-14-m8-engagement-design.md` (commit `28a511d` on branch `m7-prelaunch`).

**Branch:** Create new branch `m8-engagement` off the current tip of `m7-prelaunch`. M8 is independent of M7's Apple Dev / APNs work and can merge to `main` on its own schedule.

**Refinements over the spec:**
- `push_outbox.status` check constraint adds `'sending'` to the spec's `pending|sent|failed|canceled` set. Used as an in-flight marker so concurrent cron runs don't double-dispatch rows whose Edge Function callback hasn't completed yet. A stale-`sending` recovery cron (5-minute timeout → reset to `pending`) is included in the drain migration.
- DB-level `send_push` signature is `send_push(p_family_id uuid, p_event_type text, p_payload jsonb)` — the family form, not the spec's `p_recipients uuid[]`. All call sites push to all parents; passing `family_id` keeps trigger code minimal and the function self-contained.

---

## File map

**New migrations** (`supabase/migrations/`):
1. `20260514000001_families_timezone_and_quiet_hours.sql`
2. `20260514000002_profiles_push_prefs.sql`
3. `20260514000003_push_outbox.sql`
4. `20260514000004_family_goals.sql`
5. `20260514000005_m8_realtime_publication.sql`
6. `20260514000006_set_quiet_hours_rpc.sql`
7. `20260514000007_set_push_pref_rpc.sql`
8. `20260514000008_send_push_function.sql`
9. `20260514000009_drain_push_outbox.sql`
10. `20260514000010_rewire_push_triggers.sql`
11. `20260514000011_streak_milestone_trigger.sql`
12. `20260514000012_create_family_goal_rpc.sql`
13. `20260514000013_cancel_family_goal_rpc.sql`
14. `20260514000014_get_active_goal_rpc.sql`
15. `20260514000015_goal_completion_trigger.sql`
16. `20260514000016_get_leaderboard_rpc.sql`

**New pgTAP tests** (`supabase/tests/`):
- `38_set_quiet_hours_rpc.sql`
- `39_set_push_pref_rpc.sql`
- `40_send_push_enqueue.sql`
- `41_drain_outbox.sql`
- `42_streak_milestone.sql`
- `43_family_goals_rpcs.sql`
- `44_goal_completion.sql`
- `45_get_leaderboard.sql`

**New Edge Function** (`supabase/functions/`):
- `send_push_drain/index.ts`

**Removed** (`supabase/functions/`):
- `send_push/` — the M5 Edge Function is removed; its responsibilities split between the new DB `send_push` function and the new `send_push_drain` Edge Function.

**New mobile files:**
- `mobile/app/(app)/parent/leaderboard.tsx`
- `mobile/app/(app)/parent/goals/index.tsx`
- `mobile/app/(app)/parent/goals/create.tsx`
- `mobile/app/(app)/parent/goals/_layout.tsx`
- `mobile/app/(app)/kid/[profileId]/leaderboard.tsx`
- `mobile/src/components/LeaderboardList.tsx`
- `mobile/src/components/GoalCard.tsx`
- `mobile/src/components/QuietHoursPicker.tsx`
- `mobile/src/components/PushPrefsList.tsx`
- `mobile/src/hooks/useLeaderboard.ts`
- `mobile/src/hooks/useActiveGoal.ts`

**New Jest tests** (`mobile/tests/`):
- `quietHoursPicker.test.tsx`
- `pushPrefsList.test.tsx`
- `leaderboardList.test.tsx`
- `goalCard.test.tsx`
- `createGoalScreen.test.tsx`

**Modified mobile files:**
- `mobile/app/(app)/parent/_layout.tsx` — register goals + leaderboard routes (Stack)
- `mobile/app/(app)/parent/settings.tsx` — Notifications subsection + Leaderboard / Goals links
- `mobile/app/(app)/parent/index.tsx` — render `<GoalCard />` above chore list when active
- `mobile/app/(app)/kid/[profileId]/index.tsx` — `<GoalCard />` + Leaderboard header link
- `mobile/src/components/AchievementBanner.tsx` — accept `goal_completed` variant
- `mobile/src/lib/realtime.ts` — extend `subscribeToFamily` with `family_goals` listener
- `mobile/src/i18n/locales/en.json` + `es.json` — new keys for notifications, leaderboard, goals

---

## Phase 1 — Schema foundation

### Task 1: families timezone + quiet_hours columns

**Files:**
- Create: `supabase/migrations/20260514000001_families_timezone_and_quiet_hours.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply locally**

```powershell
cd C:\Users\USUARIO\Desktop\Shores
supabase db reset
```

Expected: all migrations apply cleanly, output ends with `Finished supabase db reset`.

- [ ] **Step 3: Verify columns exist**

```powershell
supabase db query "select column_name, data_type, column_default from information_schema.columns where table_name='families' and column_name in ('timezone','quiet_hours_enabled','quiet_hours_start','quiet_hours_end') order by column_name;"
```

Expected: 4 rows with the expected types and defaults.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260514000001_families_timezone_and_quiet_hours.sql
git commit -m "feat(db): families.timezone + quiet_hours_{enabled,start,end} columns"
```

---

### Task 2: profiles.push_prefs column + self-update RLS

**Files:**
- Create: `supabase/migrations/20260514000002_profiles_push_prefs.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply and verify**

```powershell
supabase db reset
supabase db query "select column_name, data_type, column_default from information_schema.columns where table_name='profiles' and column_name='push_prefs';"
```

Expected: 1 row, type=`jsonb`, default=`'{}'::jsonb`.

- [ ] **Step 3: Verify policy exists**

```powershell
supabase db query "select polname from pg_policy where polrelid='public.profiles'::regclass and polname='profiles_update_own_push_prefs';"
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260514000002_profiles_push_prefs.sql
git commit -m "feat(db): profiles.push_prefs + self-update RLS policy"
```

---

### Task 3: push_outbox table + RLS

**Files:**
- Create: `supabase/migrations/20260514000003_push_outbox.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000003_push_outbox.sql
-- The push delivery queue. send_push() enqueues rows; drain_push_outbox()
-- (pg_cron, every minute) marks pending rows 'sending', dispatches them to
-- the send_push_drain Edge Function, and apply_drain_result() flips them to
-- 'sent' or 'failed' (with backoff for transient errors).
--
-- 'sending' is an in-flight marker: it prevents the next cron tick from
-- re-dispatching rows whose Edge Function callback hasn't completed yet. A
-- recovery branch in drain_push_outbox() resets stale 'sending' rows (>5min)
-- back to 'pending' on the next pass.

create table public.push_outbox (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null,
  payload       jsonb not null,
  enqueued_at   timestamptz not null default now(),
  scheduled_for timestamptz not null,
  attempts      int  not null default 0,
  max_attempts  int  not null default 3,
  status        text not null default 'pending'
                check (status in ('pending','sending','sent','failed','canceled')),
  last_error    text,
  sent_at       timestamptz,
  sending_since timestamptz
);

create index push_outbox_pending_idx
  on public.push_outbox (scheduled_for)
  where status = 'pending';

create index push_outbox_sending_idx
  on public.push_outbox (sending_since)
  where status = 'sending';

create index push_outbox_recipient_pending_idx
  on public.push_outbox (recipient_id, scheduled_for)
  where status = 'pending';

alter table public.push_outbox enable row level security;

-- Service role bypasses RLS for all writes (drain worker + send_push function
-- run as service_role via the cron job and Edge Function). Parents can read
-- their family's rows (future debug screen). No client writes.
create policy push_outbox_read_own_family
  on public.push_outbox
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.family_id = push_outbox.family_id
        and p.type = 'parent'
    )
  );
```

- [ ] **Step 2: Apply and verify**

```powershell
supabase db reset
supabase db query "select tablename from pg_tables where schemaname='public' and tablename='push_outbox';"
```

Expected: 1 row.

- [ ] **Step 3: Verify indexes**

```powershell
supabase db query "select indexname from pg_indexes where tablename='push_outbox' order by indexname;"
```

Expected: rows including `push_outbox_pending_idx`, `push_outbox_sending_idx`, `push_outbox_recipient_pending_idx`, `push_outbox_pkey`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260514000003_push_outbox.sql
git commit -m "feat(db): push_outbox table with pending/sending/sent/failed status"
```

---

### Task 4: family_goals table + RLS + partial unique

**Files:**
- Create: `supabase/migrations/20260514000004_family_goals.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000004_family_goals.sql
-- Co-op goal storage. One active goal per family enforced by partial
-- unique index. Progress is computed on read from star_ledger; no
-- denormalized progress column.

create table public.family_goals (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  title         text not null,
  description   text,
  target_stars  int  not null check (target_stars > 0),
  status        text not null default 'active'
                check (status in ('active','completed','canceled')),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create unique index family_goals_one_active_per_family
  on public.family_goals (family_id)
  where status = 'active';

create index family_goals_family_status_idx
  on public.family_goals (family_id, status);

alter table public.family_goals enable row level security;

create policy family_goals_read_own_family
  on public.family_goals
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.family_id = family_goals.family_id
    )
  );

-- Writes go through SECURITY DEFINER RPCs (create_family_goal,
-- cancel_family_goal) — no direct INSERT/UPDATE policy.
```

- [ ] **Step 2: Apply and verify**

```powershell
supabase db reset
supabase db query "select tablename from pg_tables where schemaname='public' and tablename='family_goals';"
```

Expected: 1 row.

- [ ] **Step 3: Verify partial unique behavior**

```powershell
supabase db query "select indexdef from pg_indexes where tablename='family_goals' and indexname='family_goals_one_active_per_family';"
```

Expected: index definition includes `WHERE (status = 'active'::text)`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260514000004_family_goals.sql
git commit -m "feat(db): family_goals table + partial unique on active goal"
```

---

### Task 5: Realtime publication — add family_goals

**Files:**
- Create: `supabase/migrations/20260514000005_m8_realtime_publication.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000005_m8_realtime_publication.sql
-- Opt family_goals into supabase_realtime so the kid celebration banner
-- and the active-goal card invalidate on UPDATE. Local dev resets the
-- publication empty on db reset, so this must live in a migration.
-- (Per M6 late fix 7583eb4 — known gotcha for any new broadcasting table.)
--
-- push_outbox is intentionally NOT added: only the server-side drain worker
-- reads it.

alter publication supabase_realtime add table public.family_goals;
```

- [ ] **Step 2: Apply and verify**

```powershell
supabase db reset
supabase db query "select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename;"
```

Expected: `family_goals` present along with the M5/M6 tables (`chore_instances`, `redemptions`, `star_ledger`, `achievements`).

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260514000005_m8_realtime_publication.sql
git commit -m "feat(db): add family_goals to supabase_realtime publication"
```

---

## Phase 2 — Push subsystem (DB layer)

### Task 6: set_quiet_hours RPC

**Files:**
- Create: `supabase/tests/38_set_quiet_hours_rpc.sql`
- Create: `supabase/migrations/20260514000006_set_quiet_hours_rpc.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/38_set_quiet_hours_rpc.sql
begin;

select plan(6);

-- Fixture: family + parent + non-parent kid.
insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'parent@test.local');
insert into auth.users (id, email)
  values ('22222222-2222-2222-2222-222222222222', 'kid@test.local');

insert into public.families (id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Family');

insert into public.profiles (id, user_id, family_id, type, display_name, pin_hash)
  values
    ('33333333-3333-3333-3333-333333333333',
     '11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Parent', '0000'),
    ('44444444-4444-4444-4444-444444444444',
     '22222222-2222-2222-2222-222222222222',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Kid', '0000');

-- 1. Parent call succeeds.
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

select lives_ok(
  $$ select set_quiet_hours(true, '22:00'::time, '06:30'::time, 'America/Bogota') $$,
  'parent can call set_quiet_hours'
);

-- 2. Values persisted.
reset role;
select is(
  (select quiet_hours_start from families where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '22:00'::time, 'quiet_hours_start persisted');

select is(
  (select timezone from families where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'America/Bogota', 'timezone persisted');

-- 3. Invalid timezone raises.
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'Not/A_Zone') $$,
  'P0001', 'invalid_timezone',
  'invalid timezone rejected');

-- 4. Kid call rejected.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'UTC') $$,
  'P0001', 'not_a_parent',
  'kid cannot call set_quiet_hours');

-- 5. Anonymous call rejected.
reset role;
select throws_ok(
  $$ select set_quiet_hours(true, '21:00'::time, '07:00'::time, 'UTC') $$,
  NULL, NULL,
  'anonymous cannot call set_quiet_hours');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/38_set_quiet_hours_rpc.sql
```

Expected: failure — function `set_quiet_hours` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000006_set_quiet_hours_rpc.sql
create or replace function public.set_quiet_hours(
  p_enabled  boolean,
  p_start    time,
  p_end      time,
  p_timezone text
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_family_id  uuid;
begin
  -- Caller must be a parent.
  select id, family_id into v_profile_id, v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  -- Validate timezone against pg_timezone_names.
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;

  update public.families
     set quiet_hours_enabled = p_enabled,
         quiet_hours_start   = p_start,
         quiet_hours_end     = p_end,
         timezone            = p_timezone
   where id = v_family_id;
end;
$$;

revoke all on function public.set_quiet_hours(boolean, time, time, text) from public;
grant execute on function public.set_quiet_hours(boolean, time, time, text) to authenticated;
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/38_set_quiet_hours_rpc.sql
```

Expected: all 6 assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests/38_set_quiet_hours_rpc.sql supabase/migrations/20260514000006_set_quiet_hours_rpc.sql
git commit -m "feat(db): set_quiet_hours RPC with timezone validation"
```

---

### Task 7: set_push_pref RPC

**Files:**
- Create: `supabase/tests/39_set_push_pref_rpc.sql`
- Create: `supabase/migrations/20260514000007_set_push_pref_rpc.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/39_set_push_pref_rpc.sql
begin;

select plan(4);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'parent@test.local');
insert into public.families (id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Family');
insert into public.profiles (id, user_id, family_id, type, display_name, pin_hash)
  values ('33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Parent', '0000');

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- 1. Setting a pref returns the updated jsonb.
select is(
  (select set_push_pref('chore_submitted', false)),
  '{"chore_submitted": false}'::jsonb,
  'returns updated prefs');

-- 2. Second call merges instead of replacing.
select is(
  (select set_push_pref('redemption_requested', false)),
  '{"chore_submitted": false, "redemption_requested": false}'::jsonb,
  'second call merges keys');

-- 3. Re-enabling flips the value.
select is(
  (select set_push_pref('chore_submitted', true)),
  '{"chore_submitted": true, "redemption_requested": false}'::jsonb,
  're-enable flips the boolean');

-- 4. Anonymous rejected.
reset role;
select throws_ok(
  $$ select set_push_pref('chore_submitted', false) $$,
  NULL, NULL,
  'anonymous rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/39_set_push_pref_rpc.sql
```

Expected: failure — function does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000007_set_push_pref_rpc.sql
create or replace function public.set_push_pref(
  p_event_type text,
  p_enabled    boolean
) returns jsonb
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_prefs      jsonb;
begin
  select id into v_profile_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  update public.profiles
     set push_prefs = jsonb_set(coalesce(push_prefs, '{}'::jsonb),
                                array[p_event_type],
                                to_jsonb(p_enabled),
                                true)
   where id = v_profile_id
  returning push_prefs into v_prefs;

  return v_prefs;
end;
$$;

revoke all on function public.set_push_pref(text, boolean) from public;
grant execute on function public.set_push_pref(text, boolean) to authenticated;
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/39_set_push_pref_rpc.sql
```

Expected: 4 assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests/39_set_push_pref_rpc.sql supabase/migrations/20260514000007_set_push_pref_rpc.sql
git commit -m "feat(db): set_push_pref RPC with jsonb merge"
```

---

### Task 8: send_push DB function (enqueue logic)

**Files:**
- Create: `supabase/tests/40_send_push_enqueue.sql`
- Create: `supabase/migrations/20260514000008_send_push_function.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/40_send_push_enqueue.sql
begin;
select plan(7);

-- Fixture: family with two parents, both with push_token. One has muted
-- chore_submitted via push_prefs.
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'a@t.local'),
  ('a2222222-2222-2222-2222-222222222222', 'b@t.local');

insert into public.families (id, name, timezone, quiet_hours_enabled,
                             quiet_hours_start, quiet_hours_end)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fam',
          'UTC', false, '21:00'::time, '07:00'::time);

insert into public.profiles (id, user_id, family_id, type, display_name,
                              pin_hash, push_token, push_prefs)
values
  ('33333333-3333-3333-3333-333333333333',
   'a1111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'A', '0',
   'ExpoToken-A', '{"chore_submitted": false}'::jsonb),
  ('44444444-4444-4444-4444-444444444444',
   'a2222222-2222-2222-2222-222222222222',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'B', '0',
   'ExpoToken-B', '{}'::jsonb);

-- 1. Send chore_submitted; muted parent is skipped, other gets enqueued.
select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'chore_submitted',
                    jsonb_build_object('instance_id','xyz'))),
  1,
  'enqueues 1 row when one parent muted that event');

select is(
  (select count(*)::int from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444'),
  1, 'row exists for unmuted parent');

select is(
  (select count(*)::int from push_outbox
   where recipient_id='33333333-3333-3333-3333-333333333333'),
  0, 'no row for muted parent');

-- 2. Outside quiet hours (disabled): scheduled_for = now() (within 1s).
select ok(
  (select scheduled_for from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444') >= now() - interval '1 second'
  and
  (select scheduled_for from push_outbox
   where recipient_id='44444444-4444-4444-4444-444444444444') <= now() + interval '1 second',
  'scheduled_for is roughly now() when quiet hours disabled');

-- 3. With quiet hours enabled and current_time in the window, scheduled_for
--    jumps to quiet_hours_end.
update public.families
   set quiet_hours_enabled = true,
       quiet_hours_start   = (now() at time zone 'UTC')::time - interval '1 hour',
       quiet_hours_end     = (now() at time zone 'UTC')::time + interval '1 hour'
 where id = 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

delete from push_outbox;

select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'redemption_requested',
                    '{}'::jsonb)),
  2, 'enqueues for both parents (no mute on this event)');

select ok(
  (select min(scheduled_for) from push_outbox) > now() + interval '30 minutes',
  'scheduled_for pushed at least 30 minutes out (into quiet_hours_end)');

-- 4. Null push_token recipient is skipped.
update public.profiles set push_token = null
  where id='33333333-3333-3333-3333-333333333333';
delete from push_outbox;

select is(
  (select send_push('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'redemption_requested', '{}'::jsonb)),
  1, 'null push_token recipient skipped');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/40_send_push_enqueue.sql
```

Expected: failure — `send_push` does not exist.

- [ ] **Step 3: Write the migration**

```sql
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
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/40_send_push_enqueue.sql
```

Expected: 7 assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests/40_send_push_enqueue.sql supabase/migrations/20260514000008_send_push_function.sql
git commit -m "feat(db): send_push DB function — enqueue with mute + quiet-hours scheduling"
```

---

### Task 9: drain_push_outbox + apply_drain_result + cron

**Files:**
- Create: `supabase/tests/41_drain_outbox.sql`
- Create: `supabase/migrations/20260514000009_drain_push_outbox.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/41_drain_outbox.sql
-- We can't unit-test the net.http_post fire-and-forget directly, but we can
-- assert apply_drain_result's state-transition math.
begin;
select plan(8);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
insert into public.profiles (id, user_id, family_id, type, display_name,
                              pin_hash, push_token)
  values ('33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', '0',
          'ExpoToken');

insert into public.push_outbox (id, family_id, recipient_id, event_type,
                                payload, scheduled_for, status, attempts)
values
  ('b1111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 0),
  ('b2222222-2222-2222-2222-222222222222',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 1),
  ('b3333333-3333-3333-3333-333333333333',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'chore_submitted', '{}'::jsonb, now(), 'sending', 2);

-- 1. OK outcome marks sent.
select lives_ok(
  $$ select apply_drain_result('b1111111-1111-1111-1111-111111111111', 'ok', null) $$,
  'apply_drain_result(ok) lives');
select is(
  (select status from push_outbox where id='b1111111-1111-1111-1111-111111111111'),
  'sent', 'ok → sent');

-- 2. Transient failure with attempts<max increments and schedules retry.
select lives_ok(
  $$ select apply_drain_result('b2222222-2222-2222-2222-222222222222', 'transient', '5xx') $$,
  'transient retry lives');
select is(
  (select status from push_outbox where id='b2222222-2222-2222-2222-222222222222'),
  'pending', 'transient with attempts<max → pending');
select is(
  (select attempts from push_outbox where id='b2222222-2222-2222-2222-222222222222'),
  2, 'attempts incremented');

-- 3. Transient at max_attempts marks failed.
select lives_ok(
  $$ select apply_drain_result('b3333333-3333-3333-3333-333333333333', 'transient', 'expired') $$,
  'transient terminal lives');
select is(
  (select status from push_outbox where id='b3333333-3333-3333-3333-333333333333'),
  'failed', 'transient at max → failed');

-- 4. DeviceNotRegistered nulls push_token and marks failed.
update public.push_outbox set status='sending'
  where id='b3333333-3333-3333-3333-333333333333';
update public.push_outbox set attempts=0
  where id='b3333333-3333-3333-3333-333333333333';

select apply_drain_result('b3333333-3333-3333-3333-333333333333',
                          'device_not_registered', 'token rotated');

select is(
  (select push_token from public.profiles
   where id='33333333-3333-3333-3333-333333333333'),
  NULL, 'DeviceNotRegistered → push_token nulled');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/41_drain_outbox.sql
```

Expected: failure — `apply_drain_result` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000009_drain_push_outbox.sql
-- drain_push_outbox(): picks pending rows whose scheduled_for has arrived,
-- groups by recipient (collapse threshold = 2), marks them 'sending', and
-- fires the batch to the send_push_drain Edge Function via pg_net.
--
-- Also runs a recovery sweep: any row stuck in 'sending' for >5 minutes is
-- reset to 'pending' (Edge Function presumably died without calling
-- apply_drain_result back).
--
-- apply_drain_result(): callback invoked by the Edge Function per row.
-- Handles the state transitions for ok / transient / device_not_registered.

create or replace function public.apply_drain_result(
  p_row_id  uuid,
  p_outcome text,
  p_error   text default null
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_row push_outbox;
begin
  select * into v_row from public.push_outbox where id = p_row_id;
  if v_row.id is null then
    return;
  end if;

  if p_outcome = 'ok' then
    update public.push_outbox
       set status        = 'sent',
           sent_at       = now(),
           sending_since = null,
           last_error    = null
     where id = p_row_id;

  elsif p_outcome = 'device_not_registered' then
    update public.profiles set push_token = null
     where id = v_row.recipient_id;
    update public.push_outbox
       set status        = 'failed',
           sending_since = null,
           last_error    = coalesce(p_error, 'device_not_registered')
     where id = p_row_id;

  elsif p_outcome = 'transient' then
    if v_row.attempts + 1 >= v_row.max_attempts then
      update public.push_outbox
         set status        = 'failed',
             attempts      = v_row.attempts + 1,
             sending_since = null,
             last_error    = coalesce(p_error, 'transient (out of attempts)')
       where id = p_row_id;
    else
      update public.push_outbox
         set status        = 'pending',
             attempts      = v_row.attempts + 1,
             sending_since = null,
             scheduled_for = now() + (interval '30 seconds'
                                      * power(2, v_row.attempts + 1)::int),
             last_error    = p_error
       where id = p_row_id;
    end if;

  else
    update public.push_outbox
       set status        = 'failed',
           sending_since = null,
           last_error    = coalesce(p_error, 'unknown outcome: ' || p_outcome)
     where id = p_row_id;
  end if;
end;
$$;

revoke all on function public.apply_drain_result(uuid, text, text) from public;
grant execute on function public.apply_drain_result(uuid, text, text) to service_role;

-- drain_push_outbox: invoked by pg_cron.
create or replace function public.drain_push_outbox() returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_base_url text;
  v_key      text;
  v_batch    jsonb;
  v_recovered int;
begin
  -- Recovery sweep: rows stuck in 'sending' for >5min go back to pending.
  update public.push_outbox
     set status='pending', sending_since=null
   where status='sending'
     and sending_since < now() - interval '5 minutes';
  get diagnostics v_recovered = row_count;
  if v_recovered > 0 then
    raise notice 'drain_push_outbox: recovered % stale sending rows', v_recovered;
  end if;

  -- Take a batch of pending rows, mark them sending.
  with claimed as (
    update public.push_outbox
       set status        = 'sending',
           sending_since = now()
     where id in (
       select id from public.push_outbox
        where status = 'pending' and scheduled_for <= now()
        order by scheduled_for
        limit 100
        for update skip locked
     )
    returning id, recipient_id, event_type, payload
  ),
  grouped as (
    select recipient_id,
           jsonb_agg(jsonb_build_object(
             'row_id',     id,
             'event_type', event_type,
             'payload',    payload
           ) order by id) as items
      from claimed
     group by recipient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipient_id', recipient_id,
           'items',        items
         )), '[]'::jsonb)
    into v_batch
    from grouped;

  if v_batch = '[]'::jsonb then
    return;
  end if;

  v_base_url := current_setting('app.settings.functions_base_url', true);
  v_key      := current_setting('app.settings.service_role_key', true);

  if v_base_url is null or v_key is null then
    -- Local dev without config: do nothing. Rows will reset via stale sweep.
    raise notice 'drain_push_outbox: functions_base_url/service_role_key unset, skipping';
    return;
  end if;

  begin
    perform net.http_post(
      url     := v_base_url || '/send_push_drain',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('batch', v_batch)
    );
  exception when others then
    raise warning 'drain_push_outbox: net.http_post failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.drain_push_outbox() from public;
grant execute on function public.drain_push_outbox() to service_role;

-- Schedule: every minute.
select cron.schedule(
  'drain_push_outbox',
  '* * * * *',
  $$ select public.drain_push_outbox() $$
);
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/41_drain_outbox.sql
```

Expected: 8 assertions pass.

- [ ] **Step 5: Verify the cron job is registered**

```powershell
supabase db query "select jobname, schedule from cron.job where jobname='drain_push_outbox';"
```

Expected: 1 row, schedule `* * * * *`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/tests/41_drain_outbox.sql supabase/migrations/20260514000009_drain_push_outbox.sql
git commit -m "feat(db): drain_push_outbox + apply_drain_result + 1-min cron"
```

---

### Task 10: Rewire existing push triggers to call send_push

**Files:**
- Modify: `supabase/migrations/20260511000007_chore_push_trigger.sql` (no — we don't edit prior migrations)
- Create: `supabase/migrations/20260514000010_rewire_push_triggers.sql`

The M5 triggers (`notify_push_chore`, `notify_push_redemption`, `notify_push_achievement`) currently do `net.http_post` directly to the Edge Function. Rewire them to PERFORM the new DB-level `send_push` so all dispatch flows through `push_outbox`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000010_rewire_push_triggers.sql
-- Replace the M5 trigger function bodies. They were the only callers of
-- net.http_post(...send_push...) — that pattern is now obsolete. The new
-- triggers call public.send_push(family_id, event_type, payload), which
-- enqueues into push_outbox. The send_push_drain Edge Function (next task)
-- handles the actual Expo POST.

create or replace function public.notify_push_chore() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if OLD.status = 'pending' and NEW.status = 'submitted' then
    event_kind := 'chore_submitted';
  elsif NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'chore_approved';
  elsif NEW.status = 'rejected' and OLD.status <> 'rejected' then
    event_kind := 'chore_rejected';
  else
    return NEW;
  end if;

  begin
    perform public.send_push(
      NEW.family_id,
      event_kind,
      jsonb_build_object(
        'instance_id',    NEW.id,
        'kid_profile_id', NEW.completed_by
      )
    );
  exception when others then
    raise warning 'notify_push_chore: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

create or replace function public.notify_push_redemption() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if OLD.status = 'pending' and NEW.status = 'requested' then
    event_kind := 'redemption_requested';
  elsif NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'redemption_approved';
  elsif NEW.status = 'denied'   and OLD.status <> 'denied' then
    event_kind := 'redemption_denied';
  elsif NEW.status = 'fulfilled' and OLD.status <> 'fulfilled' then
    event_kind := 'redemption_fulfilled';
  else
    return NEW;
  end if;

  begin
    perform public.send_push(
      NEW.family_id,
      event_kind,
      jsonb_build_object(
        'redemption_id',  NEW.id,
        'reward_id',      NEW.reward_id,
        'kid_profile_id', NEW.profile_id
      )
    );
  exception when others then
    raise warning 'notify_push_redemption: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

create or replace function public.notify_push_achievement() returns trigger
  language plpgsql security definer as $$
begin
  begin
    perform public.send_push(
      NEW.family_id,
      'achievement_unlocked',
      jsonb_build_object(
        'profile_id',      NEW.profile_id,
        'achievement_key', NEW.achievement_key
      )
    );
  exception when others then
    raise warning 'notify_push_achievement: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
```

- [ ] **Step 2: Apply and verify**

```powershell
supabase db reset
supabase db query "select prosrc from pg_proc where proname='notify_push_chore' limit 1;" | findstr send_push
```

Expected: a line containing `public.send_push(` (no `net.http_post`).

- [ ] **Step 3: Re-run the M5/M6 trigger tests to confirm we didn't break them**

```powershell
supabase test db --file supabase/tests/27_chore_push_trigger.sql
supabase test db --file supabase/tests/28_redemption_push_trigger.sql
supabase test db --file supabase/tests/34_achievement_push_trigger.sql
```

(Adjust filenames to match actual M5/M6 test file numbers — search `supabase/tests/` for trigger tests.) Expected: all pass. If they fail because they asserted `net.http_post` was called, update them to assert `push_outbox` rows were inserted instead, as part of this task.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260514000010_rewire_push_triggers.sql
git commit -m "feat(db): rewire M5/M6 push triggers to call send_push via push_outbox"
```

---

### Task 11: Streak milestone trigger

**Files:**
- Create: `supabase/tests/42_streak_milestone.sql`
- Create: `supabase/migrations/20260514000011_streak_milestone_trigger.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/42_streak_milestone.sql
begin;
select plan(5);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
insert into public.profiles (id, user_id, family_id, type, display_name,
                              pin_hash, push_token)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', '0', 'ExpoToken'),
  ('55555555-5555-5555-5555-555555555555',
   null,
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', '0', null);

insert into public.streaks (profile_id, family_id, current_streak,
                             last_completion_date)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          6, current_date);

-- 1. Crossing to 7 enqueues a streak_milestone.
update public.streaks set current_streak = 7
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  1, 'crossing to 7 enqueues a streak_milestone push');

-- 2. Payload contains kid_name and streak_days.
select is(
  (select payload->>'kid_name' from push_outbox
   where event_type='streak_milestone'),
  'Sara', 'payload kid_name = Sara');
select is(
  ((select payload->>'streak_days' from push_outbox
    where event_type='streak_milestone'))::int,
  7, 'payload streak_days = 7');

-- 3. Going 7 → 8 does NOT enqueue another.
delete from push_outbox;
update public.streaks set current_streak = 8
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  0, 'going 7 → 8 does not re-fire');

-- 4. Crossing to 30 fires.
update public.streaks set current_streak = 30
  where profile_id='55555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from push_outbox where event_type='streak_milestone'),
  1, 'crossing to 30 fires');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/42_streak_milestone.sql
```

Expected: failure — trigger does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000011_streak_milestone_trigger.sql
create or replace function public.notify_streak_milestone() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_kid_name text;
begin
  if NEW.current_streak in (7,30,100)
     and NEW.current_streak <> coalesce(OLD.current_streak, 0)
  then
    select display_name into v_kid_name
      from public.profiles where id = NEW.profile_id;

    begin
      perform public.send_push(
        NEW.family_id,
        'streak_milestone',
        jsonb_build_object(
          'kid_profile_id', NEW.profile_id,
          'kid_name',       v_kid_name,
          'streak_days',    NEW.current_streak
        )
      );
    exception when others then
      raise warning 'notify_streak_milestone: send_push failed: %', sqlerrm;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists streaks_milestone_push on public.streaks;
create trigger streaks_milestone_push
  after update of current_streak on public.streaks
  for each row execute function public.notify_streak_milestone();
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/42_streak_milestone.sql
```

Expected: 5 assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests/42_streak_milestone.sql supabase/migrations/20260514000011_streak_milestone_trigger.sql
git commit -m "feat(db): streak milestone trigger (fires at 7/30/100)"
```

---

## Phase 3 — Edge Function

### Task 12: send_push_drain Edge Function

**Files:**
- Create: `supabase/functions/send_push_drain/index.ts`
- Delete: `supabase/functions/send_push/index.ts` (the M5 Edge Function)

- [ ] **Step 1: Delete the old Edge Function**

```powershell
git rm -r supabase/functions/send_push
```

The M5 send_push Edge Function is obsolete: triggers no longer call it (rewired in Task 10), and its responsibility (format message + POST to Expo) is now `send_push_drain`'s.

- [ ] **Step 2: Create the new Edge Function**

```ts
// supabase/functions/send_push_drain/index.ts
// Invoked by drain_push_outbox() via net.http_post once per minute.
// Body: { batch: [ { recipient_id, items: [ { row_id, event_type, payload } ] } ] }
//
// Per recipient: looks up push_token, builds a message (collapsed summary
// if items.length >= 2; per-event template otherwise), POSTs to Expo Push
// API, parses the ticket, calls apply_drain_result(row_id, outcome, error?)
// for each row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Item = { row_id: string; event_type: string; payload: Record<string, unknown> };
type Group = { recipient_id: string; items: Item[] };

const ACHIEVEMENTS: Record<string, { emoji: string; title: string }> = {
  first_star:   { emoji: '⭐', title: 'First Star' },
  stars_100:    { emoji: '💯', title: 'Century' },
  stars_500:    { emoji: '🏆', title: 'High Roller' },
  streak_7:     { emoji: '🔥', title: 'Week Streak' },
  streak_30:    { emoji: '🌟', title: 'Month Streak' },
  first_chore:  { emoji: '✅', title: 'Getting Started' },
  chores_25:    { emoji: '💪', title: 'Quarter Century' },
  first_reward: { emoji: '🎁', title: 'First Reward' },
};

function classifyExpoError(details: { error?: string } | undefined): 'device_not_registered' | 'transient' {
  if (details?.error === 'DeviceNotRegistered') return 'device_not_registered';
  return 'transient';
}

async function formatMessage(
  supabase: ReturnType<typeof createClient>,
  items: Item[],
): Promise<{ title: string; body: string }> {
  if (items.length >= 2) {
    return {
      title: 'Shores',
      body: `${items.length} updates in your family. Tap to review.`,
    };
  }

  const it = items[0];
  const p = it.payload as Record<string, string>;

  if (it.event_type.startsWith('chore_')) {
    const { data } = await supabase
      .from('chore_instances')
      .select('chore_id, completed_by, chores!inner(title), profiles:completed_by(display_name)')
      .eq('id', p.instance_id)
      .single();
    const choreTitle = (data as any)?.chores?.title ?? 'a chore';
    const kidName    = (data as any)?.profiles?.display_name ?? 'A kid';
    if (it.event_type === 'chore_submitted')
      return { title: 'Shores', body: `${kidName} submitted "${choreTitle}" 📸` };
    if (it.event_type === 'chore_approved')
      return { title: 'Shores', body: `Chore approved: "${choreTitle}" ⭐` };
    if (it.event_type === 'chore_rejected')
      return { title: 'Shores', body: `Chore needs rework: "${choreTitle}"` };
  }

  if (it.event_type.startsWith('redemption_')) {
    const { data } = await supabase
      .from('redemptions')
      .select('reward_id, profile_id, rewards!inner(title), profiles:profile_id(display_name)')
      .eq('id', p.redemption_id)
      .single();
    const rewardTitle = (data as any)?.rewards?.title ?? 'a reward';
    const kidName     = (data as any)?.profiles?.display_name ?? 'A kid';
    if (it.event_type === 'redemption_requested')
      return { title: 'Shores', body: `${kidName} requested "${rewardTitle}" 🎁` };
    if (it.event_type === 'redemption_approved')
      return { title: 'Shores', body: `Reward approved: "${rewardTitle}"` };
    if (it.event_type === 'redemption_denied')
      return { title: 'Shores', body: `Reward denied: "${rewardTitle}"` };
    if (it.event_type === 'redemption_fulfilled')
      return { title: 'Shores', body: `Reward delivered: "${rewardTitle}" ✨` };
  }

  if (it.event_type === 'achievement_unlocked') {
    const meta = ACHIEVEMENTS[p.achievement_key as string];
    if (meta) return { title: 'Shores', body: `${meta.emoji} ${meta.title} unlocked!` };
    return { title: 'Shores', body: 'New badge unlocked!' };
  }

  if (it.event_type === 'streak_milestone') {
    return {
      title: 'Shores',
      body: `${p.kid_name} hit a ${p.streak_days}-day streak! 🔥`,
    };
  }

  if (it.event_type === 'goal_completed') {
    return {
      title: 'Shores',
      body: `Family goal reached: ${p.goal_title} 🎉`,
    };
  }

  return { title: 'Shores', body: 'New activity in your family.' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { batch } = (await req.json()) as { batch: Group[] };

  for (const group of batch) {
    // Resolve token.
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', group.recipient_id)
      .single();
    const token = profile?.push_token as string | null;

    if (!token) {
      for (const it of group.items) {
        await supabase.rpc('apply_drain_result', {
          p_row_id: it.row_id, p_outcome: 'device_not_registered',
          p_error: 'no token at drain time',
        });
      }
      continue;
    }

    const message = await formatMessage(supabase, group.items);

    let ticket: any;
    try {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ to: token, sound: 'default', title: message.title, body: message.body }),
      });
      const json = await resp.json();
      ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    } catch (e) {
      for (const it of group.items) {
        await supabase.rpc('apply_drain_result', {
          p_row_id: it.row_id, p_outcome: 'transient',
          p_error: `fetch: ${(e as Error).message}`,
        });
      }
      continue;
    }

    let outcome: 'ok' | 'transient' | 'device_not_registered';
    let errMsg: string | null = null;
    if (ticket?.status === 'ok') {
      outcome = 'ok';
    } else {
      outcome = classifyExpoError(ticket?.details);
      errMsg = ticket?.message ?? JSON.stringify(ticket);
    }

    for (const it of group.items) {
      await supabase.rpc('apply_drain_result', {
        p_row_id: it.row_id, p_outcome: outcome, p_error: errMsg,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Local serve sanity check**

```powershell
supabase functions serve send_push_drain --no-verify-jwt
```

In another terminal:

```powershell
curl -X POST http://127.0.0.1:54321/functions/v1/send_push_drain `
  -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" `
  -H "Content-Type: application/json" `
  -d '{"batch":[]}'
```

Expected: `{"ok":true}`. (Empty batch is a no-op.)

- [ ] **Step 4: Commit**

```powershell
git add supabase/functions/send_push_drain/index.ts supabase/functions/send_push/
git commit -m "feat(functions): send_push_drain — formats messages + POSTs Expo, replaces send_push"
```

---

## Phase 4 — Goals & leaderboard (DB layer)

### Task 13: create_family_goal RPC

**Files:**
- Create: `supabase/tests/43_family_goals_rpcs.sql`
- Create: `supabase/migrations/20260514000012_create_family_goal_rpc.sql`

- [ ] **Step 1: Write the failing pgTAP test (covers create + cancel + get_active in one file)**

```sql
-- supabase/tests/43_family_goals_rpcs.sql
begin;
select plan(11);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into auth.users (id, email)
  values ('22222222-2222-2222-2222-222222222222', 'k@t.local');
insert into public.families (id, name)
  values ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
insert into public.profiles (id, user_id, family_id, type, display_name, pin_hash)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', '0'),
  ('55555555-5555-5555-5555-555555555555',
   '22222222-2222-2222-2222-222222222222',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', '0');

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- 1. Parent can create.
select lives_ok(
  $$ select create_family_goal('Pizza Night', 100, 'Mom orders Friday') $$,
  'parent can create_family_goal');

select is(
  (select count(*)::int from family_goals
   where status='active' and family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'one active goal exists');

-- 2. Second active create rejected.
select throws_ok(
  $$ select create_family_goal('Movie Night', 50, null) $$,
  'P0001', 'already_active',
  'second active goal raises already_active');

-- 3. Negative target rejected by CHECK.
select throws_ok(
  $$ select create_family_goal('Bad', 0, null) $$,
  '23514', NULL,
  'target_stars <= 0 rejected');

-- 4. Kid cannot create.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ select create_family_goal('Sneak', 10, null) $$,
  'P0001', 'not_a_parent',
  'kid cannot create_family_goal');

-- 5. get_active_goal returns the row + progress.
reset role;
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 25, 'test');

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

select is(
  (select progress_stars from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  25, 'progress_stars = 25 after a +25 ledger row');

select is(
  (select title from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  'Pizza Night', 'title returned');

-- 6. cancel_family_goal flips status.
select lives_ok(
  $$ select cancel_family_goal((select id from family_goals
                                where status='active'
                                  and family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) $$,
  'cancel lives');

select is(
  (select status from family_goals
   where family_id='faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   order by created_at desc limit 1),
  'canceled', 'status flipped to canceled');

-- 7. get_active_goal returns no rows after cancel.
select is(
  (select count(*)::int from get_active_goal('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  0, 'no active goal after cancel');

-- 8. Now a new create works.
select lives_ok(
  $$ select create_family_goal('Round Two', 50, null) $$,
  'new create after cancel');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/43_family_goals_rpcs.sql
```

Expected: failure — none of the three RPCs exist yet.

- [ ] **Step 3: Write `create_family_goal` migration**

```sql
-- supabase/migrations/20260514000012_create_family_goal_rpc.sql
create or replace function public.create_family_goal(
  p_title        text,
  p_target_stars int,
  p_description  text default null
) returns public.family_goals
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_profile_id uuid;
  v_family_id  uuid;
  v_row        public.family_goals;
begin
  select id, family_id into v_profile_id, v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_profile_id is null then
    raise exception 'not_a_parent';
  end if;

  begin
    insert into public.family_goals (family_id, title, target_stars,
                                      description, created_by)
    values (v_family_id, p_title, p_target_stars, p_description, v_profile_id)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'already_active';
  end;

  return v_row;
end;
$$;

revoke all on function public.create_family_goal(text, int, text) from public;
grant execute on function public.create_family_goal(text, int, text) to authenticated;
```

- [ ] **Step 4: Continue to next task (cancel_family_goal) before re-running tests**

Test 43 covers all three RPCs; we'll add the migrations sequentially. Don't re-run yet — proceed to Task 14.

- [ ] **Step 5: Commit just this migration**

```powershell
git add supabase/tests/43_family_goals_rpcs.sql supabase/migrations/20260514000012_create_family_goal_rpc.sql
git commit -m "feat(db): create_family_goal RPC + failing test for the three goal RPCs"
```

---

### Task 14: cancel_family_goal RPC

**Files:**
- Create: `supabase/migrations/20260514000013_cancel_family_goal_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000013_cancel_family_goal_rpc.sql
create or replace function public.cancel_family_goal(p_goal_id uuid)
  returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_family_id is null then
    raise exception 'not_a_parent';
  end if;

  -- Idempotent: silent no-op if already terminal or non-existent / cross-family.
  update public.family_goals
     set status = 'canceled'
   where id = p_goal_id
     and family_id = v_family_id
     and status = 'active';
end;
$$;

revoke all on function public.cancel_family_goal(uuid) from public;
grant execute on function public.cancel_family_goal(uuid) to authenticated;
```

- [ ] **Step 2: Apply**

```powershell
supabase db reset
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260514000013_cancel_family_goal_rpc.sql
git commit -m "feat(db): cancel_family_goal RPC — idempotent on already-terminal goals"
```

---

### Task 15: get_active_goal RPC

**Files:**
- Create: `supabase/migrations/20260514000014_get_active_goal_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000014_get_active_goal_rpc.sql
-- Returns the active goal for a family + computed progress_stars
-- (sum of positive star_ledger deltas since goal.created_at). Zero rows
-- when no active goal exists. Caller must be in the family — enforced by
-- the family_goals + star_ledger RLS policies.

create or replace function public.get_active_goal(p_family_id uuid)
  returns table (
    id            uuid,
    family_id     uuid,
    title         text,
    description   text,
    target_stars  int,
    status        text,
    created_by    uuid,
    created_at    timestamptz,
    completed_at  timestamptz,
    progress_stars int
  )
  language sql stable security invoker
  set search_path = public
as $$
  select g.id, g.family_id, g.title, g.description, g.target_stars,
         g.status, g.created_by, g.created_at, g.completed_at,
         coalesce((
           select sum(delta)::int from public.star_ledger sl
            where sl.family_id = g.family_id
              and sl.delta > 0
              and sl.created_at >= g.created_at
         ), 0) as progress_stars
    from public.family_goals g
   where g.family_id = p_family_id
     and g.status    = 'active'
   limit 1;
$$;

grant execute on function public.get_active_goal(uuid) to authenticated;
```

- [ ] **Step 2: Apply + run the bundled test now that all three RPCs exist**

```powershell
supabase db reset
supabase test db --file supabase/tests/43_family_goals_rpcs.sql
```

Expected: 11 assertions pass.

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260514000014_get_active_goal_rpc.sql
git commit -m "feat(db): get_active_goal RPC with computed progress_stars"
```

---

### Task 16: Goal auto-complete trigger

**Files:**
- Create: `supabase/tests/44_goal_completion.sql`
- Create: `supabase/migrations/20260514000015_goal_completion_trigger.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/44_goal_completion.sql
begin;
select plan(5);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name) values
  ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F');
insert into public.profiles (id, user_id, family_id, type, display_name,
                              pin_hash, push_token)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', '0', 'ExpoToken'),
  ('55555555-5555-5555-5555-555555555555',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'K', '0', null);

insert into public.family_goals (id, family_id, title, target_stars,
                                  created_by, status)
  values ('99999999-9999-9999-9999-999999999999',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Goal',
          10, '33333333-3333-3333-3333-333333333333', 'active');

-- 1. Below target: still active.
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'test');
select is(
  (select status from family_goals
   where id='99999999-9999-9999-9999-999999999999'),
  'active', 'below target → active');

-- 2. Crossing target → completed.
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'test');
select is(
  (select status from family_goals
   where id='99999999-9999-9999-9999-999999999999'),
  'completed', 'at target → completed');

select isnt(
  (select completed_at from family_goals
   where id='99999999-9999-9999-9999-999999999999'),
  NULL, 'completed_at populated');

-- 3. goal_completed push enqueued for the parent.
select is(
  (select count(*)::int from push_outbox
   where event_type='goal_completed'),
  1, 'one goal_completed push enqueued');

-- 4. Subsequent positive ledger rows do NOT re-complete.
delete from push_outbox;
insert into public.star_ledger (profile_id, family_id, delta, reason)
  values ('55555555-5555-5555-5555-555555555555',
          'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'test');
select is(
  (select count(*)::int from push_outbox
   where event_type='goal_completed'),
  0, 'no re-fire after completion');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/44_goal_completion.sql
```

Expected: failure — trigger does not exist; ledger inserts don't flip status.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000015_goal_completion_trigger.sql
-- After each positive star_ledger insert, check the family's active goal.
-- If progress >= target, flip to completed and enqueue a goal_completed push.

create or replace function public.check_active_goal() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_goal     public.family_goals;
  v_progress int;
begin
  select * into v_goal
    from public.family_goals
   where family_id = NEW.family_id and status = 'active'
   limit 1;

  if v_goal.id is null then
    return NEW;
  end if;

  select coalesce(sum(delta)::int, 0) into v_progress
    from public.star_ledger
   where family_id = NEW.family_id
     and delta > 0
     and created_at >= v_goal.created_at;

  if v_progress >= v_goal.target_stars then
    update public.family_goals
       set status = 'completed', completed_at = now()
     where id = v_goal.id and status = 'active';

    if found then
      begin
        perform public.send_push(
          NEW.family_id,
          'goal_completed',
          jsonb_build_object(
            'goal_id',      v_goal.id,
            'goal_title',   v_goal.title,
            'target_stars', v_goal.target_stars
          )
        );
      exception when others then
        raise warning 'check_active_goal: send_push failed: %', sqlerrm;
      end;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists star_ledger_goal_check on public.star_ledger;
create trigger star_ledger_goal_check
  after insert on public.star_ledger
  for each row when (NEW.delta > 0)
  execute function public.check_active_goal();
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/44_goal_completion.sql
```

Expected: 5 assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests/44_goal_completion.sql supabase/migrations/20260514000015_goal_completion_trigger.sql
git commit -m "feat(db): goal completion trigger — auto-completes on star_ledger crossing"
```

---

## Phase 5 — Leaderboard (DB layer)

### Task 17: get_leaderboard RPC

**Files:**
- Create: `supabase/tests/45_get_leaderboard.sql`
- Create: `supabase/migrations/20260514000016_get_leaderboard_rpc.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/45_get_leaderboard.sql
begin;
select plan(6);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local');
insert into public.families (id, name, timezone) values
  ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F', 'UTC');

insert into public.profiles (id, user_id, family_id, type, display_name,
                              pin_hash, avatar_id)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', '0', 1),
  ('55555555-5555-5555-5555-555555555555',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', '0', 2),
  ('66666666-6666-6666-6666-666666666666',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Lev', '0', 3);

-- Sara: +30 this week, +50 historical (last month)
-- Lev:  +20 this week, +100 historical
-- Sara also has a -20 redemption (must NOT count against her).
insert into public.star_ledger (profile_id, family_id, delta, reason, created_at)
values
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  30, 'chore', now()),
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  50, 'chore', now() - interval '60 days'),
  ('55555555-5555-5555-5555-555555555555',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', -20, 'redemption', now()),
  ('66666666-6666-6666-6666-666666666666',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  20, 'chore', now()),
  ('66666666-6666-6666-6666-666666666666',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, 'chore', now() - interval '60 days');

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- 1. Two rows returned (kids only, no parent).
select is(
  (select count(*)::int from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  2, 'two kids ranked');

-- 2. Sara leads this week (30 > 20).
select is(
  (select display_name from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   order by week_rank limit 1),
  'Sara', 'Sara #1 this week');

-- 3. Lev leads all-time (120 > 80; -20 redemption doesn't count).
select is(
  (select display_name from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   order by all_time_rank limit 1),
  'Lev', 'Lev #1 all-time');

-- 4. Sara's week_stars = 30 (not 10).
select is(
  (select week_stars from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   where display_name='Sara'),
  30, 'Sara week_stars ignores the redemption');

-- 5. Lev's all_time_stars = 120.
select is(
  (select all_time_stars from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
   where display_name='Lev'),
  120, 'Lev all_time_stars correct');

-- 6. Single-kid family: delete Lev, expect one row no rank.
reset role;
delete from public.profiles where id='66666666-6666-6666-6666-666666666666';
set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from get_leaderboard('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1, 'single-kid family returns 1 row');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
supabase test db --file supabase/tests/45_get_leaderboard.sql
```

Expected: failure — `get_leaderboard` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260514000016_get_leaderboard_rpc.sql
-- Per-kid this-week + all-time star rankings within a family.
-- Earned-not-net: only positive star_ledger.delta rows count.
-- Week bucket: Monday 00:00 in family TZ.

create or replace function public.get_leaderboard(p_family_id uuid)
  returns table (
    profile_id     uuid,
    display_name   text,
    avatar_id      int,
    week_stars     int,
    all_time_stars int,
    week_rank      int,
    all_time_rank  int
  )
  language sql stable security invoker
  set search_path = public
as $$
  with family_tz as (
    select timezone from public.families where id = p_family_id
  ),
  week_start as (
    select (date_trunc(
              'week',
              (now() at time zone (select timezone from family_tz))
            ) at time zone (select timezone from family_tz)) as ts
  ),
  base as (
    select p.id           as profile_id,
           p.display_name,
           p.avatar_id,
           coalesce(sum(case
             when sl.delta > 0 and sl.created_at >= (select ts from week_start)
             then sl.delta else 0
           end), 0)::int as week_stars,
           coalesce(sum(case
             when sl.delta > 0 then sl.delta else 0
           end), 0)::int as all_time_stars
      from public.profiles p
      left join public.star_ledger sl on sl.profile_id = p.id
     where p.family_id = p_family_id
       and p.type      = 'kid'
     group by p.id, p.display_name, p.avatar_id
  )
  select profile_id, display_name, avatar_id, week_stars, all_time_stars,
         rank() over (order by week_stars     desc, all_time_stars desc,
                                display_name asc)::int as week_rank,
         rank() over (order by all_time_stars desc, display_name asc)::int as all_time_rank
    from base
   order by week_rank, display_name;
$$;

grant execute on function public.get_leaderboard(uuid) to authenticated;
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
supabase test db --file supabase/tests/45_get_leaderboard.sql
```

Expected: 6 assertions pass.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

```powershell
supabase test db
```

Expected: all pre-M8 tests still green + the new 5 test files (`38`–`45`).

- [ ] **Step 6: Commit**

```powershell
git add supabase/tests/45_get_leaderboard.sql supabase/migrations/20260514000016_get_leaderboard_rpc.sql
git commit -m "feat(db): get_leaderboard RPC — week+all-time, earned-not-net"
```

---

## Phase 6 — Mobile push UI

### Task 18: i18n keys for Notifications + new push events

**Files:**
- Modify: `mobile/src/i18n/locales/en.json`, `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add the new keys to `en.json`**

Open `mobile/src/i18n/locales/en.json` and add (or merge) a `notifications` block alongside the existing `settings` / `auth` / etc. blocks. Also add one label per event_type:

```json
"notifications": {
  "sectionTitle": "Notifications",
  "quietHoursLabel": "Quiet hours",
  "quietHoursHelp": "Pushes during these hours are queued and sent as one summary at the end of the window.",
  "enabledLabel": "Enabled",
  "startLabel": "Start",
  "endLabel": "End",
  "timezoneLabel": "Timezone",
  "muteSectionTitle": "Mute notifications",
  "muteSectionHelp": "Turn off notifications for specific events. Other parents in your family are unaffected.",
  "events": {
    "chore_submitted":     "Chore submitted",
    "chore_approved":      "Chore approved",
    "chore_rejected":      "Chore needs rework",
    "redemption_requested":"Reward requested",
    "redemption_approved": "Reward approved",
    "redemption_denied":   "Reward denied",
    "redemption_fulfilled":"Reward delivered",
    "achievement_unlocked":"Badge unlocked",
    "streak_milestone":    "Streak milestone",
    "goal_completed":      "Family goal reached"
  },
  "errors": {
    "invalidTimezone":     "We couldn't recognize that timezone.",
    "saveFailed":          "Couldn't save your changes — try again."
  }
}
```

- [ ] **Step 2: Add the mirrored Spanish keys to `es.json`**

```json
"notifications": {
  "sectionTitle": "Notificaciones",
  "quietHoursLabel": "Horario silencioso",
  "quietHoursHelp": "Las notificaciones en este horario se acumulan y llegan como un resumen al final.",
  "enabledLabel": "Activado",
  "startLabel": "Inicio",
  "endLabel": "Fin",
  "timezoneLabel": "Zona horaria",
  "muteSectionTitle": "Silenciar notificaciones",
  "muteSectionHelp": "Desactiva avisos de eventos específicos. No afecta a los demás padres de tu familia.",
  "events": {
    "chore_submitted":     "Tarea enviada",
    "chore_approved":      "Tarea aprobada",
    "chore_rejected":      "Tarea por corregir",
    "redemption_requested":"Premio solicitado",
    "redemption_approved": "Premio aprobado",
    "redemption_denied":   "Premio rechazado",
    "redemption_fulfilled":"Premio entregado",
    "achievement_unlocked":"Insignia ganada",
    "streak_milestone":    "Racha lograda",
    "goal_completed":      "Meta familiar lograda"
  },
  "errors": {
    "invalidTimezone":     "No reconocemos esa zona horaria.",
    "saveFailed":          "No pudimos guardar tus cambios — vuelve a intentarlo."
  }
}
```

- [ ] **Step 3: Run the translation parity test**

```powershell
cd mobile
npm test -- translationParity
```

Expected: all parity assertions pass (en.json + es.json have identical key shape).

- [ ] **Step 4: Commit**

```powershell
git add mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): i18n keys — notifications section + event-type labels"
```

---

### Task 19: QuietHoursPicker component

**Files:**
- Create: `mobile/src/components/QuietHoursPicker.tsx`
- Create: `mobile/tests/quietHoursPicker.test.tsx`

- [ ] **Step 1: Write the failing Jest test**

```tsx
// mobile/tests/quietHoursPicker.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QuietHoursPicker } from '../src/components/QuietHoursPicker';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

describe('QuietHoursPicker', () => {
  it('renders enabled toggle in initial state', () => {
    const { getByTestId } = render(
      <QuietHoursPicker
        enabled={true}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={jest.fn()}
      />,
    );
    expect(getByTestId('quiet-hours-toggle').props.value).toBe(true);
  });

  it('calls onSave with new values when Save tapped', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <QuietHoursPicker
        enabled={true}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={onSave}
      />,
    );
    fireEvent.press(getByTestId('quiet-hours-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      enabled: true, start: '21:00', end: '07:00', timezone: 'UTC',
    });
  });

  it('hides the time pickers when toggle is off', () => {
    const { queryByTestId } = render(
      <QuietHoursPicker
        enabled={false}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={jest.fn()}
      />,
    );
    expect(queryByTestId('quiet-hours-start-picker')).toBeNull();
    expect(queryByTestId('quiet-hours-end-picker')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
cd mobile
npm test -- quietHoursPicker
```

Expected: failure — module does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// mobile/src/components/QuietHoursPicker.tsx
import React, { useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, TextInput } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';

type Props = {
  enabled:   boolean;
  start:     string;   // "HH:MM"
  end:       string;
  timezone:  string;
  onSave:   (values: { enabled: boolean; start: string; end: string; timezone: string }) => Promise<void> | void;
};

export function QuietHoursPicker({ enabled, start, end, timezone, onSave }: Props) {
  const [vEnabled,  setVEnabled]  = useState(enabled);
  const [vStart,    setVStart]    = useState(start);
  const [vEnd,      setVEnd]      = useState(end);
  const [vTimezone, setVTimezone] = useState(timezone);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({ enabled: vEnabled, start: vStart, end: vEnd, timezone: vTimezone });
    } catch (e: any) {
      setError(e?.message ?? i18n.t('notifications.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{i18n.t('notifications.quietHoursLabel')}</Text>
      <Text style={styles.help}>{i18n.t('notifications.quietHoursHelp')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{i18n.t('notifications.enabledLabel')}</Text>
        <Switch
          testID="quiet-hours-toggle"
          value={vEnabled}
          onValueChange={setVEnabled}
        />
      </View>

      {vEnabled && (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.startLabel')}</Text>
            <TextInput
              testID="quiet-hours-start-picker"
              style={styles.input}
              value={vStart}
              onChangeText={setVStart}
              placeholder="21:00"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.endLabel')}</Text>
            <TextInput
              testID="quiet-hours-end-picker"
              style={styles.input}
              value={vEnd}
              onChangeText={setVEnd}
              placeholder="07:00"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.timezoneLabel')}</Text>
            <TextInput
              testID="quiet-hours-timezone-picker"
              style={styles.input}
              value={vTimezone}
              onChangeText={setVTimezone}
              autoCapitalize="none"
              placeholder="UTC"
            />
          </View>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        testID="quiet-hours-save"
        style={[styles.button, saving && styles.buttonDisabled]}
        disabled={saving}
        onPress={submit}
      >
        <Text style={styles.buttonText}>{saving ? '…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, gap: spacing.sm },
  heading:    { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
  help:       { fontSize: typography.small, color: colors.textMuted },
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label:      { fontSize: typography.body, color: colors.text, fontFamily: typography.fontFamily },
  input:      { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minWidth: 120, fontFamily: typography.fontFamily, color: colors.text },
  button:     { backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonDisabled: { backgroundColor: colors.primaryDark },
  buttonText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  error:      { color: colors.error, fontSize: typography.small },
});
```

The TextInput-based time entry is intentional for v1 — using a native time picker requires additional dependencies. The acceptance flow only checks that values round-trip to the DB; we can swap the TextInput for `@react-native-community/datetimepicker` in a polish pass.

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
npm test -- quietHoursPicker
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/components/QuietHoursPicker.tsx mobile/tests/quietHoursPicker.test.tsx
git commit -m "feat(mobile): QuietHoursPicker component + tests"
```

---

### Task 20: PushPrefsList component

**Files:**
- Create: `mobile/src/components/PushPrefsList.tsx`
- Create: `mobile/tests/pushPrefsList.test.tsx`

- [ ] **Step 1: Write the failing Jest test**

```tsx
// mobile/tests/pushPrefsList.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PushPrefsList, EVENT_TYPES } from '../src/components/PushPrefsList';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

describe('PushPrefsList', () => {
  it('renders one toggle per event_type', () => {
    const { getAllByRole } = render(
      <PushPrefsList prefs={{}} onTogglePref={jest.fn()} />,
    );
    expect(getAllByRole('switch').length).toBe(EVENT_TYPES.length);
  });

  it('treats missing keys as enabled', () => {
    const { getByTestId } = render(
      <PushPrefsList prefs={{}} onTogglePref={jest.fn()} />,
    );
    expect(getByTestId(`push-pref-toggle-${EVENT_TYPES[0]}`).props.value).toBe(true);
  });

  it('reflects explicit false as off', () => {
    const { getByTestId } = render(
      <PushPrefsList prefs={{ chore_submitted: false }} onTogglePref={jest.fn()} />,
    );
    expect(getByTestId('push-pref-toggle-chore_submitted').props.value).toBe(false);
  });

  it('calls onTogglePref with (event, nextValue) on flip', async () => {
    const onTogglePref = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <PushPrefsList prefs={{}} onTogglePref={onTogglePref} />,
    );
    fireEvent(getByTestId('push-pref-toggle-chore_submitted'), 'valueChange', false);
    await waitFor(() =>
      expect(onTogglePref).toHaveBeenCalledWith('chore_submitted', false),
    );
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
npm test -- pushPrefsList
```

Expected: failure — module does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// mobile/src/components/PushPrefsList.tsx
import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';

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
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

type Props = {
  prefs: Partial<Record<EventType, boolean>>;
  onTogglePref: (event: EventType, next: boolean) => Promise<void> | void;
};

export function PushPrefsList({ prefs, onTogglePref }: Props) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const isEnabled = (e: EventType) => prefs[e] !== false; // missing = true

  const handle = async (e: EventType, next: boolean) => {
    setPending((p) => ({ ...p, [e]: true }));
    try {
      await onTogglePref(e, next);
    } finally {
      setPending((p) => {
        const { [e]: _, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{i18n.t('notifications.muteSectionTitle')}</Text>
      <Text style={styles.help}>{i18n.t('notifications.muteSectionHelp')}</Text>
      {EVENT_TYPES.map((e) => (
        <View key={e} style={styles.row}>
          <Text style={styles.label}>{i18n.t(`notifications.events.${e}`)}</Text>
          <Switch
            testID={`push-pref-toggle-${e}`}
            disabled={!!pending[e]}
            value={isEnabled(e)}
            onValueChange={(next) => handle(e, next)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, marginTop: spacing.lg },
  heading: { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
  help:    { fontSize: typography.small, color: colors.textMuted, marginBottom: spacing.md },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  label:   { fontSize: typography.body, color: colors.text, fontFamily: typography.fontFamily, flex: 1 },
});
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
npm test -- pushPrefsList
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/components/PushPrefsList.tsx mobile/tests/pushPrefsList.test.tsx
git commit -m "feat(mobile): PushPrefsList — per-event mute toggles"
```

---

### Task 21: Wire Notifications section into settings.tsx

**Files:**
- Modify: `mobile/app/(app)/parent/settings.tsx`

- [ ] **Step 1: Read the existing settings.tsx to find the right insertion point**

```powershell
cd mobile
```

Open `mobile/app/(app)/parent/settings.tsx`. Locate the existing sections (Account, Language). The Notifications section goes between Language and Account so the order is: Language → Notifications → Account.

- [ ] **Step 2: Add imports + state + RPC handlers**

At the top of `settings.tsx`, alongside existing imports, add:

```ts
import { QuietHoursPicker } from '../../../src/components/QuietHoursPicker';
import { PushPrefsList } from '../../../src/components/PushPrefsList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

Inside the component body, add the query + mutations:

```ts
const qc = useQueryClient();

const familyQuery = useQuery({
  queryKey: ['family', familyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('families')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('id', familyId)
      .single();
    if (error) throw error;
    return data;
  },
  enabled: !!familyId,
});

const profileQuery = useQuery({
  queryKey: ['profile-push-prefs', profileId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('push_prefs')
      .eq('id', profileId)
      .single();
    if (error) throw error;
    return data?.push_prefs ?? {};
  },
  enabled: !!profileId,
});

const saveQuietHours = useMutation({
  mutationFn: async (v: { enabled: boolean; start: string; end: string; timezone: string }) => {
    const { error } = await supabase.rpc('set_quiet_hours', {
      p_enabled: v.enabled, p_start: v.start, p_end: v.end, p_timezone: v.timezone,
    });
    if (error) throw new Error(error.message);
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ['family', familyId] }),
});

const togglePushPref = useMutation({
  mutationFn: async (v: { event: string; enabled: boolean }) => {
    const { error } = await supabase.rpc('set_push_pref', {
      p_event_type: v.event, p_enabled: v.enabled,
    });
    if (error) throw new Error(error.message);
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-push-prefs', profileId] }),
});
```

Adjust `familyId` and `profileId` references to the names already in scope in `settings.tsx` (likely from `useFamily()` / `useAuth()`).

- [ ] **Step 3: Render the Notifications section in JSX**

Between the Language section and the Account section, add:

```tsx
<View style={styles.section}>
  <Text style={styles.sectionTitle}>{i18n.t('notifications.sectionTitle')}</Text>

  {familyQuery.data && (
    <QuietHoursPicker
      enabled={familyQuery.data.quiet_hours_enabled}
      start={familyQuery.data.quiet_hours_start}
      end={familyQuery.data.quiet_hours_end}
      timezone={familyQuery.data.timezone}
      onSave={(v) => saveQuietHours.mutateAsync(v)}
    />
  )}

  {profileQuery.data && (
    <PushPrefsList
      prefs={profileQuery.data}
      onTogglePref={(event, enabled) =>
        togglePushPref.mutateAsync({ event, enabled })
      }
    />
  )}
</View>
```

- [ ] **Step 4: Run typecheck + relevant tests**

```powershell
npx tsc --noEmit
npm test -- quietHoursPicker pushPrefsList
```

Expected: no TS errors; component tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/app/(app)/parent/settings.tsx
git commit -m "feat(mobile): settings — Notifications section (quiet hours + mute prefs)"
```

---

## Phase 7 — Mobile leaderboard

### Task 22: i18n keys for leaderboard

**Files:**
- Modify: `mobile/src/i18n/locales/en.json`, `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add `leaderboard` block to `en.json`**

```json
"leaderboard": {
  "title":          "Leaderboard",
  "tabThisWeek":    "This Week",
  "tabAllTime":     "All Time",
  "starsLabel":     "stars",
  "starsThisWeek":  "{{count}}⭐ this week",
  "starsAllTime":   "{{count}}⭐ all time",
  "soloFallback":   "You're flying solo this week — keep it up!",
  "medalGoldAlt":   "1st place",
  "medalSilverAlt": "2nd place",
  "medalBronzeAlt": "3rd place",
  "emptyState":     "No stars earned yet. Approve some chores to get on the board!"
}
```

- [ ] **Step 2: Add mirrored `es.json`**

```json
"leaderboard": {
  "title":          "Ranking",
  "tabThisWeek":    "Esta semana",
  "tabAllTime":     "Histórico",
  "starsLabel":     "estrellas",
  "starsThisWeek":  "{{count}}⭐ esta semana",
  "starsAllTime":   "{{count}}⭐ histórico",
  "soloFallback":   "Vas en solitario esta semana — ¡sigue así!",
  "medalGoldAlt":   "1.º lugar",
  "medalSilverAlt": "2.º lugar",
  "medalBronzeAlt": "3.º lugar",
  "emptyState":     "Aún no hay estrellas. Aprueba algunas tareas para empezar."
}
```

- [ ] **Step 3: Run translation parity test + commit**

```powershell
npm test -- translationParity
git add mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): i18n keys — leaderboard"
```

---

### Task 23: useLeaderboard hook

**Files:**
- Create: `mobile/src/hooks/useLeaderboard.ts`

- [ ] **Step 1: Implement**

```ts
// mobile/src/hooks/useLeaderboard.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type LeaderboardRow = {
  profile_id:     string;
  display_name:   string;
  avatar_id:      number;
  week_stars:     number;
  all_time_stars: number;
  week_rank:      number;
  all_time_rank:  number;
};

export function useLeaderboard(familyId: string | undefined) {
  return useQuery({
    queryKey: ['leaderboard', familyId],
    enabled:  !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_family_id: familyId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add mobile/src/hooks/useLeaderboard.ts
git commit -m "feat(mobile): useLeaderboard hook (TanStack Query)"
```

---

### Task 24: LeaderboardList component

**Files:**
- Create: `mobile/src/components/LeaderboardList.tsx`
- Create: `mobile/tests/leaderboardList.test.tsx`

- [ ] **Step 1: Write the failing Jest test**

```tsx
// mobile/tests/leaderboardList.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { LeaderboardList } from '../src/components/LeaderboardList';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string, v?: any) => (v?.count != null ? `${k}:${v.count}` : k) },
}));

const ROWS = [
  { profile_id: 'a', display_name: 'Sara', avatar_id: 1,
    week_stars: 30, all_time_stars: 80, week_rank: 1, all_time_rank: 2 },
  { profile_id: 'b', display_name: 'Lev', avatar_id: 2,
    week_stars: 20, all_time_stars: 120, week_rank: 2, all_time_rank: 1 },
];

describe('LeaderboardList', () => {
  it('renders rows sorted by week_rank when scope=week', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="week" />,
    );
    const names = getAllByTestId('leaderboard-name').map((n) => n.props.children);
    expect(names).toEqual(['Sara', 'Lev']);
  });

  it('renders rows sorted by all_time_rank when scope=allTime', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="allTime" />,
    );
    const names = getAllByTestId('leaderboard-name').map((n) => n.props.children);
    expect(names).toEqual(['Lev', 'Sara']);
  });

  it('renders gold medal for rank 1 only', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="week" />,
    );
    const medals = getAllByTestId('leaderboard-medal');
    expect(medals[0].props.children).toBe('🥇');
    expect(medals[1].props.children).toBe('🥈');
  });

  it('hides medals for single-row data', () => {
    const { queryAllByTestId } = render(
      <LeaderboardList rows={[ROWS[0]]} scope="week" />,
    );
    expect(queryAllByTestId('leaderboard-medal').length).toBe(0);
  });

  it('shows solo fallback copy for single-row data', () => {
    const { getByText } = render(
      <LeaderboardList rows={[ROWS[0]]} scope="week" />,
    );
    expect(getByText('leaderboard.soloFallback')).toBeTruthy();
  });

  it('shows empty-state copy for zero rows', () => {
    const { getByText } = render(
      <LeaderboardList rows={[]} scope="week" />,
    );
    expect(getByText('leaderboard.emptyState')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
npm test -- leaderboardList
```

Expected: failure — module does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// mobile/src/components/LeaderboardList.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';
import type { LeaderboardRow } from '../hooks/useLeaderboard';

type Props = {
  rows:  LeaderboardRow[];
  scope: 'week' | 'allTime';
};

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function LeaderboardList({ rows, scope }: Props) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{i18n.t('leaderboard.emptyState')}</Text>
      </View>
    );
  }

  const isSolo = rows.length === 1;
  const sorted = [...rows].sort((a, b) =>
    scope === 'week' ? a.week_rank - b.week_rank : a.all_time_rank - b.all_time_rank,
  );

  return (
    <View>
      {isSolo && <Text style={styles.solo}>{i18n.t('leaderboard.soloFallback')}</Text>}
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.profile_id}
        renderItem={({ item }) => {
          const rank = scope === 'week' ? item.week_rank : item.all_time_rank;
          const stars = scope === 'week' ? item.week_stars : item.all_time_stars;
          return (
            <View style={styles.row}>
              {!isSolo && (
                <Text testID="leaderboard-medal" style={styles.medal}>
                  {MEDALS[rank] ?? `#${rank}`}
                </Text>
              )}
              <Text testID="leaderboard-name" style={styles.name}>{item.display_name}</Text>
              <Text style={styles.stars}>
                {i18n.t(scope === 'week' ? 'leaderboard.starsThisWeek' : 'leaderboard.starsAllTime',
                        { count: stars })}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
            padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm, gap: spacing.md },
  medal:  { fontSize: typography.h1 },
  name:   { flex: 1, fontSize: typography.body, fontFamily: typography.fontFamilyBold, color: colors.text },
  stars:  { fontSize: typography.body, color: colors.textMuted, fontFamily: typography.fontFamily },
  solo:   { fontSize: typography.body, color: colors.textMuted, textAlign: 'center',
            padding: spacing.md, fontFamily: typography.fontFamily },
  empty:  { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: typography.body, color: colors.textMuted, textAlign: 'center',
               fontFamily: typography.fontFamily },
});
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
npm test -- leaderboardList
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/components/LeaderboardList.tsx mobile/tests/leaderboardList.test.tsx
git commit -m "feat(mobile): LeaderboardList — medals, solo fallback, empty state"
```

---

### Task 25: Leaderboard screens (parent + kid) + Settings link

**Files:**
- Create: `mobile/app/(app)/parent/leaderboard.tsx`
- Create: `mobile/app/(app)/kid/[profileId]/leaderboard.tsx`
- Modify: `mobile/app/(app)/parent/_layout.tsx` (register route)
- Modify: `mobile/app/(app)/parent/settings.tsx` (add link)
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx` (add header link)

- [ ] **Step 1: Create the parent leaderboard screen**

```tsx
// mobile/app/(app)/parent/leaderboard.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import i18n from '../../../src/i18n';
import { useFamily } from '../../../src/hooks/useFamily';
import { useLeaderboard } from '../../../src/hooks/useLeaderboard';
import { LeaderboardList } from '../../../src/components/LeaderboardList';
import { colors, spacing, typography, radii } from '../../../src/theme';

export default function ParentLeaderboardScreen() {
  const { familyId } = useFamily();
  const { data, isLoading } = useLeaderboard(familyId);
  const [scope, setScope] = useState<'week' | 'allTime'>('week');

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('leaderboard.title')}</Text>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setScope('week')}
          style={[styles.tab, scope === 'week' && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === 'week' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabThisWeek')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setScope('allTime')}
          style={[styles.tab, scope === 'allTime' && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === 'allTime' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabAllTime')}
          </Text>
        </Pressable>
      </View>

      {!isLoading && <LeaderboardList rows={data ?? []} scope={scope} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:  { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text,
            marginBottom: spacing.md },
  tabs:   { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill,
            padding: spacing.xs, marginBottom: spacing.md },
  tab:    { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.pill },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontFamily: typography.fontFamily },
  tabTextActive: { color: '#fff', fontFamily: typography.fontFamilyBold },
});
```

- [ ] **Step 2: Create the kid leaderboard screen**

```tsx
// mobile/app/(app)/kid/[profileId]/leaderboard.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import i18n from '../../../../src/i18n';
import { useFamily } from '../../../../src/hooks/useFamily';
import { useLeaderboard } from '../../../../src/hooks/useLeaderboard';
import { LeaderboardList } from '../../../../src/components/LeaderboardList';
import { colors, spacing, typography, radii } from '../../../../src/theme';

export default function KidLeaderboardScreen() {
  const { familyId } = useFamily();
  const { data, isLoading } = useLeaderboard(familyId);
  const [scope, setScope] = useState<'week' | 'allTime'>('week');

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('leaderboard.title')}</Text>
      <View style={styles.tabs}>
        <Pressable onPress={() => setScope('week')}
                   style={[styles.tab, scope === 'week' && styles.tabActive]}>
          <Text style={[styles.tabText, scope === 'week' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabThisWeek')}
          </Text>
        </Pressable>
        <Pressable onPress={() => setScope('allTime')}
                   style={[styles.tab, scope === 'allTime' && styles.tabActive]}>
          <Text style={[styles.tabText, scope === 'allTime' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabAllTime')}
          </Text>
        </Pressable>
      </View>
      {!isLoading && <LeaderboardList rows={data ?? []} scope={scope} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:  { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text,
            marginBottom: spacing.md },
  tabs:   { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill,
            padding: spacing.xs, marginBottom: spacing.md },
  tab:    { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.pill },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontFamily: typography.fontFamily },
  tabTextActive: { color: '#fff', fontFamily: typography.fontFamilyBold },
});
```

- [ ] **Step 3: Register the parent route**

In `mobile/app/(app)/parent/_layout.tsx`, in the Stack screen list, add:

```tsx
<Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
```

If the layout uses Tabs at this level instead of Stack, register `leaderboard` under a nested Stack alongside the existing settings screen — match whichever pattern existing sub-screens (chores/index, rewards/index) use.

- [ ] **Step 4: Add a "Leaderboard" link in parent Settings**

In `mobile/app/(app)/parent/settings.tsx`, add a row in the layout (e.g., above the Account section):

```tsx
<Pressable onPress={() => router.push('/(app)/parent/leaderboard')}>
  <Text style={styles.linkRow}>{i18n.t('leaderboard.title')}</Text>
</Pressable>
```

Adjust paths/styles to match the file's existing patterns.

- [ ] **Step 5: Add a Leaderboard header link to kid home**

In `mobile/app/(app)/kid/[profileId]/index.tsx`, alongside the existing Rewards + Badges header links, add:

```tsx
<Pressable onPress={() => router.push(`/(app)/kid/${profileId}/leaderboard`)}>
  <Text style={styles.headerLink}>{i18n.t('leaderboard.title')}</Text>
</Pressable>
```

- [ ] **Step 6: Typecheck + commit**

```powershell
npx tsc --noEmit
git add mobile/app/(app)/parent/leaderboard.tsx mobile/app/(app)/kid/[profileId]/leaderboard.tsx mobile/app/(app)/parent/_layout.tsx mobile/app/(app)/parent/settings.tsx mobile/app/(app)/kid/[profileId]/index.tsx
git commit -m "feat(mobile): leaderboard screens (parent + kid) + nav wiring"
```

---

## Phase 8 — Mobile family goals

### Task 26: i18n keys for goals

**Files:**
- Modify: `mobile/src/i18n/locales/en.json`, `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add `goals` block to `en.json`**

```json
"goals": {
  "title":             "Family Goals",
  "active":            "Active goal",
  "noActive":          "No active goal — create one to get started.",
  "createTitle":       "Create a family goal",
  "titleLabel":        "Goal name",
  "titlePlaceholder":  "Pizza Night",
  "targetLabel":       "Target stars",
  "descriptionLabel":  "Description (optional)",
  "descriptionPlaceholder": "Mom orders pizza Friday",
  "createButton":      "Create goal",
  "cancelButton":      "Cancel goal",
  "cancelConfirm":     "Cancel this goal? Progress will be lost.",
  "completedBanner":   "Goal reached: {{title}} 🎉",
  "progressRemaining": "{{count}} to go",
  "progressDone":      "Complete!",
  "archiveTitle":      "Past goals",
  "archiveEmpty":      "No past goals yet.",
  "errors": {
    "alreadyActive":   "There's already an active goal. Cancel it before creating a new one.",
    "createFailed":    "Couldn't create the goal — try again."
  }
}
```

- [ ] **Step 2: Mirrored `es.json`**

```json
"goals": {
  "title":             "Metas familiares",
  "active":            "Meta activa",
  "noActive":          "Sin meta activa — crea una para comenzar.",
  "createTitle":       "Crear una meta familiar",
  "titleLabel":        "Nombre de la meta",
  "titlePlaceholder":  "Noche de pizza",
  "targetLabel":       "Estrellas objetivo",
  "descriptionLabel":  "Descripción (opcional)",
  "descriptionPlaceholder": "Mamá pide pizza el viernes",
  "createButton":      "Crear meta",
  "cancelButton":      "Cancelar meta",
  "cancelConfirm":     "¿Cancelar esta meta? Se perderá el progreso.",
  "completedBanner":   "¡Meta lograda: {{title}} 🎉",
  "progressRemaining": "Faltan {{count}}",
  "progressDone":      "¡Completada!",
  "archiveTitle":      "Metas anteriores",
  "archiveEmpty":      "Aún no hay metas pasadas.",
  "errors": {
    "alreadyActive":   "Ya hay una meta activa. Cancélala antes de crear otra.",
    "createFailed":    "No pudimos crear la meta — vuelve a intentarlo."
  }
}
```

- [ ] **Step 3: Run parity + commit**

```powershell
cd mobile
npm test -- translationParity
git add mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): i18n keys — family goals"
```

---

### Task 27: useActiveGoal hook

**Files:**
- Create: `mobile/src/hooks/useActiveGoal.ts`

- [ ] **Step 1: Implement**

```ts
// mobile/src/hooks/useActiveGoal.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type ActiveGoal = {
  id:             string;
  family_id:      string;
  title:          string;
  description:    string | null;
  target_stars:   number;
  status:         'active' | 'completed' | 'canceled';
  created_by:     string;
  created_at:     string;
  completed_at:   string | null;
  progress_stars: number;
};

export function useActiveGoal(familyId: string | undefined) {
  return useQuery({
    queryKey: ['active-goal', familyId],
    enabled:  !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_goal', {
        p_family_id: familyId,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ActiveGoal[];
      return rows[0] ?? null;
    },
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```powershell
npx tsc --noEmit
git add mobile/src/hooks/useActiveGoal.ts
git commit -m "feat(mobile): useActiveGoal hook with computed progress"
```

---

### Task 28: GoalCard component

**Files:**
- Create: `mobile/src/components/GoalCard.tsx`
- Create: `mobile/tests/goalCard.test.tsx`

- [ ] **Step 1: Write the failing Jest test**

```tsx
// mobile/tests/goalCard.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { GoalCard } from '../src/components/GoalCard';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string, v?: any) => (v?.count != null ? `${k}:${v.count}` : v?.title ? `${k}:${v.title}` : k) },
}));

const GOAL = {
  id: 'g1', family_id: 'f1', title: 'Pizza Night',
  description: null, target_stars: 100, status: 'active' as const,
  created_by: 'p1', created_at: '2026-05-01T00:00:00Z',
  completed_at: null, progress_stars: 40,
};

describe('GoalCard', () => {
  it('renders title and target stars', () => {
    const { getByText } = render(<GoalCard goal={GOAL} />);
    expect(getByText('Pizza Night')).toBeTruthy();
  });

  it('shows remaining count when not complete', () => {
    const { getByText } = render(<GoalCard goal={GOAL} />);
    expect(getByText('goals.progressRemaining:60')).toBeTruthy();
  });

  it('shows complete copy when progress >= target', () => {
    const { getByText } = render(
      <GoalCard goal={{ ...GOAL, progress_stars: 120 }} />,
    );
    expect(getByText('goals.progressDone')).toBeTruthy();
  });

  it('progress bar width caps at 100%', () => {
    const { getByTestId } = render(
      <GoalCard goal={{ ...GOAL, progress_stars: 250 }} />,
    );
    const fill = getByTestId('goal-progress-fill');
    expect(fill.props.style).toEqual(expect.objectContaining({ width: '100%' }));
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```powershell
npm test -- goalCard
```

Expected: failure — module does not exist.

- [ ] **Step 3: Implement the component**

```tsx
// mobile/src/components/GoalCard.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';
import type { ActiveGoal } from '../hooks/useActiveGoal';

type Props = {
  goal:    ActiveGoal;
  onPress?: () => void;
};

export function GoalCard({ goal, onPress }: Props) {
  const pct = Math.min(100, Math.round((goal.progress_stars / goal.target_stars) * 100));
  const done = goal.progress_stars >= goal.target_stars;

  const body = (
    <View style={styles.card}>
      <Text style={styles.label}>{i18n.t('goals.active')}</Text>
      <Text style={styles.title}>{goal.title}</Text>
      <View style={styles.barTrack}>
        <View testID="goal-progress-fill" style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {done
          ? i18n.t('goals.progressDone')
          : i18n.t('goals.progressRemaining', { count: goal.target_stars - goal.progress_stars })}
      </Text>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  card:       { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, gap: spacing.sm },
  label:      { fontSize: typography.tiny, color: colors.textMuted, textTransform: 'uppercase',
                fontFamily: typography.fontFamilyBold, letterSpacing: 1 },
  title:      { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
  barTrack:   { height: 10, backgroundColor: colors.border, borderRadius: radii.pill, overflow: 'hidden' },
  barFill:    { height: 10, backgroundColor: colors.primary, borderRadius: radii.pill },
  progressText: { fontSize: typography.small, color: colors.textMuted, fontFamily: typography.fontFamily },
});
```

- [ ] **Step 4: Run the test, confirm it passes**

```powershell
npm test -- goalCard
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/components/GoalCard.tsx mobile/tests/goalCard.test.tsx
git commit -m "feat(mobile): GoalCard — active-goal progress with cap"
```

---

### Task 29: parent/goals/create.tsx + tests

**Files:**
- Create: `mobile/app/(app)/parent/goals/_layout.tsx`
- Create: `mobile/app/(app)/parent/goals/create.tsx`
- Create: `mobile/tests/createGoalScreen.test.tsx`

- [ ] **Step 1: Create the goals sub-layout**

```tsx
// mobile/app/(app)/parent/goals/_layout.tsx
import { Stack } from 'expo-router';
export default function GoalsLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// mobile/tests/createGoalScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateGoalScreen from '../app/(app)/parent/goals/create';

const mockRpc = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: (...args: any[]) => mockRpc(...args) },
}));
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

describe('CreateGoalScreen', () => {
  beforeEach(() => mockRpc.mockReset());

  it('submits create_family_goal with form values', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'g1' }, error: null });
    const { getByTestId } = render(<CreateGoalScreen />);
    fireEvent.changeText(getByTestId('goal-title-input'), 'Pizza');
    fireEvent.changeText(getByTestId('goal-target-input'), '100');
    fireEvent.press(getByTestId('goal-create-button'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('create_family_goal', {
      p_title: 'Pizza', p_target_stars: 100, p_description: null,
    }));
  });

  it('renders alreadyActive copy when RPC returns that error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'already_active' } });
    const { getByTestId, findByText } = render(<CreateGoalScreen />);
    fireEvent.changeText(getByTestId('goal-title-input'), 'Pizza');
    fireEvent.changeText(getByTestId('goal-target-input'), '100');
    fireEvent.press(getByTestId('goal-create-button'));
    expect(await findByText('goals.errors.alreadyActive')).toBeTruthy();
  });

  it('disables the button when title is empty', () => {
    const { getByTestId } = render(<CreateGoalScreen />);
    expect(getByTestId('goal-create-button').props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

```powershell
npm test -- createGoalScreen
```

Expected: failure — module does not exist.

- [ ] **Step 4: Implement the screen**

```tsx
// mobile/app/(app)/parent/goals/create.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import i18n from '../../../../src/i18n';
import { supabase } from '../../../../src/lib/supabase';
import { colors, spacing, radii, typography } from '../../../../src/theme';

export default function CreateGoalScreen() {
  const [title,        setTitle]        = useState('');
  const [targetStr,    setTargetStr]    = useState('');
  const [description,  setDescription]  = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [errorKey,     setErrorKey]     = useState<string | null>(null);

  const targetStars = parseInt(targetStr, 10);
  const canSubmit = title.trim().length > 0 && Number.isFinite(targetStars) && targetStars > 0;

  const submit = async () => {
    setSubmitting(true); setErrorKey(null);
    const { error } = await supabase.rpc('create_family_goal', {
      p_title: title.trim(),
      p_target_stars: targetStars,
      p_description: description.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setErrorKey(error.message === 'already_active'
        ? 'goals.errors.alreadyActive'
        : 'goals.errors.createFailed');
      return;
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('goals.createTitle')}</Text>

      <Text style={styles.label}>{i18n.t('goals.titleLabel')}</Text>
      <TextInput
        testID="goal-title-input"
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={i18n.t('goals.titlePlaceholder')}
      />

      <Text style={styles.label}>{i18n.t('goals.targetLabel')}</Text>
      <TextInput
        testID="goal-target-input"
        style={styles.input}
        value={targetStr}
        onChangeText={setTargetStr}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>{i18n.t('goals.descriptionLabel')}</Text>
      <TextInput
        testID="goal-description-input"
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t('goals.descriptionPlaceholder')}
        multiline
      />

      {errorKey && <Text style={styles.error}>{i18n.t(errorKey)}</Text>}

      <Pressable
        testID="goal-create-button"
        accessibilityState={{ disabled: !canSubmit || submitting }}
        disabled={!canSubmit || submitting}
        onPress={submit}
        style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>
          {submitting ? '…' : i18n.t('goals.createButton')}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:    { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text,
              marginBottom: spacing.lg },
  label:    { fontSize: typography.small, color: colors.textMuted, marginTop: spacing.md,
              marginBottom: spacing.xs, fontFamily: typography.fontFamilyBold },
  input:    { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              backgroundColor: colors.surface, color: colors.text,
              fontFamily: typography.fontFamily, fontSize: typography.body },
  multiline:{ minHeight: 80, textAlignVertical: 'top' },
  button:   { backgroundColor: colors.primary, borderRadius: radii.pill,
              paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl },
  buttonDisabled: { backgroundColor: colors.primaryDark, opacity: 0.5 },
  buttonText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  error:    { color: colors.error, marginTop: spacing.md, fontSize: typography.small },
});
```

- [ ] **Step 5: Run the test, confirm it passes**

```powershell
npm test -- createGoalScreen
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add mobile/app/(app)/parent/goals/_layout.tsx mobile/app/(app)/parent/goals/create.tsx mobile/tests/createGoalScreen.test.tsx
git commit -m "feat(mobile): create-goal screen with already_active handling"
```

---

### Task 30: parent/goals/index.tsx + active card wiring on home

**Files:**
- Create: `mobile/app/(app)/parent/goals/index.tsx`
- Modify: `mobile/app/(app)/parent/index.tsx` — render `<GoalCard />` above chore list when active
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx` — render `<GoalCard />` at top
- Modify: `mobile/app/(app)/parent/settings.tsx` — add Goals link
- Modify: `mobile/app/(app)/parent/_layout.tsx` — register goals sub-route

- [ ] **Step 1: Create the goals index (active + archive list)**

```tsx
// mobile/app/(app)/parent/goals/index.tsx
import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import i18n from '../../../../src/i18n';
import { useFamily } from '../../../../src/hooks/useFamily';
import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../../src/components/GoalCard';
import { supabase } from '../../../../src/lib/supabase';
import { colors, spacing, radii, typography } from '../../../../src/theme';

export default function GoalsScreen() {
  const { familyId } = useFamily();
  const active = useActiveGoal(familyId);

  const archive = useQuery({
    queryKey: ['goals-archive', familyId],
    enabled:  !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_goals')
        .select('id, title, target_stars, status, completed_at, created_at')
        .eq('family_id', familyId)
        .in('status', ['completed', 'canceled'])
        .order('completed_at', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cancelMutation = async () => {
    if (!active.data) return;
    await supabase.rpc('cancel_family_goal', { p_goal_id: active.data.id });
    active.refetch();
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('goals.title')}</Text>

      {active.data ? (
        <View>
          <GoalCard goal={active.data} />
          <Pressable onPress={cancelMutation} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{i18n.t('goals.cancelButton')}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.empty}>{i18n.t('goals.noActive')}</Text>
          <Pressable
            onPress={() => router.push('/(app)/parent/goals/create')}
            style={styles.createBtn}
          >
            <Text style={styles.createText}>{i18n.t('goals.createButton')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.archiveTitle}>{i18n.t('goals.archiveTitle')}</Text>
      <FlatList
        data={archive.data ?? []}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={<Text style={styles.empty}>{i18n.t('goals.archiveEmpty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.archiveRow}>
            <Text style={styles.archiveItemTitle}>{item.title}</Text>
            <Text style={styles.archiveItemMeta}>
              {item.status} · {item.target_stars}⭐
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:   { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text,
             marginBottom: spacing.md },
  empty:   { fontSize: typography.body, color: colors.textMuted, fontFamily: typography.fontFamily,
             padding: spacing.lg, textAlign: 'center' },
  createBtn: { backgroundColor: colors.primary, borderRadius: radii.pill,
               paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  createText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  cancelBtn: { padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.error, fontFamily: typography.fontFamilyBold },
  archiveTitle: { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text,
                  marginTop: spacing.xl, marginBottom: spacing.md },
  archiveRow: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radii.md,
                marginBottom: spacing.sm },
  archiveItemTitle: { fontSize: typography.body, fontFamily: typography.fontFamilyBold, color: colors.text },
  archiveItemMeta: { fontSize: typography.small, color: colors.textMuted },
});
```

- [ ] **Step 2: Render `<GoalCard />` on parent home**

In `mobile/app/(app)/parent/index.tsx`, near the top of the JSX (above the chore list), add:

```tsx
import { useActiveGoal } from '../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../src/components/GoalCard';
// ... inside the component, near useFamily()
const activeGoal = useActiveGoal(familyId);
// ... in render, near top of the list:
{activeGoal.data && (
  <Pressable onPress={() => router.push('/(app)/parent/goals')}>
    <GoalCard goal={activeGoal.data} />
  </Pressable>
)}
```

- [ ] **Step 3: Render `<GoalCard />` on kid home**

In `mobile/app/(app)/kid/[profileId]/index.tsx`, similarly:

```tsx
import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../../src/components/GoalCard';
// inside component:
const activeGoal = useActiveGoal(familyId);
// in JSX, top of main content:
{activeGoal.data && <GoalCard goal={activeGoal.data} />}
```

- [ ] **Step 4: Add a "Family Goals" link in parent Settings**

In `mobile/app/(app)/parent/settings.tsx`, near the Leaderboard link, add:

```tsx
<Pressable onPress={() => router.push('/(app)/parent/goals')}>
  <Text style={styles.linkRow}>{i18n.t('goals.title')}</Text>
</Pressable>
```

- [ ] **Step 5: Register routes in parent layout**

In `mobile/app/(app)/parent/_layout.tsx`, add the goals folder to the navigation tree (Expo Router auto-discovers `goals/_layout.tsx`, so no manual registration is needed in most setups — verify the route is reachable after `expo start`).

- [ ] **Step 6: Typecheck + commit**

```powershell
npx tsc --noEmit
git add mobile/app/(app)/parent/goals/index.tsx mobile/app/(app)/parent/index.tsx mobile/app/(app)/kid/[profileId]/index.tsx mobile/app/(app)/parent/settings.tsx mobile/app/(app)/parent/_layout.tsx
git commit -m "feat(mobile): goals index screen + GoalCard on home screens + Settings link"
```

---

## Phase 9 — Realtime + banner extensions

### Task 31: AchievementBanner variant for goal_completed

**Files:**
- Modify: `mobile/src/components/AchievementBanner.tsx`

- [ ] **Step 1: Read the existing component**

Open `mobile/src/components/AchievementBanner.tsx`. It currently listens to the M6 event bus for `achievement_unlocked` and renders an overlay with emoji + title + description + confetti. The gating to `useSegments().includes('kid')` (per M6 late fix `df44d09`) stays as is.

- [ ] **Step 2: Add a `goal_completed` event handler**

In the component, alongside the existing `achievement_unlocked` listener, subscribe to a new event:

```ts
import i18n from '../i18n';

// In the existing useEffect that subscribes to the event bus, add:
const offGoal = eventBus.on('goal_completed', (payload: { title: string }) => {
  queueRef.current.push({
    kind:        'goal',
    emoji:       '🎉',
    title:       i18n.t('goals.completedBanner', { title: payload.title }),
    description: '',
  });
  scheduleShow();
});
// Add `offGoal()` to the existing cleanup return.
```

The banner's render path remains unchanged — it already handles items with `emoji + title + description`. Adding `kind: 'goal'` is optional metadata for any future styling difference.

- [ ] **Step 3: Update the banner's TypeScript discriminator (if it uses one)**

If the banner item type is currently `{ kind: 'achievement'; ... }`, widen to `{ kind: 'achievement' | 'goal'; ... }`. If it's untyped, no change needed.

- [ ] **Step 4: Typecheck + commit**

```powershell
cd mobile
npx tsc --noEmit
git add mobile/src/components/AchievementBanner.tsx
git commit -m "feat(mobile): AchievementBanner — goal_completed variant"
```

---

### Task 32: Extend subscribeToFamily with family_goals listener

**Files:**
- Modify: `mobile/src/lib/realtime.ts`

- [ ] **Step 1: Locate the existing subscribeToFamily**

Open `mobile/src/lib/realtime.ts`. It currently registers `postgres_changes` listeners for `chore_instances`, `redemptions`, `star_ledger`, and `achievements` (per M5 + M6), and invalidates corresponding TanStack Query keys. The achievement listener also emits to the event bus.

- [ ] **Step 2: Add the family_goals listener**

Inside `subscribeToFamily`, add a 5th `.on('postgres_changes', ...)` registration:

```ts
.on(
  'postgres_changes',
  {
    event:  '*',
    schema: 'public',
    table:  'family_goals',
    filter: `family_id=eq.${familyId}`,
  },
  (payload) => {
    queryClient.invalidateQueries({ queryKey: ['active-goal', familyId] });
    queryClient.invalidateQueries({ queryKey: ['goals-archive', familyId] });

    if (
      payload.eventType === 'UPDATE' &&
      payload.old?.status === 'active' &&
      payload.new?.status === 'completed'
    ) {
      eventBus.emit('goal_completed', { title: payload.new.title });
    }
  },
)
```

- [ ] **Step 3: Ensure the existing star_ledger listener also invalidates leaderboard + active-goal queries**

Find the `star_ledger` listener and add to its handler body:

```ts
queryClient.invalidateQueries({ queryKey: ['leaderboard', familyId] });
queryClient.invalidateQueries({ queryKey: ['active-goal', familyId] });
```

These are no-ops for screens that aren't mounted, so the cost is trivial.

- [ ] **Step 4: Typecheck + commit**

```powershell
npx tsc --noEmit
git add mobile/src/lib/realtime.ts
git commit -m "feat(mobile): realtime — family_goals listener + leaderboard/active-goal invalidations"
```

---

## Phase 10 — Acceptance

### Task 33: Manual acceptance + commit log review

This task is manual. Run on Android emulator first; iOS is deferred until Apple Dev clears (M7 prerequisite).

- [ ] **Step 1: Run the full pgTAP suite one more time**

```powershell
cd C:\Users\USUARIO\Desktop\Shores
supabase test db
```

Expected: all M1–M8 tests green, including the 8 new files `38_…` through `45_…`.

- [ ] **Step 2: Run the full Jest suite**

```powershell
cd mobile
npm test -- --watchAll=false
```

Expected: all suites pass, including the 5 new M8 suites (`quietHoursPicker`, `pushPrefsList`, `leaderboardList`, `goalCard`, `createGoalScreen`).

- [ ] **Step 3: Launch Expo + walk through exit criteria 1 (quiet hours)**

```powershell
npx expo start --clear
```

In the Android emulator with a two-parent + two-kid family:
1. Parent → Settings → Notifications → enable quiet hours, set to a narrow window covering current time, save.
2. Have a kid submit a chore.
3. Check `push_outbox` via `supabase db query "select id, status, scheduled_for from push_outbox order by enqueued_at desc limit 5"` — row should be `pending` with `scheduled_for` set to the end of the window.
4. Wait until after the end-of-window, or move the family's quiet_hours_end back a few minutes. The next cron tick should drain → both parents get a push (or a collapsed summary if multiple events fired).

- [ ] **Step 4: Exit criterion 2 (per-event mute)**

1. Parent A → Settings → Notifications → toggle off "Reward requested".
2. Kid → requests a reward.
3. Parent B receives a push; Parent A does not.
4. Verify via `supabase db query "select recipient_id, status from push_outbox where event_type='redemption_requested' order by enqueued_at desc limit 4"`.

- [ ] **Step 5: Exit criterion 3 (push retry)**

Hard to simulate cleanly without breaking Expo. Instead, manually INSERT a row with `attempts=2, max_attempts=3, status='sending', sending_since=now()-interval '10 minutes'` and run `select drain_push_outbox()`. Confirm it transitions to `pending` (recovery path) and re-attempts on the next pass.

- [ ] **Step 6: Exit criterion 4 (streak milestone)**

```powershell
supabase db query "update streaks set current_streak=6, last_completion_date=current_date where profile_id='<a kid uuid>'"
```

Approve a chore for that kid → `current_streak` should jump to 7 → both parents get push "Sara hit a 7-day streak! 🔥".

- [ ] **Step 7: Exit criterion 5 (leaderboard)**

1. Open parent Settings → Leaderboard. Confirm both kids show, 🥇 on the top kid.
2. Toggle to All Time tab → ranking by cumulative-earned shown.
3. Delete one kid (or test with a fresh single-kid family) → screen shows solo row, no medal.

- [ ] **Step 8: Exit criterion 6 (family co-op goal)**

1. Parent → Settings → Family Goals → create "Pizza Night" with target=10⭐.
2. Verify `<GoalCard />` appears on parent home and on each kid's home.
3. Have a kid earn 10⭐ across chore approvals.
4. Confirm: `family_goals.status='completed'`, both parents get push "Family goal reached: Pizza Night 🎉", kid's app shows the celebration banner on next foreground.

- [ ] **Step 9: Review commit log**

```powershell
git log --oneline m8-engagement ^main
```

Expected: roughly 30+ commits, all M8-scoped. No unrelated changes. Working tree clean.

- [ ] **Step 10: Tag the milestone**

```powershell
git tag m8-engagement
```

No final commit — M8 is acceptance-complete when the tag is in place.

---

## Done.

Total tasks: 33. Critical-path estimate: ~5 dev days.

**Migration count:** 16 new (`20260514000001` → `20260514000016`).
**Test files:** 8 new pgTAP (`38_` → `45_`), 5 new Jest.
**New mobile files:** 11 (5 components, 2 hooks, 4 screens incl. layouts).
**Modified mobile files:** ~7 (settings, layouts, home screens, realtime, banner, i18n).
**Edge Functions:** 1 new (`send_push_drain`), 1 removed (`send_push`).

