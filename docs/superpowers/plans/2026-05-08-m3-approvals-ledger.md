# M3 — Approvals & Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the parent approval flow + star ledger + streaks per `docs/superpowers/specs/2026-05-08-m3-approvals-ledger-design.md`.

**Architecture:** Two new Postgres tables (`star_ledger` append-only, `streaks` per-kid) + one SQL helper (`current_streak`) + two `security definer` RPCs (`approve_chore` atomic across status/ledger/streaks, `reject_chore` atomic on status/reason). Mobile: new Approvals tab in parent mode, updated Activity tab (filter + rendering), kid home grows ⭐ balance pill and 🔥 streak flame plus a "rejected" card variant. No Edge Functions; no realtime; no push.

**Tech Stack:** Supabase (Postgres + Auth + RLS), pgTAP, TypeScript, Expo SDK 54 / React Native 0.81 / Expo Router 6, TanStack Query v5, Jest + jest-expo.

---

## File structure

**New SQL migrations** (`supabase/migrations/`):
- `20260508000011_star_ledger_table.sql`
- `20260508000012_streaks_table.sql`
- `20260508000013_current_streak_helper.sql`
- `20260508000014_approve_chore_rpc.sql`
- `20260508000015_reject_chore_rpc.sql`

**New pgTAP tests** (`supabase/tests/`):
- `13_star_ledger_rls.sql`
- `14_streaks_rls.sql`
- `15_current_streak.sql`
- `16_approve_chore_rpc.sql`
- `17_reject_chore_rpc.sql`

**New mobile files**:
- `mobile/src/components/RejectModal.tsx`
- `mobile/tests/RejectModal.test.tsx`
- `mobile/app/(app)/parent/approvals.tsx`

**Modified mobile files**:
- `mobile/app/(app)/parent/_layout.tsx` — add Approvals tab
- `mobile/app/(app)/parent/activity.tsx` — filter change, footer removal, rejected reason rendering
- `mobile/app/(app)/kid/[profileId]/index.tsx` — balance pill + streak flame + rejected card + filter widen
- `mobile/src/types/database.ts` — regenerated

---

## Task 0: Branch + verify baseline

**Files:** none (git only)

- [ ] **Step 1: Create the M3 branch off main**

```bash
git switch main
git switch -c m3-approvals-ledger
```

Expected: `Switched to a new branch 'm3-approvals-ledger'`.

- [ ] **Step 2: Verify Supabase local stack is up**

```bash
npx supabase status
```

Expected: API URL, DB URL, Studio URL all printed, status "running". If not, `npx supabase start`.

- [ ] **Step 3: Verify M2 baseline tests still pass**

```bash
npx supabase test db
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false && cd ..
```

Expected: pgTAP shows `Files=11, Tests=46, Result: PASS`; tsc clean; jest 13/13 pass.

---

## Task 1: star_ledger table

**Files:**
- Create: `supabase/migrations/20260508000011_star_ledger_table.sql`
- Create: `supabase/tests/13_star_ledger_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000011_star_ledger_table.sql
create table public.star_ledger (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  delta       int  not null,
  reason      text not null check (reason in
               ('chore_approved','redemption','manual_grant','manual_revoke')),
  source_id   uuid,
  created_at  timestamptz not null default now()
);

create index star_ledger_profile_idx on public.star_ledger(profile_id);
create index star_ledger_family_recent_idx on public.star_ledger(family_id, created_at desc);

alter table public.star_ledger enable row level security;

create policy star_ledger_select_own_family on public.star_ledger
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = star_ledger.family_id)
  );
-- No INSERT/UPDATE/DELETE policies. Mutations only via approve_chore (security definer).
-- Append-only is enforced by absence of UPDATE/DELETE.
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/13_star_ledger_rls.sql
begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');

insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('b9999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Other', 2, null);

insert into public.star_ledger(family_id, profile_id, delta, reason, source_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 10, 'chore_approved', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b9999999-9999-9999-9999-999999999999', 25, 'chore_approved', null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.star_ledger), 1,
  'Alice sees only her family ledger row'
);

select is_empty(
  $$ select * from public.star_ledger where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B ledger rows'
);

-- Append-only: parent has no UPDATE policy, so this UPDATE affects 0 rows but does not error.
prepare hack as
  update public.star_ledger set delta = 999 where profile_id = 'a2222222-2222-2222-2222-222222222222';
select lives_ok('hack', 'UPDATE against own ledger does not error (RLS blocks the row silently)');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset
npx supabase test db
```

Expected: 49 tests across 12 files (M2's 46 + 3 new).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000011_star_ledger_table.sql supabase/tests/13_star_ledger_rls.sql
git commit -m "feat(db): star_ledger table + select-only RLS + pgTAP isolation test"
```

---

## Task 2: streaks table

**Files:**
- Create: `supabase/migrations/20260508000012_streaks_table.sql`
- Create: `supabase/tests/14_streaks_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000012_streaks_table.sql
create table public.streaks (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  family_id           uuid not null references public.families(id) on delete cascade,
  current_count       int not null default 0,
  longest_count       int not null default 0,
  last_completion_date date
);

alter table public.streaks enable row level security;

create policy streaks_select_own_family on public.streaks
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = streaks.family_id)
  );
-- No mutation policies. All writes via approve_chore (security definer).
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/14_streaks_rls.sql
begin;
select plan(2);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');

insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('b9999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Other', 2, null);

insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 7, current_date),
  ('b9999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3, 3, current_date);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.streaks), 1,
  'Alice sees only her family''s streaks row'
);

select is_empty(
  $$ select * from public.streaks where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B streaks'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260508000012_streaks_table.sql supabase/tests/14_streaks_rls.sql
git commit -m "feat(db): streaks table + select-only RLS"
```

Expected: 51 tests across 13 files.

---

## Task 3: current_streak helper

**Files:**
- Create: `supabase/migrations/20260508000013_current_streak_helper.sql`
- Create: `supabase/tests/15_current_streak.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000013_current_streak_helper.sql
create or replace function public.current_streak(p uuid)
  returns int
  language sql
  stable
as $$
  select coalesce(
    (select case
       when last_completion_date is null then 0
       when last_completion_date < (current_date - 1) then 0
       else current_count
     end
     from public.streaks where profile_id = p),
    0
  );
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/15_current_streak.sql
begin;
select plan(4);

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', 2),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Leo',  3),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Mia',  4);

insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 7, current_date),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 3, current_date - interval '3 days'),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, 0, null);

select is(public.current_streak('a2222222-2222-2222-2222-222222222222'), 5, 'Sara: today completed → returns current_count 5');
select is(public.current_streak('a3333333-3333-3333-3333-333333333333'), 0, 'Leo: 3 days stale → returns 0');
select is(public.current_streak('a4444444-4444-4444-4444-444444444444'), 0, 'Mia: null last_completion_date → returns 0');
select is(public.current_streak('99999999-9999-9999-9999-999999999999'), 0, 'No row → returns 0');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260508000013_current_streak_helper.sql supabase/tests/15_current_streak.sql
git commit -m "feat(db): current_streak helper with lazy reset"
```

Expected: 55 tests across 14 files.

---

## Task 4: approve_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000014_approve_chore_rpc.sql`
- Create: `supabase/tests/16_approve_chore_rpc.sql`

This is the meatiest task in M3 — atomic RPC with five test scenarios for the streak math.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000014_approve_chore_rpc.sql
create or replace function public.approve_chore(instance_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  inst           public.chore_instances%rowtype;
  star_value     int;
  s              public.streaks%rowtype;
begin
  -- caller must be a parent
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;

  -- Idempotent re-call on already-approved instance.
  if inst.status = 'approved' then return; end if;
  if inst.status <> 'submitted' then raise exception 'instance % is not submitted (status=%)', instance_id, inst.status; end if;

  -- Snapshot star_value from the chore template.
  select c.star_value into star_value from public.chores c where c.id = inst.chore_id;

  -- 1. Update instance.
  update public.chore_instances
    set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=star_value
    where id = instance_id;

  -- 2. Append ledger row.
  insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
  values (caller_family, inst.completed_by, star_value, 'chore_approved', instance_id);

  -- 3. Streak upsert.
  select * into s from public.streaks where profile_id = inst.completed_by;
  if s.profile_id is null then
    -- First streak ever for this kid.
    insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date)
    values (inst.completed_by, caller_family, 1, 1, current_date);
  elsif s.last_completion_date = current_date then
    -- Already counted today — no streak change.
    null;
  elsif s.last_completion_date = current_date - 1 then
    -- Consecutive day — bump streak.
    update public.streaks
      set current_count = s.current_count + 1,
          longest_count = greatest(s.longest_count, s.current_count + 1),
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  else
    -- Gap of 2+ days — reset to 1; longest_count preserved.
    update public.streaks
      set current_count = 1,
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  end if;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test (multi-scenario)**

```sql
-- supabase/tests/16_approve_chore_rpc.sql
begin;
select plan(11);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

-- Three chores: one for happy path, one for idempotency, one to seed prior streak.
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 10, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B', 15, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now()),
  ('22222222-aaaa-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Happy path.
select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'first approve_chore call succeeds'
);

-- 2. Status flipped to approved with snapshot fields populated.
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'approved', 'status approved');
select is((select stars_awarded from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 10, 'stars_awarded snapshot');

-- 3. Ledger row created.
select is(
  (select count(*)::int from public.star_ledger
    where source_id = '11111111-aaaa-1111-1111-111111111111' and reason = 'chore_approved'),
  1, 'one ledger row inserted'
);

-- 4. Streak created.
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  1, 'streak current_count = 1 after first approval'
);

-- 5. Idempotent re-call: no-op, no extra ledger row.
select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'idempotent re-call'
);
select is(
  (select count(*)::int from public.star_ledger where source_id = '11111111-aaaa-1111-1111-111111111111'),
  1, 'still only one ledger row after re-call'
);

-- 6. Same-day approve of a different chore: streak unchanged.
select lives_ok(
  $$ select public.approve_chore('22222222-aaaa-2222-2222-222222222222') $$,
  'same-day second approval'
);
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  1, 'streak unchanged on same-day double-approve'
);

-- 7. Consecutive-day bump: backdate yesterday, then approve a fresh instance.
update public.streaks set last_completion_date = current_date - 1 where profile_id = 'a2222222-2222-2222-2222-222222222222';
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('33333333-aaaa-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now());
select lives_ok(
  $$ select public.approve_chore('33333333-aaaa-3333-3333-333333333333') $$,
  'consecutive-day approval'
);
select is(
  (select current_count from public.streaks where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  2, 'streak bumped to 2 after consecutive day'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260508000014_approve_chore_rpc.sql supabase/tests/16_approve_chore_rpc.sql
git commit -m "feat(db): approve_chore RPC atomic over status + ledger + streak"
```

Expected: 66 tests across 15 files.

---

## Task 5: reject_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000015_reject_chore_rpc.sql`
- Create: `supabase/tests/17_reject_chore_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000015_reject_chore_rpc.sql
create or replace function public.reject_chore(instance_id uuid, reason text default '')
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  inst           public.chore_instances%rowtype;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;

  if inst.status = 'rejected' then return; end if;
  if inst.status <> 'submitted' then raise exception 'instance % is not submitted (status=%)', instance_id, inst.status; end if;

  update public.chore_instances
    set status='rejected', approved_by=caller_profile, approved_at=now(), rejection_reason=coalesce(reason, '')
    where id = instance_id;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/17_reject_chore_rpc.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 10, 'photo', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at, photo_url) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now(), 'http://x/y.jpg'),
  ('22222222-aaaa-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now(), 'http://x/z.jpg');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Reject with reason.
select lives_ok(
  $$ select public.reject_chore('11111111-aaaa-1111-1111-111111111111', 'photo unclear') $$,
  'reject_chore with reason succeeds'
);
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'rejected', 'status rejected');
select is((select rejection_reason from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'photo unclear', 'reason recorded');

-- 2. Reject without reason (defaults to empty string).
select lives_ok(
  $$ select public.reject_chore('22222222-aaaa-2222-2222-222222222222') $$,
  'reject_chore without reason succeeds'
);
select is((select rejection_reason from public.chore_instances where id = '22222222-aaaa-2222-2222-222222222222'), '', 'empty reason recorded');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260508000015_reject_chore_rpc.sql supabase/tests/17_reject_chore_rpc.sql
git commit -m "feat(db): reject_chore RPC with optional reason"
```

Expected: 71 tests across 16 files.

---

## Task 6: Regenerate database types

**Files:**
- Modify: `mobile/src/types/database.ts`

- [ ] **Step 1: Regenerate, filtering CLI noise**

The Supabase CLI on Windows pollutes stdout with a connection status line and a Claude-plugin XML hint. Strip both.

```bash
npx supabase gen types typescript --local 2>/dev/null \
  | grep -v '^Connecting to' \
  | grep -v '<claude-code-hint' \
  > mobile/src/types/database.ts
```

If the file's first line is anything other than `export type Json =` or `export type Database`, the filter missed something — open the file and remove leading non-TS noise by hand.

- [ ] **Step 2: Type-check mobile**

```bash
cd mobile && npx tsc --noEmit
```

Expected: clean (no errors). The new types should include `star_ledger`, `streaks`, `current_streak`, `approve_chore`, `reject_chore`.

- [ ] **Step 3: Commit**

```bash
cd .. && git add mobile/src/types/database.ts
git commit -m "chore(types): regenerate database types after M3 schema migrations"
```

---

## Task 7: RejectModal component

**Files:**
- Create: `mobile/src/components/RejectModal.tsx`
- Create: `mobile/tests/RejectModal.test.tsx`

TDD task — failing test first.

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/RejectModal.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RejectModal } from '../src/components/RejectModal';

describe('RejectModal', () => {
  it('does not render when visible=false', () => {
    const { queryByText } = render(
      <RejectModal visible={false} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(queryByText('Reject')).toBeNull();
  });

  it('calls onConfirm with empty string when reject pressed without typing', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <RejectModal visible={true} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.press(getByText('Reject'));
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('calls onConfirm with the typed reason', () => {
    const onConfirm = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <RejectModal visible={true} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.changeText(getByPlaceholderText('Why? (optional)'), 'photo unclear');
    fireEvent.press(getByText('Reject'));
    expect(onConfirm).toHaveBeenCalledWith('photo unclear');
  });

  it('calls onCancel when Cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <RejectModal visible={true} onCancel={onCancel} onConfirm={() => {}} />,
    );
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd mobile && npm test -- RejectModal
```

- [ ] **Step 3: Implement**

```typescript
// mobile/src/components/RejectModal.tsx
import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function RejectModal({ visible, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  // Reset when re-opened.
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.bg}>
        <View style={styles.card}>
          <Text style={styles.title}>Reject this chore?</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why? (optional)"
            style={styles.input}
            multiline
          />
          <View style={styles.row}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.btnSecondary]}>
              <Text style={styles.btnTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(reason)} style={[styles.btn, styles.btnDanger]}>
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: 320, gap: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnSecondary: { backgroundColor: '#f3f4f6' },
  btnDanger: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnTextSecondary: { color: '#374151', fontWeight: '500' },
});
```

- [ ] **Step 4: Run — expect 4/4 PASS**

```bash
cd mobile && npm test -- RejectModal
```

- [ ] **Step 5: Run full mobile suite + tsc**

```bash
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false
```

Expected: tsc clean; 17 jest tests pass (M2's 13 + 4 new).

- [ ] **Step 6: Commit**

```bash
cd .. && git add mobile/src/components/RejectModal.tsx mobile/tests/RejectModal.test.tsx
git commit -m "feat(mobile): RejectModal component with optional reason input"
```

---

## Task 8: Approvals tab

**Files:**
- Modify: `mobile/app/(app)/parent/_layout.tsx` — add the Approvals tab
- Create: `mobile/app/(app)/parent/approvals.tsx`

- [ ] **Step 1: Update parent layout**

```typescript
// mobile/app/(app)/parent/_layout.tsx — full file
import { Tabs } from 'expo-router';

export default function ParentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"     options={{ title: 'Chores' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Tabs.Screen name="activity"  options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings"  options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Implement the Approvals screen**

```typescript
// mobile/app/(app)/parent/approvals.tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Modal, Image } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { RejectModal } from '../../../src/components/RejectModal';

type Row = {
  id: string;
  completed_at: string;
  photo_url: string | null;
  family_id: string;
  completed_by: string | null;
  kid: { id: string; display_name: string; avatar_id: number } | null;
  chore: { title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function Approvals() {
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals'],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id,completed_at,photo_url,family_id,completed_by,kid:profiles!chore_instances_completed_by_fkey(id,display_name,avatar_id),chore:chores(title,star_value,verification_mode)')
        .eq('status', 'submitted')
        .order('completed_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const approve = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase.rpc('approve_chore', { instance_id: instanceId });
      if (error) throw error;
    },
    onSuccess: (_d, instanceId) => {
      const row = data?.find((r) => r.id === instanceId);
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      if (row?.completed_by) {
        qc.invalidateQueries({ queryKey: ['kid-today', row.completed_by] });
        qc.invalidateQueries({ queryKey: ['balance', row.completed_by] });
        qc.invalidateQueries({ queryKey: ['streak', row.completed_by] });
      }
    },
  });

  const reject = useMutation({
    mutationFn: async (vars: { instanceId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_chore', {
        instance_id: vars.instanceId,
        reason: vars.reason,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const row = data?.find((r) => r.id === vars.instanceId);
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      if (row?.completed_by) qc.invalidateQueries({ queryKey: ['kid-today', row.completed_by] });
    },
  });

  async function openPhoto(row: Row) {
    if (!row.photo_url) return;
    const path = `family/${row.family_id}/chore-proofs/${row.id}.jpg`;
    const { data } = await supabase.storage.from('chore-proofs').createSignedUrl(path, 60);
    setPhotoUrl(data?.signedUrl ?? null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Approvals</Text>

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {data && data.length === 0 && (
        <Text style={styles.empty}>No pending approvals — nice work 🌟</Text>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const a = item.kid ? AVATARS[item.kid.avatar_id as AvatarId] : null;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.line}>
                  {a?.emoji ?? '👤'} {item.kid?.display_name} · {item.chore?.title} · ⭐ {item.chore?.star_value}
                </Text>
                <Text style={styles.sub}>
                  submitted {timeAgo(item.completed_at)}
                  {item.chore?.verification_mode === 'photo' && (
                    <Text onPress={() => openPhoto(item)} style={styles.viewPhoto}>  ·  view photo</Text>
                  )}
                </Text>
              </View>
              <Pressable
                onPress={() => approve.mutate(item.id)}
                disabled={approve.isPending}
                style={[styles.btn, styles.btnApprove, approve.isPending && { opacity: 0.5 }]}
              >
                <Text style={styles.btnTextLight}>Approve</Text>
              </Pressable>
              <Pressable
                onPress={() => setRejectTarget(item)}
                style={[styles.btn, styles.btnReject]}
              >
                <Text style={styles.btnTextDark}>Reject</Text>
              </Pressable>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <Modal visible={!!photoUrl} transparent animationType="fade" onRequestClose={() => setPhotoUrl(null)}>
        <Pressable style={styles.photoBg} onPress={() => setPhotoUrl(null)}>
          {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photoImg} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <RejectModal
        visible={!!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) reject.mutate({ instanceId: rejectTarget.id, reason });
          setRejectTarget(null);
        }}
      />
    </View>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  err: { color: '#ef4444' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 64 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  line: { fontSize: 15 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  viewPhoto: { color: '#3b82f6' },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  btnApprove: { backgroundColor: '#10b981' },
  btnReject: { backgroundColor: '#f3f4f6' },
  btnTextLight: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnTextDark: { color: '#374151', fontWeight: '500', fontSize: 13 },
  photoBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  photoImg: { width: '100%', height: '80%' },
});
```

- [ ] **Step 3: Type-check + jest**

```bash
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false
```

Expected: tsc clean; 17 jest tests still pass.

- [ ] **Step 4: Commit**

```bash
cd .. && git add mobile/app/\(app\)/parent/_layout.tsx mobile/app/\(app\)/parent/approvals.tsx
git commit -m "feat(mobile): parent Approvals tab with approve/reject + photo viewer"
```

---

## Task 9: Activity tab updates

**Files:**
- Modify: `mobile/app/(app)/parent/activity.tsx` — change filter, render rejected reason, remove footer

- [ ] **Step 1: Replace the file (full rewrite)**

```typescript
// mobile/app/(app)/parent/activity.tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Modal, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';

type Row = {
  id: string;
  status: 'approved' | 'rejected';
  approved_at: string | null;
  completed_at: string | null;
  photo_url: string | null;
  family_id: string;
  rejection_reason: string | null;
  kid: { display_name: string; avatar_id: number } | null;
  chore: { title: string; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function Activity() {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity'],
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id,status,approved_at,completed_at,photo_url,family_id,rejection_reason,kid:profiles!chore_instances_completed_by_fkey(display_name,avatar_id),chore:chores(title,verification_mode)')
        .in('status', ['approved', 'rejected'])
        .gte('completed_at', since)
        .order('approved_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  async function openPhoto(r: Row) {
    if (!r.photo_url) return;
    const path = `family/${r.family_id}/chore-proofs/${r.id}.jpg`;
    const { data } = await supabase.storage.from('chore-proofs').createSignedUrl(path, 60);
    setSignedUrl(data?.signedUrl ?? null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {data && data.length === 0 && <Text style={styles.empty}>No activity yet.</Text>}

      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const avatar = item.kid ? AVATARS[item.kid.avatar_id as AvatarId].emoji : '👤';
          if (item.status === 'rejected') {
            const reason = item.rejection_reason && item.rejection_reason.length > 0
              ? ` — "${item.rejection_reason}"` : '';
            return (
              <View style={styles.row}>
                <Text style={styles.line}>
                  ✗ {avatar} {item.kid?.display_name} · {item.chore?.title} · {timeAgo(item.approved_at ?? item.completed_at!)}{reason}
                </Text>
              </View>
            );
          }
          const icon = item.chore?.verification_mode === 'photo' ? '📸' : '✓';
          return (
            <Pressable
              style={styles.row}
              onPress={() => item.chore?.verification_mode === 'photo' && openPhoto(item)}
            >
              <Text style={styles.line}>
                {icon} {avatar} {item.kid?.display_name} · {item.chore?.title} · {timeAgo(item.approved_at ?? item.completed_at!)}
              </Text>
              {item.chore?.verification_mode === 'photo' && (
                <Text style={styles.hint}>tap to view photo</Text>
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <Modal visible={!!signedUrl} transparent animationType="fade" onRequestClose={() => setSignedUrl(null)}>
        <Pressable style={styles.modalBg} onPress={() => setSignedUrl(null)}>
          {signedUrl && <Image source={{ uri: signedUrl }} style={styles.modalImg} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  err: { color: '#ef4444' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 64 },
  row: { paddingVertical: 12 },
  line: { fontSize: 15 },
  hint: { fontSize: 11, color: '#3b82f6', marginTop: 2 },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalImg: { width: '100%', height: '80%' },
});
```

Key differences from the M2 version:
- Filter: `status IN ('approved', 'rejected')` (was `('submitted', 'approved')`).
- Order by `approved_at` (newer M3 column) instead of `completed_at`, with `nullsFirst: false` so any leftover rows without an approved_at sort to the bottom.
- Rejected rows render `✗ <kid> · <chore> · <time>` plus the reason in quotes.
- Footer "Approvals coming next milestone" removed.

- [ ] **Step 2: Type-check + jest**

```bash
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add mobile/app/\(app\)/parent/activity.tsx
git commit -m "feat(mobile): activity tab shows approved + rejected with reason; pending moves to Approvals"
```

---

## Task 10: Kid home — balance, streak, rejected card

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx` — full rewrite

- [ ] **Step 1: Replace the file**

```typescript
// mobile/app/(app)/kid/[profileId]/index.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';

type Instance = {
  id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  due_at: string;
  rejection_reason: string | null;
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function KidHome() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const qc = useQueryClient();

  const { data: instances, isLoading, error } = useQuery({
    queryKey: ['kid-today', profileId],
    queryFn: async (): Promise<Instance[]> => {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, rejection_reason, chore:chores(id,title,star_value,verification_mode)')
        .or(`assignee_profile_id.eq.${profileId},assignee_profile_id.is.null`)
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .in('status', ['pending', 'submitted', 'rejected'])
        .order('due_at');
      if (error) throw error;
      return (data ?? []) as unknown as Instance[];
    },
    enabled: !!profileId,
  });

  const { data: balance } = useQuery({
    queryKey: ['balance', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('star_ledger')
        .select('delta')
        .eq('profile_id', profileId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r as { delta: number }).delta, 0);
    },
    enabled: !!profileId,
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('current_streak', { p: profileId });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!profileId,
  });

  const complete = useMutation({
    mutationFn: async (vars: { instanceId: string }) => {
      const { error } = await supabase.rpc('complete_chore', {
        instance_id: vars.instanceId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kid-today', profileId] }),
  });

  function onDone(inst: Instance) {
    if (!inst.chore) return;
    if (inst.chore.verification_mode === 'photo') {
      router.push(`/(app)/kid/${profileId}/chore/${inst.id}/photo` as never);
      return;
    }
    complete.mutate({ instanceId: inst.id });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's chores</Text>
        <Pressable onPress={() => router.replace('/(app)')}>
          <Text style={styles.switch}>Switch</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>⭐ {balance ?? 0}</Text>
        </View>
        {(streak ?? 0) > 0 && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>🔥 {streak}</Text>
          </View>
        )}
      </View>

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {instances && instances.length === 0 && (
        <Text style={styles.empty}>All done — great job! 🌟</Text>
      )}

      <ScrollView contentContainerStyle={{ gap: 12 }}>
        {(instances ?? []).map((inst) => {
          const submitted = inst.status === 'submitted';
          const rejected = inst.status === 'rejected';
          const cardStyle = [styles.card, submitted && styles.cardWaiting, rejected && styles.cardRejected];
          return (
            <View key={inst.id} style={cardStyle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
                <Text style={styles.stars}>⭐ {inst.chore?.star_value}</Text>
                {submitted && <Text style={styles.waiting}>Waiting for parent ✋</Text>}
                {rejected && (
                  <Text style={styles.rejected}>
                    ✗ Rejected{inst.rejection_reason ? `: ${inst.rejection_reason}` : ''}
                  </Text>
                )}
              </View>
              {!submitted && !rejected && (
                <Pressable onPress={() => onDone(inst)} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  switch: { color: '#3b82f6', fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', fontSize: 18, marginTop: 64, color: '#6b7280' },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardWaiting: { opacity: 0.55 },
  cardRejected: { opacity: 0.55, backgroundColor: '#fee2e2' },
  choreTitle: { fontSize: 18, fontWeight: '600' },
  stars: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  waiting: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  rejected: { fontSize: 12, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' },
  doneBtn: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Type-check + jest**

```bash
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false
```

Expected: tsc clean; 17 jest tests pass.

- [ ] **Step 3: Commit**

```bash
cd .. && git add mobile/app/\(app\)/kid/\[profileId\]/index.tsx
git commit -m "feat(mobile): kid home with balance pill, streak flame, and rejected card"
```

---

## Task 11: Manual M3 acceptance + tag

**Files:** none (manual run + git tag)

- [ ] **Step 1: Reset DB and start mobile dev server**

```bash
npx supabase db reset
cd mobile && npx expo start --android --clear
```

Open the Android emulator. Stop any previous instance with Ctrl+C first.

- [ ] **Step 2: Run the M3 acceptance script**

In the emulator:
1. Sign up as a fresh test user (`m3test@example.com` / `test1234`).
2. Create family → onboarding seeds 5 chores.
3. Add 1 kid (no PIN).
4. Trigger generator (in another shell):
   ```powershell
   npx supabase functions serve generate_chore_instances --no-verify-jwt
   curl.exe -X POST http://127.0.0.1:54321/functions/v1/generate_chore_instances
   ```
5. From the avatar lock, tap the kid → kid home shows today's instances. Tap Done on three of them. (One auto, one approval — depends on which seed chores get touched. All seed chores are `verification_mode='approval'`, so all three go to `'submitted'`.)
6. Switch → parent → **Approvals tab** shows three pending. Approve two. Reject one with reason "needs another look".
7. Switch → kid → home now shows: ⭐ pill with sum of two approved star values (20), 🔥 1 streak flame, the rejected card dimmed in red with "✗ Rejected: needs another look".
8. Switch → parent → **Activity tab** shows: 2 ✓ approved entries + 1 ✗ rejected entry with reason.
9. **Time-travel test for streak bump:**
   ```powershell
   docker exec supabase_db_Shores psql -U postgres -d postgres -c "update public.streaks set last_completion_date = current_date - 1;"
   ```
   Approve another submitted chore (need to create another by completing one in kid mode first; the generator will give you tomorrow's instance, so easier: parent creates a new one-off chore due today, kid completes it, parent approves). Streak should now show `🔥 2`.
10. CI green; pgTAP, tsc, Jest all green locally.

- [ ] **Step 3: Tag the milestone**

```bash
git tag -a m3-approvals-ledger -m "M3: Approvals + Ledger + Streaks milestone complete"
git tag --list m3-approvals-ledger -n5
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin m3-approvals-ledger:main
git push origin --tags
```

- [ ] **Step 5: Update project memory**

Add `m3_progress.md` to the project memory directory (analogous to `m2_progress.md`) recording M3 status, deferrals carried into M4, and any late fixes from acceptance.

---

## Spec coverage check (self-review)

| Spec section | Tasks |
|---|---|
| 1.1 star_ledger | T1 |
| 1.1 streaks | T2 |
| 1.1 approve_chore RPC | T4 |
| 1.1 reject_chore RPC | T5 |
| 1.1 current_streak helper | T3 |
| 1.1 Approvals tab | T8 |
| 1.1 Activity tab updates | T9 |
| 1.1 Kid home additions | T10 |
| 2 data model | T1, T2 |
| 3.1 approve_chore semantics + idempotency | T4 |
| 3.2 reject_chore semantics | T5 |
| 3.3 current_streak SQL | T3 |
| 3.4 RLS | T1, T2 |
| 4.1 parent layout tabs | T8 |
| 4.2 Approvals screen | T8 |
| 4.3 RejectModal | T7 |
| 4.4 Activity tab updates | T9 |
| 4.5 Kid home additions | T10 |
| 5.1 pgTAP coverage | T1, T2, T3, T4, T5 |
| 5.2 Jest stays at 13+4 RejectModal | T7 |
| 5.3 manual acceptance | T11 |
| 5.4 exit criteria + tag | T11 |

Every spec section has a task. No placeholders. Type names consistent (`approve_chore`, `reject_chore`, `current_streak`, `RejectModal`, `Approvals`).

---

**End of M3 plan.**
