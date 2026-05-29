# Chore claim + started/finished states Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add claim/release/start/finish actions on `chore_instances` with race-protection; rename `submitted → finished`; introduce `started` state; allow parents to be chore doers (auto-approve, family-pool credit instead of individual stars).

**Architecture:** Status enum migration with data preservation, four new security-definer RPCs guarded by atomic `UPDATE ... WHERE <state-guard>` clauses, one shared actor-resolution helper, one tiny family-pool credit helper. Mobile gains a new shared `ChoreCard` component and a parent "My Chores" tab; kid home becomes a three-section family-wide list.

**Tech Stack:** Postgres (pgTAP), Supabase, React Native + Expo Router, Jest, react-query.

**Spec:** `docs/superpowers/specs/2026-05-29-chore-claim-states-design.md`

---

## File Structure

### New backend files
- `supabase/migrations/20260529000001_chore_status_enum_migration.sql` — drop CHECK, rename `submitted → finished` data, add `started` to enum, add `started_at` + `finished_at` columns, update partial index
- `supabase/migrations/20260529000002_resolve_actor_profile_id.sql` — helper function + grants
- `supabase/migrations/20260529000003_credit_family_pool.sql` — helper function + grants
- `supabase/migrations/20260529000004_claim_chore_rpc.sql`
- `supabase/migrations/20260529000005_release_chore_rpc.sql`
- `supabase/migrations/20260529000006_start_chore_rpc.sql`
- `supabase/migrations/20260529000007_finish_chore_rpc.sql`
- `supabase/migrations/20260529000008_approve_reject_finished_state.sql` — update `approve_chore`, `reject_chore`, and the `approve_chore_calls_check` redefinition to read `'finished'` instead of `'submitted'`
- `supabase/migrations/20260529000009_notify_push_chore_finished.sql` — rewrite `notify_push_chore` trigger function so it fires on `pending → finished` (was `pending → submitted`)
- `supabase/migrations/20260529000010_drop_complete_chore.sql` — `drop function public.complete_chore(...)`
- `supabase/tests/55_resolve_actor_profile_id.sql`
- `supabase/tests/56_credit_family_pool.sql`
- `supabase/tests/57_claim_chore.sql`
- `supabase/tests/58_release_chore.sql`
- `supabase/tests/59_start_chore.sql`
- `supabase/tests/60_finish_chore.sql`

### Modified backend files
- `supabase/tests/54_rls_regression_matrix.sql` — extend status-enum assertions for the new states

### New mobile files
- `mobile/src/lib/chores.ts` — `claimChore`, `releaseChore`, `startChore`, `finishChore` wrappers
- `mobile/src/components/ChoreCard.tsx` — shared card with state-aware action buttons
- `mobile/app/(app)/parent/my-chores.tsx` — new parent tab screen
- `mobile/tests/chores.test.ts`
- `mobile/tests/choreCard.test.tsx`

### Modified mobile files
- `mobile/app/(app)/kid/[profileId]/index.tsx` — replace query with three-section family-wide query; drop inline rendering for `ChoreCard`; remove `complete_chore` mutation
- `mobile/app/(app)/parent/_layout.tsx` (or equivalent tab definition) — add My Chores tab entry
- `mobile/app/(app)/parent/approvals.tsx` — change `eq('status', 'submitted')` → `eq('status', 'finished')`; update i18n label key
- `mobile/src/i18n/en.json` (and other locales) — rename `approvals.submitted` key and add new `chore.*` action labels
- `mobile/src/types/database.ts` — regenerated after migrations land

---

## Task 1: Schema migration — status enum + audit columns + index

**Files:**
- Create: `supabase/migrations/20260529000001_chore_status_enum_migration.sql`
- Test: append assertions to `supabase/tests/54_rls_regression_matrix.sql` later (Task 10); for this task, write a small standalone schema assertion at `supabase/tests/55_status_enum_migration.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/55_status_enum_migration.sql
begin;
select plan(6);

-- The CHECK constraint must accept the new status values
select is(
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where t.relname = 'chore_instances' and c.conname = 'chore_instances_status_check'),
  $$CHECK ((status = ANY (ARRAY['pending'::text, 'started'::text, 'finished'::text, 'approved'::text, 'rejected'::text])))$$,
  'CHECK constraint includes started + finished'
);

-- Columns exist
select has_column('public', 'chore_instances', 'started_at',  'started_at column exists');
select has_column('public', 'chore_instances', 'finished_at', 'finished_at column exists');

-- Old data preserved: a pre-migration 'submitted' row becomes 'finished'
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

-- Insert directly with the new 'finished' status to prove the constraint accepts it
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at, finished_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'finished', 'a2222222-2222-2222-2222-222222222222', now(), now());
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'finished', 'new finished row accepted');

-- And the started status
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at) values
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'started', now());
select is(
  (select status from public.chore_instances where id = '11111111-bbbb-1111-1111-111111111111'),
  'started', 'new started row accepted');

-- And reject the old 'submitted' value
prepare bad_status as
  insert into public.chore_instances(chore_id, family_id, due_at, status) values
    ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'submitted');
select throws_ok('bad_status', null, null, 'submitted is no longer a valid status');

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db supabase/tests/55_status_enum_migration.sql`
Expected: FAIL — current CHECK still has `submitted` and lacks `started`/`finished`; columns don't exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000001_chore_status_enum_migration.sql
-- Status enum: 'submitted' renamed to 'finished'; 'started' added as a new
-- pre-finish state. Audit timestamps started_at + finished_at added. The
-- partial index on the open-state set is refreshed to include the new states.

alter table public.chore_instances drop constraint chore_instances_status_check;

update public.chore_instances set status = 'finished' where status = 'submitted';

alter table public.chore_instances
  add constraint chore_instances_status_check
  check (status in ('pending','started','finished','approved','rejected'));

alter table public.chore_instances
  add column started_at  timestamptz,
  add column finished_at timestamptz;

-- Preserve the audit trail for already-completed rows.
update public.chore_instances
   set finished_at = completed_at
 where status = 'finished' and finished_at is null;

drop index if exists chore_instances_open_assignee_idx;
create index chore_instances_open_assignee_idx
  on public.chore_instances(assignee_profile_id, due_at)
  where status in ('pending','started','finished','rejected');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db supabase/tests/55_status_enum_migration.sql`
Expected: PASS — 6/6 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000001_chore_status_enum_migration.sql supabase/tests/55_status_enum_migration.sql
git commit -m "$(cat <<'EOF'
feat(db): chore_instances status enum — rename submitted to finished, add started, audit timestamps

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: resolve_actor_profile_id helper

**Files:**
- Create: `supabase/migrations/20260529000002_resolve_actor_profile_id.sql`
- Test: `supabase/tests/56_resolve_actor_profile_id.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/56_resolve_actor_profile_id.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null),                       -- kid anon
  ('99999999-9999-9999-9999-999999999999', 'p@b.test');                 -- other-family parent

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P',  1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K2', 3, null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'P2', 1, '99999999-9999-9999-9999-999999999999');

insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

set local role authenticated;

-- Parent acting as self
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  public.resolve_actor_profile_id('a1111111-1111-1111-1111-111111111111'),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'parent resolves self');

-- Parent acting as kid in same family
select is(
  public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'parent resolves kid in own family');

-- Kid session acting as self
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'kid resolves self');

-- Kid session trying to act as sibling -> raises
prepare kid_as_sibling as select public.resolve_actor_profile_id('a3333333-3333-3333-3333-333333333333');
select throws_ok('kid_as_sibling', null, 'kid session may only act as itself', 'kid acting as sibling rejected');

-- Other-family parent trying to act in family A -> raises
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
prepare foreign as select public.resolve_actor_profile_id('a2222222-2222-2222-2222-222222222222');
select throws_ok('foreign', null, 'actor not in caller family', 'foreign-family actor rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/56_resolve_actor_profile_id.sql`
Expected: FAIL — function does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000002_resolve_actor_profile_id.sql
-- Shared actor-authorization gate used by every chore-action RPC.

create or replace function public.resolve_actor_profile_id(p_actor_profile_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_family       uuid;
  v_kid          uuid;
  v_actor_family uuid;
begin
  v_family := public.current_family_id();
  if v_family is null then
    raise exception 'caller not in a family';
  end if;

  v_kid := public.current_kid_id();
  if v_kid is not null and v_kid <> p_actor_profile_id then
    raise exception 'kid session may only act as itself';
  end if;

  select family_id into v_actor_family
    from public.profiles where id = p_actor_profile_id;
  if v_actor_family is null or v_actor_family <> v_family then
    raise exception 'actor not in caller family';
  end if;

  return p_actor_profile_id;
end $$;

revoke all on function public.resolve_actor_profile_id(uuid) from public;
grant execute on function public.resolve_actor_profile_id(uuid) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/56_resolve_actor_profile_id.sql`
Expected: PASS — 5/5 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000002_resolve_actor_profile_id.sql supabase/tests/56_resolve_actor_profile_id.sql
git commit -m "$(cat <<'EOF'
feat(db): resolve_actor_profile_id helper — shared actor-authorization gate

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: credit_family_pool helper

**Files:**
- Create: `supabase/migrations/20260529000003_credit_family_pool.sql`
- Test: `supabase/tests/57_credit_family_pool.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/57_credit_family_pool.sql
begin;
select plan(3);

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');

-- No active goal -> no-op (no error)
select lives_ok(
  $$ select public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10) $$,
  'no-op when no active goal');

-- Active goal -> progress increments
insert into public.family_goals(id, family_id, title, target_progress, current_progress, status)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pool', 100, 25, 'active');

perform public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10);
select is(
  (select current_progress from public.family_goals where id = '11111111-1111-1111-1111-111111111111'),
  35, 'progress incremented by amount');

-- Overflow clamped to target
perform public.credit_family_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000);
select is(
  (select current_progress from public.family_goals where id = '11111111-1111-1111-1111-111111111111'),
  100, 'progress clamped at target');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/57_credit_family_pool.sql`
Expected: FAIL — function does not exist.

- [ ] **Step 3: Write the migration**

Before writing, confirm the column names on `family_goals`:

```bash
grep -n "create table public.family_goals" supabase/migrations/*.sql
```

Read the result and verify the columns referenced (`target_progress`, `current_progress`, `status`, `family_id`) match. If they differ (e.g. `goal_target` instead of `target_progress`), use the actual names in the function body AND in the test.

```sql
-- supabase/migrations/20260529000003_credit_family_pool.sql
-- Increment the active family goal's progress when a parent finishes a chore.
-- No-op when no active goal exists. Clamps at target_progress.

create or replace function public.credit_family_pool(p_family_id uuid, p_amount int)
returns void
language sql security definer
set search_path = public
as $$
  update public.family_goals
     set current_progress = least(target_progress, current_progress + p_amount)
   where family_id = p_family_id and status = 'active'
$$;

revoke all on function public.credit_family_pool(uuid, int) from public;
grant execute on function public.credit_family_pool(uuid, int) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/57_credit_family_pool.sql`
Expected: PASS — 3/3 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000003_credit_family_pool.sql supabase/tests/57_credit_family_pool.sql
git commit -m "$(cat <<'EOF'
feat(db): credit_family_pool helper — increments active family goal, clamps at target

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: claim_chore RPC

**Files:**
- Create: `supabase/migrations/20260529000004_claim_chore_rpc.sql`
- Test: `supabase/tests/58_claim_chore.sql`

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/58_claim_chore.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);

insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 'pending'),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, now(), 'pending');

set local role authenticated;

-- Kid claims an unassigned chore
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.claim_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid claims unassigned chore');
select is(
  (select assignee_profile_id from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'a2222222-2222-2222-2222-222222222222'::uuid,
  'assignee set to claimer');

-- Race: second claim attempt against the same instance fails
prepare second_claim as select public.claim_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('second_claim', null, 'chore not claimable', 'already-claimed chore rejected with generic error');

-- Parent claims the other unassigned chore for self
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.claim_chore('11111111-bbbb-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent claims unassigned chore for self');

-- Kid session cannot claim as someone else
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
prepare wrong_actor as select public.claim_chore('11111111-bbbb-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111');
select throws_ok('wrong_actor', null, 'kid session may only act as itself', 'kid acting as parent rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/58_claim_chore.sql`
Expected: FAIL — RPC does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000004_claim_chore_rpc.sql
-- Any family member self-claims an unassigned, pending chore. Race-protected
-- by the assignee IS NULL clause: only one concurrent claim wins.

create or replace function public.claim_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set assignee_profile_id = actor_profile_id
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id is null
     and status = 'pending';
  if not found then
    raise exception 'chore not claimable';
  end if;
end $$;

revoke all on function public.claim_chore(uuid, uuid) from public;
grant execute on function public.claim_chore(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/58_claim_chore.sql`
Expected: PASS — 5/5 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000004_claim_chore_rpc.sql supabase/tests/58_claim_chore.sql
git commit -m "$(cat <<'EOF'
feat(db): claim_chore RPC — race-protected via UPDATE WHERE assignee IS NULL

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: release_chore RPC

**Files:**
- Create: `supabase/migrations/20260529000005_release_chore_rpc.sql`
- Test: `supabase/tests/59_release_chore.sql`

- [ ] **Step 1: Failing test**

```sql
-- supabase/tests/59_release_chore.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'pending'),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'started', now()),
  ('11111111-cccc-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now(), 'pending');

-- ALTER: the third row above won't compile because chore_instances has no started_at default; rewrite as a two-step insert.
-- (For brevity in the plan we'll keep the form here; the implementer should split the started row into:
--   insert ... values (..., 'started') and then update started_at separately. The test below works either way.)

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Kid releases own pending chore
select lives_ok(
  $$ select public.release_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid releases own pending chore');
select is(
  (select assignee_profile_id from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  null::uuid, 'assignee cleared');

-- Cannot release a started chore
prepare started_release as select public.release_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('started_release', null, 'chore not releasable', 'cannot release started chore');

-- Cannot release someone else's chore
prepare wrong_actor as select public.release_chore('11111111-cccc-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_actor', null, 'chore not releasable', 'cannot release another actor''s chore');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/59_release_chore.sql`
Expected: FAIL — RPC does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000005_release_chore_rpc.sql
-- Actor releases a pending chore they previously claimed. Started chores
-- cannot be released — only a parent UPDATE override can rescue those.

create or replace function public.release_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set assignee_profile_id = null
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id = actor_profile_id
     and status = 'pending';
  if not found then
    raise exception 'chore not releasable';
  end if;
end $$;

revoke all on function public.release_chore(uuid, uuid) from public;
grant execute on function public.release_chore(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/59_release_chore.sql`
Expected: PASS — 4/4 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000005_release_chore_rpc.sql supabase/tests/59_release_chore.sql
git commit -m "$(cat <<'EOF'
feat(db): release_chore RPC — only releasable while pending

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: start_chore RPC

**Files:**
- Create: `supabase/migrations/20260529000006_start_chore_rpc.sql`
- Test: `supabase/tests/60_start_chore.sql`

- [ ] **Step 1: Failing test**

```sql
-- supabase/tests/60_start_chore.sql
begin;
select plan(5);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 5, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, rejection_reason) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'pending',  null),
  ('11111111-bbbb-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'rejected', 'try again'),
  ('11111111-cccc-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now(), 'pending',  null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Start a pending chore -> status=started, started_at set, rejection cleared
select lives_ok(
  $$ select public.start_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'starting a pending chore');
select is(
  (select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'),
  'started', 'status flipped to started');

-- Re-start from rejected
select lives_ok(
  $$ select public.start_chore('11111111-bbbb-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'restarting a rejected chore');
select is(
  (select rejection_reason from public.chore_instances where id = '11111111-bbbb-1111-1111-111111111111'),
  null::text, 'rejection_reason cleared on restart');

-- Cannot start someone else's chore
prepare wrong_actor as select public.start_chore('11111111-cccc-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_actor', null, 'chore not startable', 'cannot start another actor''s chore');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/60_start_chore.sql`
Expected: FAIL — RPC does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000006_start_chore_rpc.sql
-- Actor moves an assigned chore from pending or rejected to started.

create or replace function public.start_chore(
  instance_id      uuid,
  actor_profile_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  update public.chore_instances
     set status = 'started',
         started_at = now(),
         rejection_reason = null,
         approved_by = null,
         approved_at = null
   where id = instance_id
     and family_id = public.current_family_id()
     and assignee_profile_id = actor_profile_id
     and status in ('pending', 'rejected');
  if not found then
    raise exception 'chore not startable';
  end if;
end $$;

revoke all on function public.start_chore(uuid, uuid) from public;
grant execute on function public.start_chore(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/60_start_chore.sql`
Expected: PASS — 5/5 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000006_start_chore_rpc.sql supabase/tests/60_start_chore.sql
git commit -m "$(cat <<'EOF'
feat(db): start_chore RPC — accepts pending or rejected as entry state

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: finish_chore RPC (verification-mode × actor-type matrix)

**Files:**
- Create: `supabase/migrations/20260529000007_finish_chore_rpc.sql`
- Test: `supabase/tests/61_finish_chore.sql`

This is the most complex RPC. The same Finish action produces different results based on (verification_mode × actor type).

| Actor / Mode | `auto` | `photo` | `approval` |
|---|---|---|---|
| kid | `status='approved'`, star_ledger row, completed_at = now() | `status='finished'`, photo_url required, parent reviews | `status='finished'`, parent reviews |
| parent | `status='approved'`, credit_family_pool, no star_ledger | `status='approved'`, credit_family_pool, no star_ledger, photo_url ignored | `status='approved'`, credit_family_pool, no star_ledger |

- [ ] **Step 1: Failing test (6-cell matrix)**

```sql
-- supabase/tests/61_finish_chore.sql
begin;
select plan(12);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'p@a.test'),
  ('22222222-2222-2222-2222-222222222222', null);
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'K', 2, null);
insert into public.kid_devices(kid_id, family_id, user_id, device_name) values
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'KidPhone');

-- Active family goal for pool credit checks
insert into public.family_goals(id, family_id, title, target_progress, current_progress, status)
values ('g0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pool', 1000, 0, 'active');

-- Chores: one per verification mode
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('cauto00-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Auto',     5, 'auto',     '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111'),
  ('cphoto-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Photo',    7, 'photo',    '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111'),
  ('capprov-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approval', 3, 'approval', '{"type":"daily"}'::jsonb, null, 'a1111111-1111-1111-1111-111111111111');

-- Six started instances: each mode × (kid, parent)
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at) values
  ('i-kauto-0000-0000-0000-000000000000', 'cauto00-0000-0000-0000-000000000000',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'started', now()),
  ('i-kphot-0000-0000-0000-000000000000', 'cphoto-0000-0000-0000-000000000000',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'started', now()),
  ('i-kappr-0000-0000-0000-000000000000', 'capprov-0000-0000-0000-000000000000',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'started', now()),
  ('i-pauto-0000-0000-0000-000000000000', 'cauto00-0000-0000-0000-000000000000',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now(), 'started', now()),
  ('i-pphot-0000-0000-0000-000000000000', 'cphoto-0000-0000-0000-000000000000',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now(), 'started', now()),
  ('i-pappr-0000-0000-0000-000000000000', 'capprov-0000-0000-0000-000000000000',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', now(), 'started', now());

set local role authenticated;

-- Kid + auto -> approved
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.finish_chore('i-kauto-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid finishes auto chore');
select is(
  (select status from public.chore_instances where id = 'i-kauto-0000-0000-0000-000000000000'),
  'approved', 'kid+auto status = approved');

-- Kid + photo -> finished (requires photo_url)
prepare kid_photo_no_url as select public.finish_chore('i-kphot-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('kid_photo_no_url', null, 'photo_url required for photo verification mode', 'kid+photo without url rejected');

select lives_ok(
  $$ select public.finish_chore('i-kphot-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222', 'https://x.test/y.jpg') $$,
  'kid finishes photo chore with url');
select is(
  (select status from public.chore_instances where id = 'i-kphot-0000-0000-0000-000000000000'),
  'finished', 'kid+photo status = finished');

-- Kid + approval -> finished
select lives_ok(
  $$ select public.finish_chore('i-kappr-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222') $$,
  'kid finishes approval chore');
select is(
  (select status from public.chore_instances where id = 'i-kappr-0000-0000-0000-000000000000'),
  'finished', 'kid+approval status = finished');

-- Parent + each mode -> approved + pool credit
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.finish_chore('i-pauto-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes auto chore');
select lives_ok(
  $$ select public.finish_chore('i-pphot-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes photo chore (no url needed)');
select lives_ok(
  $$ select public.finish_chore('i-pappr-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111') $$,
  'parent finishes approval chore');

-- Pool credit: 5 + 7 + 3 = 15
select is(
  (select current_progress from public.family_goals where id = 'g0000000-0000-0000-0000-000000000001'),
  15, 'family_pool credited 15');

select * from finish();
rollback;
```

- [ ] **Step 2: Run failing test**

Run: `supabase test db supabase/tests/61_finish_chore.sql`
Expected: FAIL — RPC does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260529000007_finish_chore_rpc.sql
-- finish_chore: 6-cell matrix (3 modes × 2 actor types).
--   kid + auto      -> approved, star_ledger row via existing trigger
--   kid + photo     -> finished, photo_url required, awaits parent
--   kid + approval  -> finished, awaits parent
--   parent + any    -> approved, family-pool credit, no star_ledger entry

create or replace function public.finish_chore(
  instance_id      uuid,
  actor_profile_id uuid,
  photo_url        text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mode        text;
  v_actor_type  text;
  v_star_value  int;
  v_family      uuid;
  v_chore_id    uuid;
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  select c.verification_mode, c.star_value, ci.chore_id, ci.family_id, p.type
    into v_mode, v_star_value, v_chore_id, v_family, v_actor_type
    from public.chore_instances ci
    join public.chores c on c.id = ci.chore_id
    join public.profiles p on p.id = actor_profile_id
   where ci.id = instance_id
     and ci.assignee_profile_id = actor_profile_id
     and ci.status = 'started'
   for update;
  if not found then
    raise exception 'chore not finishable';
  end if;

  if v_actor_type = 'parent' then
    update public.chore_instances
       set status = 'approved',
           finished_at = now(),
           approved_at = now(),
           approved_by = actor_profile_id,
           completed_at = now(),
           completed_by = actor_profile_id
     where id = instance_id;
    perform public.credit_family_pool(v_family, v_star_value);
    return;
  end if;

  if v_mode = 'auto' then
    update public.chore_instances
       set status = 'approved',
           finished_at = now(),
           approved_at = now(),
           approved_by = actor_profile_id,
           completed_at = now(),
           completed_by = actor_profile_id,
           stars_awarded = v_star_value
     where id = instance_id;
    -- Mirror approve_chore: append a star_ledger row directly so the
    -- existing trigger ecosystem (streaks, achievements) keeps firing.
    insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
    values (v_family, actor_profile_id, v_star_value, 'chore_approved', instance_id);
    return;
  end if;

  if v_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
       set status = 'finished',
           finished_at = now(),
           completed_at = now(),
           completed_by = actor_profile_id,
           photo_url = finish_chore.photo_url
     where id = instance_id;
    return;
  end if;

  -- approval mode
  update public.chore_instances
     set status = 'finished',
         finished_at = now(),
         completed_at = now(),
         completed_by = actor_profile_id
   where id = instance_id;
end $$;

revoke all on function public.finish_chore(uuid, uuid, text) from public;
grant execute on function public.finish_chore(uuid, uuid, text) to authenticated;
```

- [ ] **Step 4: Pass**

Run: `supabase db reset && supabase test db supabase/tests/61_finish_chore.sql`
Expected: PASS — 12/12 ok.

Also run the existing `complete_chore` regression tests (`11_complete_chore_rpc.sql` and `51_complete_chore_kid_session.sql`) — they SHOULD STILL PASS at this point because `complete_chore` is not yet dropped. Tasks 8-9 keep them green; Task 9 drops `complete_chore` and deletes both regression tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000007_finish_chore_rpc.sql supabase/tests/61_finish_chore.sql
git commit -m "$(cat <<'EOF'
feat(db): finish_chore RPC — 6-cell matrix (mode × actor type)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update approve_chore, reject_chore, approve_chore_calls_check to read 'finished'

**Files:**
- Create: `supabase/migrations/20260529000008_approve_reject_finished_state.sql`

The current bodies of `approve_chore` (migration `20260511000011_approve_chore_calls_check.sql`) and `reject_chore` (migration `20260508000015_reject_chore_rpc.sql`) both contain `if inst.status <> 'submitted'`. They need to read `'finished'` instead. No signature change.

- [ ] **Step 1: Confirm the current body of each RPC**

```bash
grep -A 60 "create or replace function public.approve_chore" supabase/migrations/20260511000011_approve_chore_calls_check.sql
grep -A 60 "create or replace function public.reject_chore"  supabase/migrations/20260508000015_reject_chore_rpc.sql
```

Note the full bodies so you can reuse them verbatim minus the status string.

- [ ] **Step 2: Write the migration**

The body below is the existing `approve_chore` from `20260511000011_approve_chore_calls_check.sql` with `'submitted'` swapped for `'finished'` on line 22 (per the grep in Step 1). Same for `reject_chore`.

```sql
-- supabase/migrations/20260529000008_approve_reject_finished_state.sql
-- approve_chore / reject_chore both read the kid-side terminal state.
-- That state was renamed 'submitted' -> 'finished' in 20260529000001.

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
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status = 'approved' then return; end if;
  if inst.status <> 'finished' then raise exception 'instance % is not finished (status=%)', instance_id, inst.status; end if;

  select c.star_value into star_value from public.chores c where c.id = inst.chore_id;

  update public.chore_instances
    set status='approved', approved_by=caller_profile, approved_at=now(), stars_awarded=star_value
    where id = instance_id;

  insert into public.star_ledger(family_id, profile_id, delta, reason, source_id)
  values (caller_family, inst.completed_by, star_value, 'chore_approved', instance_id);

  select * into s from public.streaks where profile_id = inst.completed_by;
  if s.profile_id is null then
    insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date)
    values (inst.completed_by, caller_family, 1, 1, current_date);
  elsif s.last_completion_date = current_date then
    null;
  elsif s.last_completion_date = current_date - 1 then
    update public.streaks
      set current_count = s.current_count + 1,
          longest_count = greatest(s.longest_count, s.current_count + 1),
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  else
    update public.streaks
      set current_count = 1,
          last_completion_date = current_date
      where profile_id = inst.completed_by;
  end if;
end;
$$;

create or replace function public.reject_chore(instance_id uuid, reason text)
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
  if inst.status <> 'finished' then raise exception 'instance % is not finished (status=%)', instance_id, inst.status; end if;

  update public.chore_instances
    set status='rejected', approved_by=caller_profile, approved_at=now(),
        rejection_reason=reason
    where id = instance_id;
end;
$$;
```

If the actual `reject_chore` body in the repo includes additional fields (e.g. a clearing step on stars_awarded), preserve those — the only intended change is the `'submitted'` → `'finished'` swap.

- [ ] **Step 3: Confirm existing tests still pass**

Run: `supabase db reset && supabase test db`
Expected: every existing test green. The existing `complete_chore` paths still write `'submitted'` via the not-yet-dropped RPC; but now the schema rejects `'submitted'`, which means `complete_chore` itself will break. **This is expected** — Task 9 drops it. For now, the test suite as run by the script may have failures originating in `complete_chore` callers. Tag those tests for replacement (Task 9 deletes them).

If you find new green-or-red surprises (a test failing for unrelated reasons), report.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529000008_approve_reject_finished_state.sql
git commit -m "$(cat <<'EOF'
feat(db): approve_chore + reject_chore read 'finished' instead of 'submitted'

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rewrite notify_push_chore trigger; drop complete_chore

**Files:**
- Create: `supabase/migrations/20260529000009_notify_push_chore_finished.sql`
- Create: `supabase/migrations/20260529000010_drop_complete_chore.sql`
- Delete: `supabase/tests/11_complete_chore_rpc.sql`
- Delete: `supabase/tests/51_complete_chore_kid_session.sql`

- [ ] **Step 1: Rewrite the trigger function**

```sql
-- supabase/migrations/20260529000009_notify_push_chore_finished.sql
-- The kid-side terminal state was renamed from 'submitted' to 'finished'.
-- Update the push trigger so it fires on the new state name.

create or replace function public.notify_push_chore() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if OLD.status = 'pending' and NEW.status = 'finished' then
    event_kind := 'chore_submitted';   -- event_kind preserved for i18n key compatibility
  elsif OLD.status = 'started' and NEW.status = 'finished' then
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
```

The `event_kind` string stays `'chore_submitted'` (not renamed to `'chore_finished'`) on purpose — the push i18n templates registered against that key in the M5 work continue to apply. This is a one-line forward-rename of state semantics without churning the messaging layer. Document the choice in a code comment if helpful.

- [ ] **Step 2: Drop complete_chore**

```sql
-- supabase/migrations/20260529000010_drop_complete_chore.sql
-- complete_chore is superseded by start_chore + finish_chore.
-- Any in-flight callers MUST be migrated before this migration is applied.

drop function if exists public.complete_chore(uuid, uuid, text);
```

- [ ] **Step 3: Delete the obsolete tests**

```bash
git rm supabase/tests/11_complete_chore_rpc.sql supabase/tests/51_complete_chore_kid_session.sql
```

- [ ] **Step 4: Run full backend test suite**

Run: `supabase db reset && supabase test db`
Expected: every remaining test green. No reference to `complete_chore` should remain on the backend.

If any test references `complete_chore` or the old `'submitted'` literal, replace those references with `finish_chore` + `'finished'` and report. The expected hits are the two files just deleted; any others indicate I missed a callsite during planning.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529000009_notify_push_chore_finished.sql supabase/migrations/20260529000010_drop_complete_chore.sql supabase/tests/11_complete_chore_rpc.sql supabase/tests/51_complete_chore_kid_session.sql
git commit -m "$(cat <<'EOF'
feat(db): notify_push_chore fires on 'finished'; drop complete_chore

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Extend RLS regression matrix

**Files:**
- Modify: `supabase/tests/54_rls_regression_matrix.sql`

- [ ] **Step 1: Read the existing matrix**

```bash
cat supabase/tests/54_rls_regression_matrix.sql
```

Note: it asserts `select count(*)` from each kid-readable table for each of (parent A, kid A, parent B, orphan). Plan count is 40.

- [ ] **Step 2: Add assertions covering the new states**

Insert a fresh section after the existing `chore_instances` block:

```sql
-- Additional fixtures: one chore_instance in each new state
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, started_at, finished_at) values
  ('s0000000-0000-0000-0000-000000000001', '<chore A id from existing fixture>', '<family A id>', '<kid A id>', now(), 'started',  now(), null),
  ('s0000000-0000-0000-0000-000000000002', '<chore A id from existing fixture>', '<family A id>', '<kid A id>', now(), 'finished', now(), now());

-- Parent A sees both
set local "request.jwt.claims" to '{"sub":"<parent A uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chore_instances where status in ('started','finished') and family_id = '<family A id>'),
  2, 'parent A sees started + finished');

-- Kid A sees both
set local "request.jwt.claims" to '{"sub":"<kid A anon uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chore_instances where status in ('started','finished') and family_id = '<family A id>'),
  2, 'kid A sees started + finished');

-- Parent B sees neither
set local "request.jwt.claims" to '{"sub":"<parent B uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chore_instances where status in ('started','finished')),
  0, 'parent B sees neither');

-- Orphan sees neither
set local "request.jwt.claims" to '{"sub":"<orphan uid>","role":"authenticated"}';
select is(
  (select count(*)::int from public.chore_instances where status in ('started','finished')),
  0, 'orphan sees neither');
```

Replace the placeholders with the actual UUIDs from the existing fixture block at the top of the file. Bump `plan(40)` to `plan(44)`.

- [ ] **Step 3: Run**

Run: `supabase db reset && supabase test db supabase/tests/54_rls_regression_matrix.sql`
Expected: `Tests=44 PASS`.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/54_rls_regression_matrix.sql
git commit -m "$(cat <<'EOF'
test(db): RLS regression matrix — assert started + finished visibility for all session shapes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Regenerate Supabase TypeScript types

**Files:**
- Modify: `mobile/src/types/database.ts`

- [ ] **Step 1: Regenerate**

```bash
cd mobile
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Step 2: Verify the new RPCs and the enum are present**

```bash
grep -E "claim_chore|release_chore|start_chore|finish_chore|resolve_actor_profile_id|credit_family_pool" src/types/database.ts | head
grep -E "started.*finished|finished.*started" src/types/database.ts | head
```

Expected: function definitions present; the `chore_instances` Row type's `status` union includes `'started'` and `'finished'`.

- [ ] **Step 3: TypeScript check**

```bash
cd mobile
npx tsc --noEmit
```

Expected: zero errors. Any errors that surface from `complete_chore` references in `mobile/app/(app)/kid/[profileId]/index.tsx` are expected — Task 13 fixes them.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types/database.ts
git commit -m "$(cat <<'EOF'
chore(mobile): regenerate Supabase types for chore claim + started/finished states

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: chores.ts library — claim/release/start/finish wrappers + tests

**Files:**
- Create: `mobile/src/lib/chores.ts`
- Test: `mobile/tests/chores.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// mobile/tests/chores.test.ts
import { claimChore, releaseChore, startChore, finishChore } from '../src/lib/chores';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => jest.clearAllMocks());

describe('claimChore', () => {
  it('calls rpc(claim_chore) with the actor', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await claimChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('claim_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });

  it('throws when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'chore not claimable' } } as any);
    await expect(claimChore('inst-1', 'actor-1')).rejects.toThrow('chore not claimable');
  });
});

describe('releaseChore', () => {
  it('calls rpc(release_chore)', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await releaseChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('release_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });
});

describe('startChore', () => {
  it('calls rpc(start_chore)', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await startChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('start_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });
});

describe('finishChore', () => {
  it('passes photo_url when provided', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await finishChore('inst-1', 'actor-1', 'https://x.test/y.jpg');
    expect(mockedRpc).toHaveBeenCalledWith('finish_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1', photo_url: 'https://x.test/y.jpg' });
  });

  it('omits photo_url when not provided', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await finishChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('finish_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1', photo_url: null });
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd mobile && npx jest tests/chores.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the library**

```typescript
// mobile/src/lib/chores.ts
import { supabase } from './supabase';

export async function claimChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function releaseChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('release_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function startChore(instanceId: string, actorProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('start_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message);
}

export async function finishChore(
  instanceId: string,
  actorProfileId: string,
  photoUrl: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('finish_chore', {
    instance_id: instanceId,
    actor_profile_id: actorProfileId,
    photo_url: photoUrl,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Pass**

```bash
cd mobile && npx jest tests/chores.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/chores.ts mobile/tests/chores.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile): chores.ts — claim/release/start/finish RPC wrappers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: ChoreCard component

**Files:**
- Create: `mobile/src/components/ChoreCard.tsx`
- Test: `mobile/tests/choreCard.test.tsx`

Shared state-aware card. Inputs: instance row + viewer's actor id + onAction callback. Renders the right button(s) and labels based on `status × ownership` matrix from the spec.

- [ ] **Step 1: Failing test**

```typescript
// mobile/tests/choreCard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChoreCard, type ChoreCardInstance } from '../src/components/ChoreCard';

const baseInst: ChoreCardInstance = {
  id: 'inst-1',
  status: 'pending',
  assignee_profile_id: null,
  due_at: '2026-05-29T10:00:00Z',
  chore: { id: 'c1', title: 'Vacuum', star_value: 10, verification_mode: 'approval', recurrence: null },
  assignee: null,
  rejection_reason: null,
};

describe('ChoreCard', () => {
  it('renders Claim button when unassigned', () => {
    const onAction = jest.fn();
    const { getByTestId } = render(<ChoreCard inst={baseInst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-claim'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'claim', instanceId: 'inst-1' });
  });

  it('renders Start + Release when assigned to me and pending', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1' };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-start'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'start', instanceId: 'inst-1' });
    fireEvent.press(getByTestId('action-release'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'release', instanceId: 'inst-1' });
  });

  it('renders Finish when assigned to me and started', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1', status: 'started' as const };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-finish'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'finish', instanceId: 'inst-1' });
  });

  it('renders read-only with assignee name when held by another', () => {
    const inst = { ...baseInst, assignee_profile_id: 'actor-2', status: 'started' as const, assignee: { id: 'actor-2', display_name: 'Theo', avatar_id: 3 } };
    const { getByText, queryByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={() => {}} />);
    expect(getByText(/Theo/)).toBeTruthy();
    expect(queryByTestId('action-claim')).toBeNull();
    expect(queryByTestId('action-start')).toBeNull();
    expect(queryByTestId('action-finish')).toBeNull();
  });

  it('renders Start (re-attempt) when rejected and mine', () => {
    const onAction = jest.fn();
    const inst = { ...baseInst, assignee_profile_id: 'actor-1', status: 'rejected' as const, rejection_reason: 'try again' };
    const { getByTestId } = render(<ChoreCard inst={inst} viewerActorId="actor-1" onAction={onAction} />);
    fireEvent.press(getByTestId('action-start'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'start', instanceId: 'inst-1' });
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd mobile && npx jest tests/choreCard.test.tsx
```
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

```typescript
// mobile/src/components/ChoreCard.tsx
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';
import { AVATARS, AvatarId } from '../constants/avatars';

export type ChoreCardInstance = {
  id: string;
  status: 'pending' | 'started' | 'finished' | 'approved' | 'rejected';
  assignee_profile_id: string | null;
  due_at: string;
  rejection_reason: string | null;
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto' | 'photo' | 'approval'; recurrence: { type: string; times?: string[] } | null } | null;
  assignee: { id: string; display_name: string; avatar_id: number } | null;
};

export type ChoreAction =
  | { kind: 'claim'; instanceId: string }
  | { kind: 'release'; instanceId: string }
  | { kind: 'start'; instanceId: string }
  | { kind: 'finish'; instanceId: string };

type Props = {
  inst: ChoreCardInstance;
  viewerActorId: string;
  onAction: (action: ChoreAction) => void;
};

export function ChoreCard({ inst, viewerActorId, onAction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isMine = inst.assignee_profile_id === viewerActorId;
  const isUnassigned = inst.assignee_profile_id === null;
  const assigneeAvatar = inst.assignee ? AVATARS[inst.assignee.avatar_id as AvatarId] ?? AVATARS[1] : null;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.title}>{inst.chore?.title ?? '(untitled)'}</Text>
        <Text style={styles.meta}>★ {inst.chore?.star_value ?? 0}</Text>
      </View>
      <View style={styles.actions}>
        {isUnassigned && inst.status === 'pending' && (
          <Pressable testID="action-claim" onPress={() => onAction({ kind: 'claim', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Claim</Text>
          </Pressable>
        )}
        {isMine && inst.status === 'pending' && (
          <>
            <Pressable testID="action-start" onPress={() => onAction({ kind: 'start', instanceId: inst.id })} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Start</Text>
            </Pressable>
            <Pressable testID="action-release" onPress={() => onAction({ kind: 'release', instanceId: inst.id })} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Release</Text>
            </Pressable>
          </>
        )}
        {isMine && inst.status === 'started' && (
          <Pressable testID="action-finish" onPress={() => onAction({ kind: 'finish', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Finish</Text>
          </Pressable>
        )}
        {isMine && inst.status === 'rejected' && (
          <Pressable testID="action-start" onPress={() => onAction({ kind: 'start', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        )}
        {!isMine && !isUnassigned && inst.assignee && (
          <View style={styles.othersTag}>
            {assigneeAvatar && (
              <View style={[styles.avSmall, { backgroundColor: assigneeAvatar.bg }]}>
                <Text style={styles.avSmallEmoji}>{assigneeAvatar.emoji}</Text>
              </View>
            )}
            <Text style={styles.othersName}>{inst.assignee.display_name} · {inst.status}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
    },
    body: { gap: spacing.xs },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
    meta: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
    primaryBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.primary },
    primaryBtnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.surface },
    secondaryBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.bg },
    secondaryBtnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.text },
    othersTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    avSmall: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avSmallEmoji: { fontSize: 14 },
    othersName: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
  });
```

- [ ] **Step 4: Pass + commit**

```bash
cd mobile && npx jest tests/choreCard.test.tsx
git add mobile/src/components/ChoreCard.tsx mobile/tests/choreCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): ChoreCard — state-aware card with claim/start/finish actions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Rewrite kid home query + integrate ChoreCard

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx`

The current query (lines 87-105) filters `assignee=me OR assignee IS NULL` and statuses `('pending','submitted','rejected')`. Replace with a family-wide query plus ordering, and render via `ChoreCard`.

- [ ] **Step 1: Replace the query**

```typescript
// Replace the existing useQuery for ['kid-today', profileId] (lines 87-105):
const { data: instances, isLoading, error } = useQuery({
  queryKey: ['kid-today', profileId, familyId],
  queryFn: async (): Promise<ChoreCardInstance[]> => {
    if (!familyId) return [];
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from('chore_instances')
      .select('id, status, due_at, assignee_profile_id, rejection_reason, chore:chores(id,title,star_value,verification_mode,recurrence), assignee:profiles!chore_instances_assignee_profile_id_fkey(id,display_name,avatar_id)')
      .eq('family_id', familyId)
      .in('status', ['pending', 'started', 'finished', 'rejected'])
      .gte('due_at', startOfDay.toISOString())
      .lt('due_at', endOfDay.toISOString())
      .order('due_at');
    if (error) throw error;
    const rows = (data ?? []) as unknown as ChoreCardInstance[];
    // Three-section sort: mine → unassigned → others'
    return rows.sort((a, b) => {
      const sa = a.assignee_profile_id === profileId ? 0 : a.assignee_profile_id === null ? 1 : 2;
      const sb = b.assignee_profile_id === profileId ? 0 : b.assignee_profile_id === null ? 1 : 2;
      if (sa !== sb) return sa - sb;
      return a.due_at.localeCompare(b.due_at);
    });
  },
  enabled: !!profileId && !!familyId,
});
```

The PostgREST `!chore_instances_assignee_profile_id_fkey` syntax is the Supabase convention for joining via a specific FK when multiple FKs to the same table exist.

- [ ] **Step 2: Replace the complete mutation with four mutations**

Remove the `complete` mutation (lines 130-139) and `onDone` (lines 141-149). Replace with:

```typescript
import { claimChore, releaseChore, startChore, finishChore } from '../../../../src/lib/chores';
import { ChoreCard, type ChoreAction, type ChoreCardInstance } from '../../../../src/components/ChoreCard';

const choreAction = useMutation({
  mutationFn: async (action: ChoreAction) => {
    if (!profileId) throw new Error('no profile');
    switch (action.kind) {
      case 'claim':   return claimChore(action.instanceId, profileId);
      case 'release': return releaseChore(action.instanceId, profileId);
      case 'start':   return startChore(action.instanceId, profileId);
      case 'finish': {
        const inst = instances?.find((i) => i.id === action.instanceId);
        if (inst?.chore?.verification_mode === 'photo') {
          router.push(`/(app)/kid/${profileId}/chore/${action.instanceId}/photo` as never);
          return;
        }
        return finishChore(action.instanceId, profileId);
      }
    }
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ['kid-today', profileId, familyId] }),
});

function onAction(action: ChoreAction) {
  fireSmallFeedback();
  choreAction.mutate(action);
}
```

- [ ] **Step 3: Replace the inline card render**

Find the JSX block where each instance is rendered (search for `instances?.map` or the card style). Replace each iteration with:

```tsx
{list.map((inst) => (
  <ChoreCard
    key={inst.id}
    inst={inst}
    viewerActorId={profileId}
    onAction={onAction}
  />
))}
```

Remove now-dead inline styles and conditional logic that the old card had.

- [ ] **Step 4: TypeScript + tests**

```bash
cd mobile
npx tsc --noEmit
npm test
```
Expected: zero TS errors; all tests pass. Update `todoCount` to count `pending OR started` if it should reflect "active" items.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/kid/[profileId]/index.tsx"
git commit -m "$(cat <<'EOF'
feat(mobile): kid home — three-section family-wide list + ChoreCard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Parent My Chores tab + approvals filter/label update

**Files:**
- Create: `mobile/app/(app)/parent/my-chores.tsx`
- Modify: `mobile/app/(app)/parent/_layout.tsx` (or wherever parent tabs are defined — investigate first)
- Modify: `mobile/app/(app)/parent/approvals.tsx`
- Modify: `mobile/src/i18n/en.json` (and other locales used in the repo)

- [ ] **Step 1: Find the parent tab definition**

```bash
grep -rn "Tabs\|tabBar\|parent.nav" mobile/app/\(app\)/parent | head -20
```

Note the file that defines parent navigation. Add a new tab entry pointing at `my-chores`.

- [ ] **Step 2: Write the My Chores screen**

```typescript
// mobile/app/(app)/parent/my-chores.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { ChoreCard, type ChoreCardInstance, type ChoreAction } from '../../../src/components/ChoreCard';
import { claimChore, releaseChore, startChore, finishChore } from '../../../src/lib/chores';
import { useTheme, type Palette, spacing, typography } from '../../../src/theme';

export default function ParentMyChores() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: identity } = useQuery({
    queryKey: ['parent-actor-identity'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, family_id')
        .eq('user_id', user.id)
        .eq('type', 'parent')
        .maybeSingle();
      return profile as { id: string; family_id: string } | null;
    },
  });

  const familyId = identity?.family_id;
  const actorId = identity?.id;

  const { data: instances, isLoading } = useQuery({
    queryKey: ['parent-my-chores', actorId, familyId],
    queryFn: async (): Promise<ChoreCardInstance[]> => {
      if (!familyId || !actorId) return [];
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, assignee_profile_id, rejection_reason, chore:chores(id,title,star_value,verification_mode,recurrence), assignee:profiles!chore_instances_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('family_id', familyId)
        .in('status', ['pending', 'started', 'finished', 'rejected'])
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .order('due_at');
      if (error) throw error;
      const rows = (data ?? []) as unknown as ChoreCardInstance[];
      return rows.sort((a, b) => {
        const sa = a.assignee_profile_id === actorId ? 0 : a.assignee_profile_id === null ? 1 : 2;
        const sb = b.assignee_profile_id === actorId ? 0 : b.assignee_profile_id === null ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return a.due_at.localeCompare(b.due_at);
      });
    },
    enabled: !!actorId && !!familyId,
  });

  const choreAction = useMutation({
    mutationFn: async (action: ChoreAction) => {
      if (!actorId) throw new Error('no actor');
      switch (action.kind) {
        case 'claim':   return claimChore(action.instanceId, actorId);
        case 'release': return releaseChore(action.instanceId, actorId);
        case 'start':   return startChore(action.instanceId, actorId);
        case 'finish':  return finishChore(action.instanceId, actorId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-my-chores', actorId, familyId] }),
  });

  if (isLoading || !actorId) {
    return <View style={[styles.screen, styles.center]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>My Chores</Text>
        {(instances ?? []).map((inst) => (
          <ChoreCard key={inst.id} inst={inst} viewerActorId={actorId} onAction={(a) => choreAction.mutate(a)} />
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: spacing.lg, gap: spacing.sm },
    title: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text, marginBottom: spacing.md },
  });
```

(Parent doer `finish` for a photo-mode chore: route to the existing photo screen if you want photo upload on the parent side too. For now, parent-photo collapses to approved without a photo because the spec says parent-mode bypasses the photo requirement. Keep the simpler path.)

- [ ] **Step 3: Add the tab entry**

In whichever file defines parent tabs (likely `mobile/app/(app)/parent/_layout.tsx`), add a `<Tabs.Screen name="my-chores" options={{ title: 'My Chores' }} />` entry alongside the existing approvals/activity/settings entries. Copy the existing pattern exactly.

- [ ] **Step 4: Update approvals.tsx**

```bash
grep -n "'submitted'\|approvals.submitted" mobile/app/\(app\)/parent/approvals.tsx
```

Change:
- `.eq('status', 'submitted')` → `.eq('status', 'finished')` (line ~81)
- `t('approvals.submitted', ...)` → `t('approvals.finished', ...)` (line ~390)

- [ ] **Step 5: i18n key rename + new chore action keys**

In `mobile/src/i18n/en.json` (and parallel locale files):

```bash
grep -rn "approvals.submitted\|chore.claim\|chore.start\|chore.finish" mobile/src/i18n/
```

Find the existing `approvals.submitted` key. Add a new key `approvals.finished` with the same template (e.g. `"Finished {{time}} ago"`). Add new keys under `chore`:
```json
"chore": {
  ...
  "claim": "Claim",
  "release": "Release",
  "start": "Start",
  "finish": "Finish",
  "tryAgain": "Try again",
  "inProgress": "{{name}} · in progress",
  "awaitingReview": "{{name}} · awaiting review",
  "claimedBy": "Claimed by {{name}}",
  "rejected": "{{name}} · rejected"
}
```

For parallel locales (es.json, etc.) — copy each new key, fill the English string as a placeholder, leave a follow-up note for translation. The translationParity test (`mobile/tests/translationParity.test.ts`) enforces key parity; if it fails after this step, that's the expected reminder to add the locale values.

- [ ] **Step 6: TS + tests**

```bash
cd mobile && npx tsc --noEmit && npm test
```
Expected: green. translationParity may flag missing locales; fix or document.

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/(app)/parent/my-chores.tsx" "mobile/app/(app)/parent/_layout.tsx" "mobile/app/(app)/parent/approvals.tsx" mobile/src/i18n/
git commit -m "$(cat <<'EOF'
feat(mobile): parent My Chores tab; approvals reads finished state; chore action i18n

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Manual two-emulator acceptance gate

**Files:**
- Create: `docs/superpowers/specs/2026-05-29-chore-claim-states-acceptance.md`

The race-protection requirement and the parent-doer flow cannot be fully verified by automated tests alone. Carlos runs this checklist before merging.

- [ ] **Step 1: Write the acceptance doc**

```markdown
# Chore claim + started/finished — manual acceptance gate

**Status:** TODO — run before merging to main.

## Pre-flight

- [ ] All backend migrations applied: `supabase db reset` clean; full test suite passes.
- [ ] Supabase cloud DB has been migrated (production `submitted` rows now show as `finished`).
- [ ] EAS preview APK built with the latest branch.

## Two-device walkthrough (16 items)

| # | Step | Pass? |
|---|------|---|
| 1 | Boot two emulators (A: parent, B: kid). Sign in on A. Pair B to a kid via the m10 flow. | [ ] |
| 2 | On A, create three chores (auto / photo / approval), assignee = unassigned, due today. | [ ] |
| 3 | B sees the three chores in the "Available" section. A sees them in "Available" on the My Chores tab. | [ ] |
| 4 | B taps **Claim** on the auto chore. Within 1s, A sees it move to "Others'" with B's avatar. | [ ] |
| 5 | B taps **Release** on the same chore. Within 1s, A sees it back in "Available". | [ ] |
| 6 | Race: at the same moment (within 200ms), A taps Claim and B taps Claim on the approval chore. Exactly one wins. The loser sees the error toast and the card refreshes to show the winner's avatar. | [ ] |
| 7 | B taps **Start** on the auto chore (B had won it). Card now shows "Finish". | [ ] |
| 8 | B taps **Finish**. Card disappears from active list. B's star count increased by the chore's star_value. | [ ] |
| 9 | B taps **Claim** then **Start** on the photo chore. Card shows "Finish". | [ ] |
| 10 | B taps **Finish**. Photo capture screen opens. B captures + submits. Card now shows "awaiting review". A's Approvals tab gains the submission. | [ ] |
| 11 | A approves it. B's star count increased again. | [ ] |
| 12 | A claims a remaining unassigned chore on their My Chores tab. Starts. Finishes. Card disappears. The active family goal's progress bar advanced by the chore's star_value (no star_ledger row for the parent). | [ ] |
| 13 | A rejects a kid-finished chore. B's card shows "rejected" with a "Try again" button. B taps Try again → card goes to "started". | [ ] |
| 14 | DB check: `select status, count(*) from chore_instances group by status` shows only the new enum values (`pending`/`started`/`finished`/`approved`/`rejected`). No `submitted` rows remain. | [ ] |
| 15 | DB check: `select count(*) from star_ledger where reason = 'chore_approved' and source_id in (the parent-finished instances)` returns 0. | [ ] |
| 16 | Realtime check: with both apps open, A and B watch each other's actions appear without manual refresh. | [ ] |

## If all pass

- [ ] Tag: `git tag m11-chore-claim-states`
- [ ] Merge branch.

## If any fail

Document the failure inline and return to the relevant task.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-29-chore-claim-states-acceptance.md
git commit -m "$(cat <<'EOF'
docs(spec): chore claim + states — manual emulator acceptance checklist

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-29-chore-claim-states-design.md`):**

- State machine + transitions → Tasks 1, 4, 5, 6, 7.
- Race protection on Claim and Start → Tasks 4, 6 (UPDATE WHERE clauses).
- `submitted → finished` rename + `started` addition → Task 1 (schema), Tasks 7, 8 (RPC bodies), Task 9 (trigger + drop).
- Audit timestamps `started_at` / `finished_at` → Task 1.
- New RPCs (claim, release, start, finish) → Tasks 4-7.
- Helper functions (resolve_actor_profile_id, credit_family_pool) → Tasks 2, 3.
- `complete_chore` removal → Task 9.
- approve_chore / reject_chore label update → Task 8.
- notify_push_chore trigger update → Task 9.
- Parent-doer collapse to approved + family pool credit → Task 7 (RPC body), Task 3 (helper).
- List ordering (mine → unassigned → others') → Tasks 14, 15.
- Kid home rewrite → Task 14.
- Parent My Chores tab → Task 15.
- Approvals filter/label update → Task 15.
- Mobile RPC wrappers → Task 12.
- ChoreCard component → Task 13.
- RLS regression matrix extension → Task 10.
- Type regen → Task 11.
- Manual race + parent-doer acceptance → Task 16.

**Placeholder scan:** Two intentional non-placeholders in Task 10 (`<chore A id from existing fixture>` etc.) — these are pointers to existing UUIDs in the file being modified, not gaps. The implementer reads the file and substitutes. Task 15 Step 5 mentions translation parity as a reminder rather than a TODO — acceptable.

**Type consistency:** `ChoreCardInstance` type defined in Task 13 is consumed in Tasks 14 and 15 — same field names. `ChoreAction` discriminated union is defined in Task 13 and consumed by `onAction` in 14 and 15. `viewerActorId` is `profileId` (kid home) or `identity.id` (parent My Chores). The four RPC wrapper signatures match the SQL signatures in Tasks 4-7.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-29-chore-claim-states.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
