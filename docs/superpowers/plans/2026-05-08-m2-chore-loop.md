# M2 — Core Chore Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the chore-creation, recurrence-generation, and kid-completion flow end-to-end (submission-side only) per `docs/superpowers/specs/2026-05-08-m2-chore-loop-design.md`.

**Architecture:** Postgres tables (`chores`, `chore_instances`) + 5 `security definer` RPCs + a Deno Edge Function on a `pg_cron` schedule for recurrence generation + private Supabase Storage bucket for chore-proof photos. Mobile uses Expo Router groups for parent and kid modes, route params for active profile, TanStack Query for server cache, and `expo-image-picker` + `expo-image-manipulator` for native-camera photo capture.

**Tech Stack:** Supabase (Postgres + Auth + Storage + Edge Functions + pg_cron), pgTAP, Deno (Edge Function), TypeScript, Expo SDK 54 / React Native 0.81 / Expo Router 6, TanStack Query v5, Jest + jest-expo, GitHub Actions.

---

## File structure

**New SQL migrations** (`supabase/migrations/`):
- `20260508000001_chores_table.sql` — `chores` table + indexes
- `20260508000002_chore_instances_table.sql` — `chore_instances` table + indexes
- `20260508000003_next_occurrence.sql` — `next_occurrence(jsonb, timestamptz)` SQL function
- `20260508000004_create_chore_rpc.sql` — `create_chore` RPC
- `20260508000005_update_chore_rpc.sql` — `update_chore` RPC
- `20260508000006_archive_chore_rpc.sql` — `archive_chore` RPC
- `20260508000007_complete_chore_rpc.sql` — `complete_chore` RPC
- `20260508000008_seed_starter_chores.sql` — `seed_starter_chores` RPC + one-shot backfill
- `20260508000009_chore_proofs_storage.sql` — `chore-proofs` bucket + storage policies
- `20260508000010_chore_generator_cron.sql` — pg_cron schedule that calls the Edge Function

**New pgTAP tests** (`supabase/tests/`):
- `05_chores_rls.sql`
- `06_chore_instances_rls.sql`
- `07_next_occurrence.sql`
- `08_create_chore_rpc.sql`
- `09_update_chore_rpc.sql`
- `10_archive_chore_rpc.sql`
- `11_complete_chore_rpc.sql`
- `12_seed_starter_chores.sql`

**New Edge Function** (`supabase/functions/`):
- `generate_chore_instances/index.ts`
- `generate_chore_instances/test.ts` (Deno test)

**New mobile files** (`mobile/`):
- `src/lib/queryClient.ts` — TanStack Query client
- `src/lib/recurrence.ts` — `formatRecurrence()` helper
- `src/components/PinPad.tsx` — 4-digit PIN modal
- `src/components/RecurrencePicker.tsx`
- `src/components/AssigneePicker.tsx`
- `src/components/VerificationModePicker.tsx`
- `app/(app)/kid/_layout.tsx`
- `app/(app)/kid/[profileId]/index.tsx` — kid home
- `app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx` — photo capture
- `app/(app)/parent/_layout.tsx` — bottom tabs
- `app/(app)/parent/index.tsx` — chores tab (default)
- `app/(app)/parent/chores/new.tsx` — create chore form
- `app/(app)/parent/chores/[id].tsx` — edit chore form
- `app/(app)/parent/activity.tsx` — activity feed
- `app/(app)/parent/settings.tsx` — settings tab

**New mobile tests** (`mobile/tests/`):
- `recurrence.test.ts`
- `PinPad.test.tsx`

**Modified mobile files:**
- `app/_layout.tsx` — wrap children in `QueryClientProvider`
- `app/(app)/index.tsx` — replace M1 family list with avatar lock screen
- `app/(onboarding)/create-family.tsx` — call `seed_starter_chores` after `create_family`
- `src/types/database.ts` — regenerated after migrations

**New CI:**
- `.github/workflows/ci.yml`

---

## Task 0: Branch + working directory

**Files:** none (git only)

- [ ] **Step 1: Create the M2 branch off the M1 tag**

```bash
git switch m1-foundations
git pull --ff-only 2>/dev/null || true
git switch -c m2-chore-loop
```

Expected: `Switched to a new branch 'm2-chore-loop'`.

- [ ] **Step 2: Verify Supabase local stack is up**

```bash
npx supabase status
```

Expected: API URL, DB URL, Studio URL all printed, status "running". If not, `npx supabase start` first.

- [ ] **Step 3: Verify M1 tests still pass before adding new code**

```bash
npx supabase test db
cd mobile && npx tsc --noEmit && npm test && cd ..
```

Expected: pgTAP shows `# All tests passed.`; tsc emits nothing; jest reports `Tests: ... passed`.

---

## Task 1: chores table

**Files:**
- Create: `supabase/migrations/20260508000001_chores_table.sql`
- Create: `supabase/tests/05_chores_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000001_chores_table.sql
create table public.chores (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  title               text not null check (length(title) between 1 and 80),
  description         text check (description is null or length(description) <= 500),
  star_value          int  not null check (star_value between 1 and 999),
  assignee_profile_id uuid references public.profiles(id),
  verification_mode   text not null check (verification_mode in ('auto','photo','approval')),
  recurrence          jsonb not null,
  next_due_at         timestamptz,
  active              boolean not null default true,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now()
);

create index chores_family_active_idx on public.chores(family_id) where active;
create index chores_next_due_idx on public.chores(next_due_at) where active and next_due_at is not null;

alter table public.chores enable row level security;

create policy chores_select_own_family on public.chores
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );

create policy chores_insert_own_family on public.chores
  for insert with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );

create policy chores_update_own_family on public.chores
  for update using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  ) with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );
-- No DELETE policy: archive_chore RPC sets active=false instead.
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/05_chores_rls.sql
begin;
select plan(4);

-- Two families, one parent each.
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');

insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');

insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');

-- Insert two chores bypassing RLS (we test access, not creation).
insert into public.chores(family_id, title, star_value, verification_mode, recurrence, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'a1111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'b2222222-2222-2222-2222-222222222222');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ select title from public.chores order by title $$,
  $$ values ('A-chore'::text) $$,
  'Alice sees only Family A chores'
);

select is_empty(
  $$ select * from public.chores where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B chores'
);

prepare hack_b as
  update public.chores set title = 'HACKED'
  where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select lives_ok('hack_b', 'UPDATE against Family B does not error');

reset role;
select results_eq(
  $$ select title from public.chores where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  $$ values ('B-chore'::text) $$,
  'Family B chore was untouched'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests — expect 5/5 passing**

```bash
npx supabase db reset
npx supabase test db
```

Expected: all five test files green (M1 01/03/04 + new 05).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000001_chores_table.sql supabase/tests/05_chores_rls.sql
git commit -m "feat(db): chores table + RLS policies + pgTAP isolation test"
```

---

## Task 2: chore_instances table

**Files:**
- Create: `supabase/migrations/20260508000002_chore_instances_table.sql`
- Create: `supabase/tests/06_chore_instances_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000002_chore_instances_table.sql
create table public.chore_instances (
  id                  uuid primary key default gen_random_uuid(),
  chore_id            uuid not null references public.chores(id) on delete cascade,
  family_id           uuid not null references public.families(id) on delete cascade,
  assignee_profile_id uuid references public.profiles(id),
  due_at              timestamptz not null,
  status              text not null default 'pending'
                       check (status in ('pending','submitted','approved','rejected')),
  completed_by        uuid references public.profiles(id),
  completed_at        timestamptz,
  photo_url           text,
  approved_by         uuid references public.profiles(id),
  approved_at         timestamptz,
  rejection_reason    text,
  stars_awarded       int,
  unique (chore_id, due_at)
);

create index chore_instances_family_status_idx on public.chore_instances(family_id, status);
create index chore_instances_open_assignee_idx on public.chore_instances(assignee_profile_id, due_at)
  where status in ('pending','submitted');

alter table public.chore_instances enable row level security;

create policy chore_instances_select_own_family on public.chore_instances
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chore_instances.family_id)
  );

create policy chore_instances_update_own_family on public.chore_instances
  for update using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chore_instances.family_id)
  ) with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chore_instances.family_id)
  );
-- No INSERT policy: instances are inserted by the generate_chore_instances Edge Function (service role).
-- No DELETE policy: chore_instances are append-only.
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/06_chore_instances_rls.sql
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
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B-chore', 10, 'approval', '{"type":"daily"}'::jsonb, 'b2222222-2222-2222-2222-222222222222');

insert into public.chore_instances(chore_id, family_id, due_at) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.chore_instances), 1,
  'Alice sees only her family''s instance'
);

select is_empty(
  $$ select * from public.chore_instances where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B instances'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

Expected: all 6 test files green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000002_chore_instances_table.sql supabase/tests/06_chore_instances_rls.sql
git commit -m "feat(db): chore_instances table + RLS"
```

---

## Task 3: next_occurrence helper

**Files:**
- Create: `supabase/migrations/20260508000003_next_occurrence.sql`
- Create: `supabase/tests/07_next_occurrence.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000003_next_occurrence.sql
create or replace function public.next_occurrence(rec jsonb, after timestamptz)
  returns timestamptz
  language plpgsql immutable
as $$
declare
  rtype text := rec->>'type';
  due_str text;
  due_ts timestamptz;
  i int;
  d int;
  candidate timestamptz;
begin
  if rtype = 'once' then
    due_str := rec->>'due';
    if due_str is null then
      raise exception 'recurrence type=once requires "due"';
    end if;
    due_ts := (due_str::date)::timestamptz;
    if due_ts > after then
      return due_ts;
    else
      return null;  -- already past or already generated
    end if;

  elsif rtype = 'daily' then
    -- next day at 00:00 UTC after `after`
    return ((after::date) + interval '1 day')::timestamptz;

  elsif rtype = 'weekly' then
    if jsonb_array_length(coalesce(rec->'days', '[]'::jsonb)) = 0 then
      raise exception 'recurrence type=weekly requires non-empty "days"';
    end if;
    -- search forward up to 7 days for the next matching weekday (0=Sun..6=Sat)
    for i in 1..7 loop
      candidate := ((after::date) + (i || ' days')::interval)::timestamptz;
      d := extract(dow from candidate)::int;
      if exists (select 1 from jsonb_array_elements_text(rec->'days') x where x.value::int = d) then
        return candidate;
      end if;
    end loop;
    raise exception 'next_occurrence: no matching weekday found in 7-day search (impossible)';

  else
    raise exception 'unknown recurrence type: %', rtype;
  end if;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/07_next_occurrence.sql
begin;
select plan(8);

-- Once: future date returns the date.
select is(
  public.next_occurrence('{"type":"once","due":"2099-01-15"}'::jsonb, '2026-05-08T00:00:00Z'::timestamptz)::date,
  '2099-01-15'::date,
  'once: future date returned'
);

-- Once: past date returns null.
select is(
  public.next_occurrence('{"type":"once","due":"2020-01-01"}'::jsonb, '2026-05-08T00:00:00Z'::timestamptz),
  null::timestamptz,
  'once: past date returns null'
);

-- Daily: returns next-day midnight.
select is(
  public.next_occurrence('{"type":"daily"}'::jsonb, '2026-05-08T15:30:00Z'::timestamptz)::date,
  '2026-05-09'::date,
  'daily: next day'
);

-- Weekly: today is Fri 2026-05-08 (dow=5). With days=[1] (Mon) → next Mon = 2026-05-11.
select is(
  public.next_occurrence('{"type":"weekly","days":[1]}'::jsonb, '2026-05-08T12:00:00Z'::timestamptz)::date,
  '2026-05-11'::date,
  'weekly: Mon-only after Fri'
);

-- Weekly: days=[5] (Fri itself) skips today, returns next Fri = 2026-05-15.
select is(
  public.next_occurrence('{"type":"weekly","days":[5]}'::jsonb, '2026-05-08T12:00:00Z'::timestamptz)::date,
  '2026-05-15'::date,
  'weekly: same-weekday returns next week'
);

-- Weekly: M/W/F — from Fri returns next Mon.
select is(
  public.next_occurrence('{"type":"weekly","days":[1,3,5]}'::jsonb, '2026-05-08T12:00:00Z'::timestamptz)::date,
  '2026-05-11'::date,
  'weekly: M/W/F from Fri returns Mon'
);

-- Weekly: empty days raises.
prepare empty_days as select public.next_occurrence('{"type":"weekly","days":[]}'::jsonb, now());
select throws_ok('empty_days', null, null, 'weekly: empty days raises');

-- Unknown type raises.
prepare bad_type as select public.next_occurrence('{"type":"yearly"}'::jsonb, now());
select throws_ok('bad_type', null, null, 'unknown type raises');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

Expected: all 7 test files green; 8 assertions pass in 07_next_occurrence.sql.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000003_next_occurrence.sql supabase/tests/07_next_occurrence.sql
git commit -m "feat(db): next_occurrence helper covers once/daily/weekly"
```

---

## Task 4: create_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000004_create_chore_rpc.sql`
- Create: `supabase/tests/08_create_chore_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000004_create_chore_rpc.sql
create or replace function public.create_chore(
  family_id           uuid,
  title               text,
  description         text,
  star_value          int,
  assignee_profile_id uuid,
  verification_mode   text,
  recurrence          jsonb
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
  -- caller must be a parent in this family
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent' and profiles.family_id = create_chore.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  -- assignee must be in same family if provided
  if assignee_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = assignee_profile_id and profiles.family_id = create_chore.family_id
  ) then
    raise exception 'assignee % not in family %', assignee_profile_id, family_id;
  end if;

  -- recurrence shape sanity (next_occurrence will also validate)
  perform public.next_occurrence(recurrence, now());

  initial_next_due := public.next_occurrence(recurrence, now() - interval '1 second');

  insert into public.chores(
    family_id, title, description, star_value, assignee_profile_id,
    verification_mode, recurrence, next_due_at, created_by
  ) values (
    create_chore.family_id, create_chore.title, create_chore.description,
    create_chore.star_value, create_chore.assignee_profile_id,
    create_chore.verification_mode, create_chore.recurrence,
    initial_next_due, caller_profile
  ) returning id into new_id;

  return new_id;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/08_create_chore_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('b9999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Other', 2, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Happy path: parent creates a daily chore.
select isnt(
  public.create_chore(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Make bed', null, 10,
    'a2222222-2222-2222-2222-222222222222', 'approval', '{"type":"daily"}'::jsonb
  ),
  null,
  'create_chore returns id on happy path'
);

-- 2. next_due_at is populated.
select isnt(
  (select next_due_at from public.chores where title = 'Make bed' limit 1),
  null,
  'next_due_at is computed'
);

-- 3. Cannot create in another family.
prepare cross_family as select public.create_chore(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stolen', null, 10,
  null, 'auto', '{"type":"daily"}'::jsonb);
select throws_ok('cross_family', null, null, 'cannot create chore in another family');

-- 4. Cannot use kid from other family as assignee.
prepare cross_assignee as select public.create_chore(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bad assignee', null, 10,
  'b9999999-9999-9999-9999-999999999999', 'auto', '{"type":"daily"}'::jsonb);
select throws_ok('cross_assignee', null, null, 'cannot assign chore to kid in another family');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

Expected: all 8 test files green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000004_create_chore_rpc.sql supabase/tests/08_create_chore_rpc.sql
git commit -m "feat(db): create_chore RPC with family + assignee validation"
```

---

## Task 5: update_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000005_update_chore_rpc.sql`
- Create: `supabase/tests/09_update_chore_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000005_update_chore_rpc.sql
create or replace function public.update_chore(
  chore_id            uuid,
  title               text default null,
  description         text default null,
  star_value          int  default null,
  assignee_profile_id uuid default null,
  clear_assignee      boolean default false,  -- explicit "set assignee to NULL"
  verification_mode   text default null,
  recurrence          jsonb default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family uuid;
  target_family uuid;
begin
  select profiles.family_id into caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select c.family_id into target_family from public.chores c where c.id = chore_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'chore % not in caller family', chore_id;
  end if;

  -- If assignee_profile_id provided and not null, validate same-family membership.
  if assignee_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = assignee_profile_id and profiles.family_id = caller_family
  ) then
    raise exception 'assignee % not in family', assignee_profile_id;
  end if;

  -- If recurrence provided, validate via next_occurrence.
  if recurrence is not null then
    perform public.next_occurrence(recurrence, now());
  end if;

  update public.chores set
    title             = coalesce(update_chore.title, chores.title),
    description       = coalesce(update_chore.description, chores.description),
    star_value        = coalesce(update_chore.star_value, chores.star_value),
    assignee_profile_id =
      case when clear_assignee then null
           when update_chore.assignee_profile_id is not null then update_chore.assignee_profile_id
           else chores.assignee_profile_id end,
    verification_mode = coalesce(update_chore.verification_mode, chores.verification_mode),
    recurrence        = coalesce(update_chore.recurrence, chores.recurrence),
    next_due_at       =
      case when update_chore.recurrence is not null
           then public.next_occurrence(update_chore.recurrence, now() - interval '1 second')
           else chores.next_due_at end
  where id = chore_id;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/09_update_chore_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Make bed', 10, 'approval', '{"type":"daily"}'::jsonb, 'a1111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Patch title.
select lives_ok(
  $$ select public.update_chore(chore_id := 'c1111111-1111-1111-1111-111111111111', title := 'Tidy bed') $$,
  'update_chore patches title'
);
select is((select title from public.chores where id = 'c1111111-1111-1111-1111-111111111111'), 'Tidy bed', 'title was updated');

-- 2. Switching recurrence recomputes next_due_at.
select lives_ok(
  $$ select public.update_chore(chore_id := 'c1111111-1111-1111-1111-111111111111', recurrence := '{"type":"weekly","days":[1]}'::jsonb) $$,
  'update_chore patches recurrence'
);

-- 3. Cross-family update fails.
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
prepare cross_update as select public.update_chore(chore_id := 'c1111111-1111-1111-1111-111111111111', title := 'HACKED');
select throws_ok('cross_update', null, null, 'Bob cannot update Family A chore');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

Expected: all 9 test files green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000005_update_chore_rpc.sql supabase/tests/09_update_chore_rpc.sql
git commit -m "feat(db): update_chore RPC with optional patch fields"
```

---

## Task 6: archive_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000006_archive_chore_rpc.sql`
- Create: `supabase/tests/10_archive_chore_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000006_archive_chore_rpc.sql
create or replace function public.archive_chore(chore_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_family uuid; target_family uuid;
begin
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select c.family_id into target_family from public.chores c where c.id = archive_chore.chore_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'chore % not in caller family', chore_id;
  end if;

  update public.chores set active = false, next_due_at = null where id = archive_chore.chore_id;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/10_archive_chore_rpc.sql
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
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, created_by, next_due_at) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 10, 'approval', '{"type":"daily"}'::jsonb, 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.archive_chore('c1111111-1111-1111-1111-111111111111') $$,
  'archive_chore succeeds for parent of family'
);
select is((select active from public.chores where id = 'c1111111-1111-1111-1111-111111111111'), false, 'active is false');
select is((select next_due_at from public.chores where id = 'c1111111-1111-1111-1111-111111111111'), null::timestamptz, 'next_due_at cleared');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000006_archive_chore_rpc.sql supabase/tests/10_archive_chore_rpc.sql
git commit -m "feat(db): archive_chore RPC (soft delete)"
```

---

## Task 7: complete_chore RPC

**Files:**
- Create: `supabase/migrations/20260508000007_complete_chore_rpc.sql`
- Create: `supabase/tests/11_complete_chore_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000007_complete_chore_rpc.sql
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
  inst            public.chore_instances%rowtype;
  chore_mode      text;
  kid_family      uuid;
  kid_type        text;
begin
  -- caller must be a parent
  select profiles.family_id into caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_family is null then raise exception 'caller is not a parent'; end if;

  select * into inst from public.chore_instances where id = instance_id for update;
  if inst.id is null then raise exception 'instance % not found', instance_id; end if;
  if inst.family_id <> caller_family then raise exception 'instance % not in caller family', instance_id; end if;
  if inst.status <> 'pending' then raise exception 'instance % is not pending (status=%)', instance_id, inst.status; end if;

  -- kid must exist in same family
  select profiles.family_id, profiles.type into kid_family, kid_type
  from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in caller family', kid_profile_id;
  end if;

  -- assignee match against the instance snapshot
  if inst.assignee_profile_id is not null and inst.assignee_profile_id <> kid_profile_id then
    raise exception 'kid_profile_id % is not the assignee of instance %', kid_profile_id, instance_id;
  end if;

  -- branch by chore's verification_mode
  select c.verification_mode into chore_mode from public.chores c where c.id = inst.chore_id;

  if chore_mode = 'auto' then
    update public.chore_instances
      set status = 'approved', completed_by = kid_profile_id, completed_at = now()
      where id = instance_id;
  elsif chore_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now(), photo_url = complete_chore.photo_url
      where id = instance_id;
  elsif chore_mode = 'approval' then
    update public.chore_instances
      set status = 'submitted', completed_by = kid_profile_id, completed_at = now()
      where id = instance_id;
  else
    raise exception 'unknown verification_mode: %', chore_mode;
  end if;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/11_complete_chore_rpc.sql
begin;
select plan(7);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Leo',   3, null);

-- One auto chore, one photo chore, one approval chore.
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Auto',     10, 'auto',     '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Photo',    10, 'photo',    '{"type":"daily"}'::jsonb, null,                                   'a1111111-1111-1111-1111-111111111111'),
  ('c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Approval', 10, 'approval', '{"type":"daily"}'::jsonb, 'a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now()),
  ('22222222-aaaa-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,                                   now()),
  ('33333333-aaaa-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. Auto: kid completes → status approved.
select lives_ok(
  $$ select public.complete_chore('11111111-aaaa-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222') $$,
  'auto chore completes'
);
select is((select status from public.chore_instances where id = '11111111-aaaa-1111-1111-111111111111'), 'approved', 'auto status approved');

-- 2. Photo without URL: raises.
prepare photo_no_url as select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('photo_no_url', null, null, 'photo without URL raises');

-- 3. Photo with URL: status submitted.
select lives_ok(
  $$ select public.complete_chore('22222222-aaaa-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'http://x/y.jpg') $$,
  'photo chore submits with URL'
);
select is((select status from public.chore_instances where id = '22222222-aaaa-2222-2222-222222222222'), 'submitted', 'photo status submitted');

-- 4. Approval mode: assignee mismatch raises.
prepare wrong_kid as select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222');
select throws_ok('wrong_kid', null, null, 'wrong assignee raises');

-- 5. Approval mode: correct kid succeeds.
select lives_ok(
  $$ select public.complete_chore('33333333-aaaa-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333') $$,
  'approval chore submits with correct kid'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000007_complete_chore_rpc.sql supabase/tests/11_complete_chore_rpc.sql
git commit -m "feat(db): complete_chore RPC with mode branching + assignee snapshot check"
```

---

## Task 8: seed_starter_chores RPC + backfill

**Files:**
- Create: `supabase/migrations/20260508000008_seed_starter_chores.sql`
- Create: `supabase/tests/12_seed_starter_chores.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000008_seed_starter_chores.sql
create or replace function public.seed_starter_chores(family_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  inserted int := 0;
begin
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent' and profiles.family_id = seed_starter_chores.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  -- idempotent: no-op if family already has any chore
  if exists (select 1 from public.chores where chores.family_id = seed_starter_chores.family_id) then
    return 0;
  end if;

  insert into public.chores(family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by, next_due_at)
  select seed_starter_chores.family_id, t.title, 10, 'approval', '{"type":"daily"}'::jsonb, null, caller_profile,
         public.next_occurrence('{"type":"daily"}'::jsonb, now() - interval '1 second')
  from (values ('Make bed'), ('Brush teeth'), ('Feed pet'), ('Tidy room'), ('Homework')) t(title);

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- One-shot backfill for any pre-M2 family. Service-role context, so we sidestep
-- the auth.uid() check inside seed_starter_chores by inlining the same insert here.
do $$
declare f record; pp uuid;
begin
  for f in select id from public.families loop
    if not exists (select 1 from public.chores where chores.family_id = f.id) then
      select id into pp from public.profiles where profiles.family_id = f.id and type = 'parent' limit 1;
      if pp is null then continue; end if;
      insert into public.chores(family_id, title, star_value, verification_mode, recurrence, created_by, next_due_at)
      select f.id, t.title, 10, 'approval', '{"type":"daily"}'::jsonb, pp,
             public.next_occurrence('{"type":"daily"}'::jsonb, now() - interval '1 second')
      from (values ('Make bed'), ('Brush teeth'), ('Feed pet'), ('Tidy room'), ('Homework')) t(title);
    end if;
  end loop;
end $$;
```

- [ ] **Step 2: Write the failing pgTAP test**

```sql
-- supabase/tests/12_seed_starter_chores.sql
begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(public.seed_starter_chores('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 5, 'first call inserts 5');
select is(public.seed_starter_chores('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'second call inserts 0 (idempotent)');
select is((select count(*)::int from public.chores where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 5, 'still 5 chores total');

select * from finish();
rollback;
```

- [ ] **Step 3: Run tests**

```bash
npx supabase db reset && npx supabase test db
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000008_seed_starter_chores.sql supabase/tests/12_seed_starter_chores.sql
git commit -m "feat(db): seed_starter_chores RPC + one-shot backfill"
```

---

## Task 9: chore-proofs storage bucket + policies

**Files:**
- Create: `supabase/migrations/20260508000009_chore_proofs_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000009_chore_proofs_storage.sql
insert into storage.buckets (id, name, public) values ('chore-proofs', 'chore-proofs', false)
  on conflict (id) do nothing;

-- Path convention: family/{family_id}/chore-proofs/{instance_id}.jpg
-- Storage RLS uses storage.foldername(name) → array; index 1 = 'family', 2 = family_id.

create policy "chore_proofs_insert_own_family" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chore-proofs'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.type = 'parent'
        and p.family_id::text = (storage.foldername(name))[2]
    )
  );

create policy "chore_proofs_select_own_family" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chore-proofs'
    and (storage.foldername(name))[1] = 'family'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.type = 'parent'
        and p.family_id::text = (storage.foldername(name))[2]
    )
  );
```

- [ ] **Step 2: Verify migration applies cleanly**

```bash
npx supabase db reset && npx supabase test db
```

Expected: no error; existing 12 test files still green.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260508000009_chore_proofs_storage.sql
git commit -m "feat(db): chore-proofs storage bucket with parent-only RLS"
```

---

## Task 10: generate_chore_instances Edge Function

**Files:**
- Create: `supabase/functions/generate_chore_instances/index.ts`
- Create: `supabase/functions/generate_chore_instances/test.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/generate_chore_instances/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MAX_BACKFILL_PER_CHORE = 14;

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: chores, error } = await supabase
    .from('chores')
    .select('id, family_id, assignee_profile_id, recurrence, next_due_at')
    .eq('active', true)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff);
  if (error) return new Response(error.message, { status: 500 });

  let totalInserted = 0;
  for (const chore of chores ?? []) {
    let nextDue: string | null = chore.next_due_at;
    let iter = 0;
    while (nextDue && new Date(nextDue) <= new Date(cutoff) && iter < MAX_BACKFILL_PER_CHORE) {
      // 1. Insert instance (idempotent via unique (chore_id, due_at)).
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

      // 2. Advance next_due_at via SQL helper.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('next_occurrence', {
        rec: chore.recurrence,
        after: nextDue,
      });
      if (rpcErr) return new Response(`next_occurrence failed: ${rpcErr.message}`, { status: 500 });
      nextDue = rpcData as string | null;
      iter++;
    }

    await supabase.from('chores').update({ next_due_at: nextDue }).eq('id', chore.id);
  }

  return new Response(JSON.stringify({ inserted: totalInserted, chores: chores?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Write the Deno test**

```typescript
// supabase/functions/generate_chore_instances/test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// This test assumes `npx supabase start` is up, the function is served via
// `npx supabase functions serve generate_chore_instances`, and the schema is fresh.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_URL = `${SUPABASE_URL}/functions/v1/generate_chore_instances`;

Deno.test('generates one instance per overdue chore (idempotent)', async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Seed: family + parent + one daily chore with next_due_at = now() - 1h
  const familyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await supabase.from('families').insert({ id: familyId, name: 'TestFam' });
  await supabase.auth.admin.createUser({ id: userId, email: `${userId}@test.com`, password: 'x' });
  const { data: parent } = await supabase
    .from('profiles')
    .insert({ family_id: familyId, type: 'parent', display_name: 'P', avatar_id: 1, user_id: userId })
    .select('id').single();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('chores').insert({
    family_id: familyId, title: 'X', star_value: 10, verification_mode: 'auto',
    recurrence: { type: 'daily' }, next_due_at: past, created_by: parent!.id,
  });

  // First call generates instances.
  const r1 = await fetch(FN_URL, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  assertEquals(r1.status, 200);
  const j1 = await r1.json();
  if (j1.inserted < 1) throw new Error(`expected at least 1 insert, got ${j1.inserted}`);

  // Second call inserts nothing new (idempotent — duplicate guarded by unique (chore_id, due_at)).
  const r2 = await fetch(FN_URL, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  const j2 = await r2.json();
  assertEquals(j2.inserted, 0);

  // Cleanup
  await supabase.from('families').delete().eq('id', familyId);
  await supabase.auth.admin.deleteUser(userId);
});
```

- [ ] **Step 3: Test by running the function against local Supabase**

```bash
# Terminal 1
npx supabase functions serve generate_chore_instances --no-verify-jwt

# Terminal 2 — run the test
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o json | jq -r '.[]|select(.name=="service_role_key")|.value')
deno test --allow-net --allow-env supabase/functions/generate_chore_instances/test.ts
```

Expected: `ok | 1 passed`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate_chore_instances/
git commit -m "feat(edge): generate_chore_instances edge function with idempotent insert"
```

---

## Task 11: pg_cron schedule for the generator

**Files:**
- Create: `supabase/migrations/20260508000010_chore_generator_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260508000010_chore_generator_cron.sql
-- Schedule the Edge Function via pg_cron + pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'generate_chore_instances_daily',
  '5 0 * * *',  -- 00:05 UTC every day
  $$
  select net.http_post(
    url := current_setting('app.settings.functions_base_url', true) || '/generate_chore_instances',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb
  ) $$
);

-- Note: app.settings.functions_base_url and app.settings.service_role_key must be set
-- by the deploy step (in Supabase Cloud, configure via the dashboard's "Database settings ▸
-- Custom postgres config" or `ALTER DATABASE postgres SET app.settings.foo = '...'`).
-- For local dev, set them after `supabase start`:
--   psql "$DB_URL" -c "alter database postgres set app.settings.functions_base_url = 'http://host.docker.internal:54321/functions/v1';"
--   psql "$DB_URL" -c "alter database postgres set app.settings.service_role_key = '<key>';"
```

- [ ] **Step 2: Verify migration applies; cron extension may not be on local Supabase**

```bash
npx supabase db reset
```

If the local stack doesn't ship `pg_cron`, the migration will error. In that case, wrap the `cron.schedule` call in a `do $$ begin ... exception when undefined_table then null; end $$` block. Test on a local stack first; if it errors, edit and try again.

- [ ] **Step 3: Run pgTAP**

```bash
npx supabase test db
```

Expected: 12 test files green; the cron schedule itself isn't tested (it's environmental).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000010_chore_generator_cron.sql
git commit -m "feat(db): pg_cron schedule for daily chore-instance generation"
```

---

## Task 12: Regenerate database TypeScript types

**Files:**
- Modify: `mobile/src/types/database.ts`

- [ ] **Step 1: Regenerate types from local Supabase**

```bash
npx supabase gen types typescript --local > mobile/src/types/database.ts
```

- [ ] **Step 2: Verify no compile errors in mobile**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no output (clean type-check).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/types/database.ts
git commit -m "chore(types): regenerate database types after M2 schema migrations"
```

---

## Task 13: Install M2 mobile dependencies

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd mobile
npx expo install expo-image-picker expo-image-manipulator
npm install @tanstack/react-query
```

`expo install` resolves Expo-SDK-compatible versions for the picker and manipulator.

- [ ] **Step 2: Verify install**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add expo-image-picker, expo-image-manipulator, @tanstack/react-query"
```

---

## Task 14: TanStack Query setup in root layout

**Files:**
- Create: `mobile/src/lib/queryClient.ts`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Create the QueryClient**

```typescript
// mobile/src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
```

- [ ] **Step 2: Wrap the root layout**

```typescript
// mobile/app/_layout.tsx — modify, full file:
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../src/hooks/useAuth';
import { useFamily } from '../src/hooks/useFamily';
import { queryClient } from '../src/lib/queryClient';

export default function RootLayout() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.session.user.id : undefined;
  const family = useFamily(userId);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'authenticated' && family.status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (auth.status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (auth.status === 'authenticated' && family.status === 'no-family' && !inOnboardingGroup) {
      router.replace('/(onboarding)/create-family');
    } else if (auth.status === 'authenticated' && family.status === 'has-family' && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [auth, family, segments]);

  if (auth.status === 'loading' || (auth.status === 'authenticated' && family.status === 'loading')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Verify type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/queryClient.ts mobile/app/_layout.tsx
git commit -m "feat(mobile): wire TanStack Query provider in root layout"
```

---

## Task 15: formatRecurrence helper + tests

**Files:**
- Create: `mobile/src/lib/recurrence.ts`
- Create: `mobile/tests/recurrence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/recurrence.test.ts
import { formatRecurrence } from '../src/lib/recurrence';

describe('formatRecurrence', () => {
  it('formats one-off with date', () => {
    expect(formatRecurrence({ type: 'once', due: '2026-05-09' })).toBe('Once on May 9, 2026');
  });

  it('formats daily', () => {
    expect(formatRecurrence({ type: 'daily' })).toBe('Daily');
  });

  it('formats weekly with single day', () => {
    expect(formatRecurrence({ type: 'weekly', days: [1] })).toBe('Mon');
  });

  it('formats weekly with multiple days in canonical order', () => {
    expect(formatRecurrence({ type: 'weekly', days: [5, 1, 3] })).toBe('Mon · Wed · Fri');
  });

  it('formats weekly with all 7 days as "Every day"', () => {
    expect(formatRecurrence({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd mobile && npm test -- recurrence
```

- [ ] **Step 3: Implement**

```typescript
// mobile/src/lib/recurrence.ts
export type Recurrence =
  | { type: 'once'; due: string }
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatRecurrence(rec: Recurrence): string {
  if (rec.type === 'once') {
    const d = new Date(rec.due + 'T00:00:00Z');
    return `Once on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
  }
  if (rec.type === 'daily') return 'Daily';
  if (rec.type === 'weekly') {
    if (rec.days.length === 7) return 'Every day';
    return [...rec.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(' · ');
  }
  return 'Unknown';
}
```

- [ ] **Step 4: Run test — expect PASS (5/5)**

```bash
cd mobile && npm test -- recurrence
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/recurrence.ts mobile/tests/recurrence.test.ts
git commit -m "feat(mobile): formatRecurrence helper with one-off/daily/weekly support"
```

---

## Task 16: PinPad component + tests

**Files:**
- Create: `mobile/src/components/PinPad.tsx`
- Create: `mobile/tests/PinPad.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/tests/PinPad.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PinPad } from '../src/components/PinPad';

describe('PinPad', () => {
  it('calls onSubmit with 4 digits when 4 keys pressed', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<PinPad onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('4'));
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('calls onCancel when Cancel pressed', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<PinPad onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error message when prop set', () => {
    const { getByText } = render(<PinPad onSubmit={() => {}} onCancel={() => {}} error="Wrong PIN" />);
    expect(getByText('Wrong PIN')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd mobile && npm test -- PinPad
```

- [ ] **Step 3: Implement**

```typescript
// mobile/src/components/PinPad.tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ onSubmit, onCancel, error }: Props) {
  const [pin, setPin] = useState('');

  function press(k: string) {
    if (k === '') return;
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>
      <View style={styles.dots}>
        {[0,1,2,3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <Pressable key={i} style={styles.key} onPress={() => press(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: 'center', gap: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#9ca3af' },
  dotFilled: { backgroundColor: '#111827', borderColor: '#111827' },
  error: { color: '#ef4444', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
  key: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontWeight: '500' },
  cancel: { paddingVertical: 8 },
  cancelText: { color: '#6b7280', fontSize: 16 },
});
```

- [ ] **Step 4: Run — expect 3/3 PASS**

```bash
cd mobile && npm test -- PinPad
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/PinPad.tsx mobile/tests/PinPad.test.tsx
git commit -m "feat(mobile): PinPad component with backspace + error states"
```

---

## Task 17: Avatar lock screen — replace M1 family list

**Files:**
- Modify: `mobile/app/(app)/index.tsx` (full rewrite)

- [ ] **Step 1: Replace the file**

```typescript
// mobile/app/(app)/index.tsx — full rewrite
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../src/constants/avatars';
import { PinPad } from '../../src/components/PinPad';

type Profile = {
  id: string;
  type: 'parent' | 'kid';
  display_name: string;
  avatar_id: number;
  pin_hash: string | null;
};

export default function AvatarLockScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,type,display_name,avatar_id,pin_hash')
        .order('type', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) setError(error.message);
      else setProfiles((data as Profile[]) ?? []);
    })();
  }, []);

  function selectProfile(p: Profile) {
    if (p.type === 'parent') {
      router.replace('/(app)/parent');
      return;
    }
    if (p.pin_hash && p.pin_hash.length > 0) {
      setPinError(null);
      setPinTarget(p);
      return;
    }
    router.replace(`/(app)/kid/${p.id}` as never);
  }

  function onPinSubmit(entered: string) {
    if (!pinTarget) return;
    if (entered === pinTarget.pin_hash) {
      setPinTarget(null);
      router.replace(`/(app)/kid/${pinTarget.id}` as never);
    } else {
      setPinError('Wrong PIN');
    }
  }

  if (error) return <View style={styles.center}><Text style={styles.err}>{error}</Text></View>;
  if (!profiles) return <View style={styles.center}><ActivityIndicator /></View>;

  const parents = profiles.filter((p) => p.type === 'parent');
  const kids = profiles.filter((p) => p.type === 'kid');

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Who's playing?</Text>
      <Text style={styles.subtitle}>Tap your tile</Text>

      <Text style={styles.section}>Parents</Text>
      <View style={styles.row}>
        {parents.map((p) => (
          <Tile key={p.id} profile={p} small onPress={() => selectProfile(p)} />
        ))}
      </View>

      <View style={styles.divider} />

      <Text style={styles.section}>Kids</Text>
      <View style={styles.row}>
        {kids.map((p) => (
          <Tile key={p.id} profile={p} onPress={() => selectProfile(p)} />
        ))}
      </View>

      <Modal visible={!!pinTarget} transparent animationType="fade" onRequestClose={() => setPinTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <PinPad
              onSubmit={onPinSubmit}
              onCancel={() => setPinTarget(null)}
              error={pinError ?? undefined}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Tile({ profile, small, onPress }: { profile: Profile; small?: boolean; onPress: () => void }) {
  const a = AVATARS[profile.avatar_id as AvatarId];
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={[styles.av, small && styles.avSm, { backgroundColor: a.bg }]}>
        <Text style={small ? styles.emojiSm : styles.emoji}>{a.emoji}</Text>
      </View>
      <Text style={styles.name}>{profile.display_name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: '#ef4444', textAlign: 'center' },
  greeting: { fontSize: 24, fontWeight: '700', textAlign: 'center', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  section: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tile: { alignItems: 'center', gap: 6 },
  av: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avSm: { width: 56, height: 56, borderRadius: 28 },
  emoji: { fontSize: 44 },
  emojiSm: { fontSize: 28 },
  name: { fontSize: 14, fontWeight: '500', color: '#111827' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 20 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, minWidth: 280 },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/index.tsx
git commit -m "feat(mobile): replace M1 family-list home with avatar lock screen"
```

---

## Task 18: Kid mode layout + kid home

**Files:**
- Create: `mobile/app/(app)/kid/_layout.tsx`
- Create: `mobile/app/(app)/kid/[profileId]/index.tsx`

- [ ] **Step 1: Layout**

```typescript
// mobile/app/(app)/kid/_layout.tsx
import { Stack } from 'expo-router';
export default function KidLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Kid home**

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
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function KidHome() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['kid-today', profileId],
    queryFn: async (): Promise<Instance[]> => {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, chore:chores(id,title,star_value,verification_mode)')
        .or(`assignee_profile_id.eq.${profileId},assignee_profile_id.is.null`)
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .in('status', ['pending', 'submitted'])
        .order('due_at');
      if (error) throw error;
      return (data ?? []) as unknown as Instance[];
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

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}

      {data && data.length === 0 && (
        <Text style={styles.empty}>All done — great job! 🌟</Text>
      )}

      <ScrollView contentContainerStyle={{ gap: 12 }}>
        {(data ?? []).map((inst) => {
          const submitted = inst.status === 'submitted';
          return (
            <View key={inst.id} style={[styles.card, submitted && styles.cardWaiting]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
                <Text style={styles.stars}>⭐ {inst.chore?.star_value}</Text>
                {submitted && <Text style={styles.waiting}>Waiting for parent ✋</Text>}
              </View>
              {!submitted && (
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  switch: { color: '#3b82f6', fontWeight: '500' },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', fontSize: 18, marginTop: 64, color: '#6b7280' },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardWaiting: { opacity: 0.55 },
  choreTitle: { fontSize: 18, fontWeight: '600' },
  stars: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  waiting: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  doneBtn: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 3: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/kid/
git commit -m "feat(mobile): kid mode layout + kid home with auto/approval Done flows"
```

---

## Task 19: Photo capture screen

**Files:**
- Create: `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../../../../../src/lib/supabase';

const MAX_RETRIES = 3;

export default function PhotoCapture() {
  const router = useRouter();
  const { profileId, instanceId } = useLocalSearchParams<{ profileId: string; instanceId: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission needed', 'Please enable camera access in settings.');
        router.back();
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
      if (result.canceled) router.back();
      else {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
        );
        setUri(compressed.uri);
      }
    })();
  }, []);

  async function send() {
    if (!uri) return;
    setBusy(true); setError(null);

    // 1. Look up family_id for the storage path.
    const { data: inst, error: instErr } = await supabase
      .from('chore_instances')
      .select('family_id')
      .eq('id', instanceId)
      .single();
    if (instErr || !inst) { setError(instErr?.message ?? 'instance not found'); setBusy(false); return; }
    const path = `family/${inst.family_id}/chore-proofs/${instanceId}.jpg`;

    // 2. Upload (with retries).
    const blob = await (await fetch(uri)).blob();
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { error: upErr } = await supabase.storage
        .from('chore-proofs')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(3, attempt)));
    }
    if (lastErr) { setError(`Upload failed: ${lastErr}`); setBusy(false); return; }

    // 3. RPC call.
    const { data: { publicUrl } } = supabase.storage.from('chore-proofs').getPublicUrl(path);
    const { error: rpcErr } = await supabase.rpc('complete_chore', {
      instance_id: instanceId,
      kid_profile_id: profileId,
      photo_url: publicUrl,
    });
    if (rpcErr) { setError(rpcErr.message); setBusy(false); return; }

    setBusy(false);
    router.replace(`/(app)/kid/${profileId}` as never);
  }

  if (!uri) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
      {error && <Text style={styles.err}>{error}</Text>}
      <View style={styles.row}>
        <Pressable onPress={async () => {
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
          if (!result.canceled) {
            const compressed = await ImageManipulator.manipulateAsync(
              result.assets[0].uri,
              [{ resize: { width: 1280 } }],
              { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
            );
            setUri(compressed.uri);
            setError(null);
          }
        }} style={[styles.btn, styles.btnSecondary]}>
          <Text style={styles.btnTextSecondary}>Retake</Text>
        </Pressable>
        <Pressable onPress={send} disabled={busy} style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.5 }]}>
          <Text style={styles.btnText}>{busy ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  preview: { flex: 1, marginBottom: 16, borderRadius: 12, backgroundColor: '#1f2937' },
  err: { color: '#fca5a5', textAlign: 'center', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#10b981' },
  btnSecondary: { backgroundColor: '#374151' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnTextSecondary: { color: '#fff', fontWeight: '500', fontSize: 16 },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/kid/\[profileId\]/chore/
git commit -m "feat(mobile): photo capture screen with native camera + retry"
```

---

## Task 20: Parent tabs layout

**Files:**
- Create: `mobile/app/(app)/parent/_layout.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/_layout.tsx
import { Tabs } from 'expo-router';

export default function ParentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"    options={{ title: 'Chores' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/app/\(app\)/parent/_layout.tsx
git commit -m "feat(mobile): parent mode tabs layout"
```

---

## Task 21: Picker components (Recurrence, Assignee, VerificationMode)

**Files:**
- Create: `mobile/src/components/RecurrencePicker.tsx`
- Create: `mobile/src/components/AssigneePicker.tsx`
- Create: `mobile/src/components/VerificationModePicker.tsx`

- [ ] **Step 1: VerificationModePicker**

```typescript
// mobile/src/components/VerificationModePicker.tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';

export type VerificationMode = 'auto' | 'photo' | 'approval';
const MODES: { value: VerificationMode; label: string; hint: string }[] = [
  { value: 'auto',     label: 'Auto',     hint: 'Tap done = done' },
  { value: 'photo',    label: 'Photo',    hint: 'Kid sends a photo' },
  { value: 'approval', label: 'Approval', hint: 'Parent confirms' },
];

export function VerificationModePicker({ value, onChange }: { value: VerificationMode; onChange: (v: VerificationMode) => void }) {
  return (
    <View>
      <Text style={styles.label}>Verification</Text>
      <View style={styles.row}>
        {MODES.map((m) => {
          const sel = m.value === value;
          return (
            <Pressable key={m.value} onPress={() => onChange(m.value)} style={[styles.btn, sel && styles.btnSel]}>
              <Text style={[styles.btnLabel, sel && styles.btnLabelSel]}>{m.label}</Text>
              <Text style={[styles.btnHint, sel && styles.btnHintSel]}>{m.hint}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  btnSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  btnLabel: { fontWeight: '600', color: '#111827' },
  btnLabelSel: { color: '#fff' },
  btnHint: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  btnHintSel: { color: '#dbeafe' },
});
```

- [ ] **Step 2: AssigneePicker**

```typescript
// mobile/src/components/AssigneePicker.tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AVATARS, AvatarId } from '../constants/avatars';

export type Assignee = { id: string; display_name: string; avatar_id: number };

export function AssigneePicker({
  kids, value, onChange,
}: { kids: Assignee[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <View>
      <Text style={styles.label}>Assignee</Text>
      <View style={styles.row}>
        <Pressable onPress={() => onChange(null)} style={[styles.chip, value === null && styles.chipSel]}>
          <Text style={[styles.chipText, value === null && styles.chipTextSel]}>Anyone</Text>
        </Pressable>
        {kids.map((k) => {
          const a = AVATARS[k.avatar_id as AvatarId];
          const sel = value === k.id;
          return (
            <Pressable key={k.id} onPress={() => onChange(k.id)} style={[styles.chip, sel && styles.chipSel]}>
              <Text style={styles.emoji}>{a.emoji}</Text>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{k.display_name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#111827', fontWeight: '500' },
  chipTextSel: { color: '#fff' },
  emoji: { fontSize: 16 },
});
```

- [ ] **Step 3: RecurrencePicker**

```typescript
// mobile/src/components/RecurrencePicker.tsx
import { View, Text, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import type { Recurrence } from '../lib/recurrence';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function RecurrencePicker({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const isRecurring = value.type !== 'once';

  return (
    <View>
      <Text style={styles.label}>Recurrence</Text>

      <View style={styles.row}>
        <Text style={{ flex: 1 }}>Repeats</Text>
        <Switch value={isRecurring} onValueChange={(on) =>
          onChange(on ? { type: 'daily' } : { type: 'once', due: new Date().toISOString().slice(0, 10) })
        } />
      </View>

      {!isRecurring && value.type === 'once' && (
        <View>
          <Text style={styles.sub}>Due date (YYYY-MM-DD)</Text>
          <TextInput
            value={value.due}
            onChangeText={(t) => onChange({ type: 'once', due: t })}
            style={styles.input}
            placeholder="2026-05-09"
          />
        </View>
      )}

      {isRecurring && (
        <View>
          <View style={styles.segRow}>
            {(['daily', 'weekly'] as const).map((t) => {
              const sel = value.type === t;
              return (
                <Pressable
                  key={t}
                  onPress={() =>
                    onChange(t === 'daily' ? { type: 'daily' } : { type: 'weekly', days: [new Date().getDay()] })
                  }
                  style={[styles.seg, sel && styles.segSel]}
                >
                  <Text style={[styles.segText, sel && styles.segTextSel]}>
                    {t === 'daily' ? 'Daily' : 'Weekly'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {value.type === 'weekly' && (
            <View style={styles.daysRow}>
              {DAY_LABELS.map((lbl, i) => {
                const sel = value.days.includes(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() =>
                      onChange({
                        type: 'weekly',
                        days: sel ? value.days.filter((d) => d !== i) : [...value.days, i].sort(),
                      })
                    }
                    style={[styles.dayChip, sel && styles.dayChipSel]}
                  >
                    <Text style={[styles.dayText, sel && styles.dayTextSel]}>{lbl}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, marginTop: 4 },
  segRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  seg: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  segSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  segText: { fontWeight: '600' },
  segTextSel: { color: '#fff' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  dayChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  dayChipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  dayText: { fontWeight: '600' },
  dayTextSel: { color: '#fff' },
});
```

- [ ] **Step 4: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/RecurrencePicker.tsx mobile/src/components/AssigneePicker.tsx mobile/src/components/VerificationModePicker.tsx
git commit -m "feat(mobile): chore-form pickers (recurrence, assignee, verification)"
```

---

## Task 22: Chores list tab (parent home)

**Files:**
- Create: `mobile/app/(app)/parent/index.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/index.tsx
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { formatRecurrence, Recurrence } from '../../../src/lib/recurrence';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';

type Chore = {
  id: string;
  title: string;
  star_value: number;
  recurrence: Recurrence;
  assignee: { id: string; display_name: string; avatar_id: number } | null;
};

export default function ChoresList() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['parent-chores'],
    queryFn: async (): Promise<Chore[]> => {
      const { data, error } = await supabase
        .from('chores')
        .select('id, title, star_value, recurrence, assignee:profiles!chores_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('active', true)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Chore[];
    },
  });

  const archive = useMutation({
    mutationFn: async (choreId: string) => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: choreId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-chores'] }),
  });

  function confirmArchive(c: Chore) {
    Alert.alert('Archive chore?', c.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate(c.id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chores</Text>
        <Pressable onPress={() => router.push('/(app)/parent/chores/new' as never)} style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {data && data.length === 0 && (
        <Text style={styles.empty}>No chores yet — tap + to add one.</Text>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/parent/chores/${item.id}` as never)}
            onLongPress={() => confirmArchive(item)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.choreTitle}>{item.title}</Text>
              <Text style={styles.meta}>
                {formatRecurrence(item.recurrence)} · ⭐ {item.star_value}
              </Text>
            </View>
            <Text style={styles.assignee}>
              {item.assignee
                ? `${AVATARS[item.assignee.avatar_id as AvatarId].emoji} ${item.assignee.display_name}`
                : 'Anyone'}
            </Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  fab: { backgroundColor: '#3b82f6', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 64 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  choreTitle: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  assignee: { fontSize: 13 },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/parent/index.tsx
git commit -m "feat(mobile): parent chores tab with list + FAB + archive on long-press"
```

---

## Task 23: Create-chore form

**Files:**
- Create: `mobile/app/(app)/parent/chores/new.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/chores/new.tsx
import { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import type { Recurrence } from '../../../../src/lib/recurrence';

export default function NewChore() {
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [familyId, setFamilyId] = useState<string | null>(null);

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_id, family_id')
        .eq('type', 'kid')
        .order('created_at');
      if (error) throw error;
      if (data && data.length > 0) setFamilyId((data[0] as { family_id: string }).family_id);
      return (data ?? []) as Assignee[];
    },
  });

  // Fallback: derive family_id from a parent profile if there are no kids yet.
  useEffect(() => {
    if (familyId) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('family_id').eq('type', 'parent').limit(1).maybeSingle();
      if (data) setFamilyId((data as { family_id: string }).family_id);
    })();
  }, [familyId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error('no family loaded');
      const sv = parseInt(stars, 10);
      if (!Number.isFinite(sv) || sv < 1 || sv > 999) throw new Error('star value must be 1–999');
      const { error } = await supabase.rpc('create_chore', {
        family_id: familyId,
        title: title.trim(),
        description: description.trim() || null,
        star_value: sv,
        assignee_profile_id: assigneeId,
        verification_mode: mode,
        recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
    onError: (e) => Alert.alert('Could not create chore', (e as Error).message),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New chore</Text>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Make bed" />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} />
      <TextField label="Stars" value={stars} onChangeText={setStars} keyboardType="number-pad" />
      <VerificationModePicker value={mode} onChange={setMode} />
      <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <Button label="Save" loading={create.isPending} onPress={() => create.mutate()} />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/parent/chores/new.tsx
git commit -m "feat(mobile): create-chore form with all pickers + RPC call"
```

---

## Task 24: Edit-chore form

**Files:**
- Create: `mobile/app/(app)/parent/chores/[id].tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/chores/[id].tsx
import { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import type { Recurrence } from '../../../../src/lib/recurrence';

export default function EditChore() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [originalAssignee, setOriginalAssignee] = useState<string | null>(null);

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_id').eq('type', 'kid').order('created_at');
      if (error) throw error;
      return (data ?? []) as Assignee[];
    },
  });

  const { data: chore, isLoading } = useQuery({
    queryKey: ['chore', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chores')
        .select('id,title,description,star_value,assignee_profile_id,verification_mode,recurrence')
        .eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!chore) return;
    setTitle(chore.title);
    setDescription(chore.description ?? '');
    setStars(String(chore.star_value));
    setAssigneeId(chore.assignee_profile_id);
    setOriginalAssignee(chore.assignee_profile_id);
    setMode(chore.verification_mode as VerificationMode);
    setRecurrence(chore.recurrence as unknown as Recurrence);
  }, [chore]);

  const update = useMutation({
    mutationFn: async () => {
      const sv = parseInt(stars, 10);
      if (!Number.isFinite(sv) || sv < 1 || sv > 999) throw new Error('star value must be 1–999');
      const { error } = await supabase.rpc('update_chore', {
        chore_id: id,
        title: title.trim(),
        description: description.trim() || null,
        star_value: sv,
        // If assignee was non-null and is now null, set clear_assignee=true.
        clear_assignee: originalAssignee !== null && assigneeId === null,
        assignee_profile_id: assigneeId,
        verification_mode: mode,
        recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      qc.invalidateQueries({ queryKey: ['chore', id] });
      router.back();
    },
    onError: (e) => Alert.alert('Could not update chore', (e as Error).message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
  });

  if (isLoading || !chore) return <ActivityIndicator style={{ marginTop: 64 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit chore</Text>
      <TextField label="Title" value={title} onChangeText={setTitle} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} />
      <TextField label="Stars" value={stars} onChangeText={setStars} keyboardType="number-pad" />
      <VerificationModePicker value={mode} onChange={setMode} />
      <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <Button label="Save changes" loading={update.isPending} onPress={() => update.mutate()} />
      <Button label="Archive" variant="secondary" onPress={() => archive.mutate()} style={{ marginTop: 8 }} />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/parent/chores/\[id\].tsx
git commit -m "feat(mobile): edit-chore form with archive + clear_assignee handling"
```

---

## Task 25: Activity feed

**Files:**
- Create: `mobile/app/(app)/parent/activity.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/activity.tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Modal, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';

type Row = {
  id: string;
  status: 'submitted' | 'approved';
  completed_at: string;
  photo_url: string | null;
  family_id: string;
  kid: { display_name: string; avatar_id: number } | null;
  chore: { title: string; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function Activity() {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity'],
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id,status,completed_at,photo_url,family_id,kid:profiles!chore_instances_completed_by_fkey(display_name,avatar_id),chore:chores(title,verification_mode)')
        .in('status', ['submitted', 'approved'])
        .gte('completed_at', since)
        .order('completed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  async function openPhoto(r: Row) {
    if (!r.photo_url) return;
    const path = `family/${r.family_id}/chore-proofs/${r.id}.jpg`;
    setPhotoPath(path);
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
          const icon = item.status === 'approved' ? '✓' : item.chore?.verification_mode === 'photo' ? '📸' : '✋';
          return (
            <Pressable
              style={styles.row}
              onPress={() => item.chore?.verification_mode === 'photo' && openPhoto(item)}
            >
              <Text style={styles.line}>
                {icon} {avatar} {item.kid?.display_name} · {item.chore?.title} · {timeAgo(item.completed_at)}
              </Text>
              {item.chore?.verification_mode === 'photo' && item.status === 'submitted' && (
                <Text style={styles.hint}>tap to view photo</Text>
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
      <Text style={styles.footer}>Approvals coming next milestone.</Text>

      <Modal visible={!!signedUrl} transparent animationType="fade" onRequestClose={() => { setSignedUrl(null); setPhotoPath(null); }}>
        <Pressable style={styles.modalBg} onPress={() => { setSignedUrl(null); setPhotoPath(null); }}>
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
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
  footer: { textAlign: 'center', color: '#9ca3af', marginTop: 12, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalImg: { width: '100%', height: '80%' },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/parent/activity.tsx
git commit -m "feat(mobile): activity feed with signed-URL photo viewer"
```

---

## Task 26: Settings tab

**Files:**
- Create: `mobile/app/(app)/parent/settings.tsx`

- [ ] **Step 1: Implement**

```typescript
// mobile/app/(app)/parent/settings.tsx
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { Button } from '../../../src/components/Button';
import { signOut } from '../../../src/lib/auth';

export default function Settings() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['family-summary'],
    queryFn: async () => {
      const { data: fam } = await supabase.from('families').select('name').limit(1).maybeSingle();
      const { data: profs } = await supabase.from('profiles').select('id, type');
      return {
        familyName: (fam as { name: string } | null)?.name ?? 'Family',
        memberCount: profs?.length ?? 0,
      };
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {isLoading ? <ActivityIndicator /> : (
        <View style={styles.section}>
          <Text style={styles.label}>Family</Text>
          <Text style={styles.value}>{data?.familyName} · {data?.memberCount} member{data?.memberCount === 1 ? '' : 's'}</Text>
        </View>
      )}

      <View style={styles.stub}><Text style={styles.stubText}>Notifications — coming soon</Text></View>
      <View style={styles.stub}><Text style={styles.stubText}>Co-parents — coming soon</Text></View>
      <View style={styles.stub}><Text style={styles.stubText}>Subscription — coming soon</Text></View>

      <Button label="Switch profile" variant="secondary" onPress={() => router.replace('/(app)')} />
      <Button label="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  section: { paddingVertical: 8 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' },
  value: { fontSize: 16, marginTop: 4 },
  stub: { padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 },
  stubText: { color: '#6b7280' },
});
```

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/app/\(app\)/parent/settings.tsx
git commit -m "feat(mobile): parent settings tab with sign-out + switch profile"
```

---

## Task 27: Wire seed_starter_chores into create-family

**Files:**
- Modify: `mobile/app/(onboarding)/create-family.tsx`

- [ ] **Step 1: Modify the file (full rewrite for clarity)**

```typescript
// mobile/app/(onboarding)/create-family.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { refetchFamily } from '../../src/hooks/useFamily';

export default function CreateFamilyScreen() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (familyName.trim().length === 0) return setError('Family name required');
    if (parentName.trim().length === 0) return setError('Your name is required');
    setLoading(true);
    const { error } = await supabase.rpc('create_family', {
      family_name: familyName.trim(),
      parent_name: parentName.trim(),
      parent_avatar: avatar,
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    refetchFamily();

    // Seed starter chores. Find the new family_id from the parent profile we just created.
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('type', 'parent')
      .maybeSingle();
    if (profile) {
      const { error: seedErr } = await supabase.rpc('seed_starter_chores', {
        family_id: (profile as { family_id: string }).family_id,
      });
      if (seedErr) console.warn('seed_starter_chores failed:', seedErr.message);
    }

    setLoading(false);
    router.replace('/(onboarding)/add-kid');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create your family</Text>
      <TextField label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="The Smiths" />
      <TextField label="Your name (parent)" value={parentName} onChangeText={setParentName} placeholder="Alex" />
      <Text style={styles.label}>Pick your avatar</Text>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Create family" onPress={onSubmit} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  error: { color: '#ef4444', marginBottom: 12, textAlign: 'center' },
});
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(onboarding\)/create-family.tsx
git commit -m "feat(mobile): seed starter chores after family creation"
```

---

## Task 28: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: mobile/package-lock.json

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase
        run: supabase start

      - name: Run migrations + pgTAP
        run: supabase test db

      - name: Install mobile deps
        working-directory: mobile
        run: npm ci

      - name: Type-check
        working-directory: mobile
        run: npx tsc --noEmit

      - name: Run Jest
        working-directory: mobile
        run: npm test -- --watchAll=false
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: GitHub Actions running tsc, jest, and pgTAP on every push"
```

- [ ] **Step 3: Push the branch and confirm CI is green on the first PR**

```bash
git push -u origin m2-chore-loop
```

Open a PR (or check the Actions tab). Expected: CI job completes green within ~3–4 min on first run (slower without caches).

---

## Task 29: Manual M2 acceptance

**Files:** none (manual run)

- [ ] **Step 1: Reset DB and start mobile dev server**

```bash
npx supabase db reset
cd mobile && npx expo start --android
```

- [ ] **Step 2: Run the full acceptance script**

In the Android emulator:
1. Sign up as a fresh test user → enter onboarding → create family "TestFam".
2. Verify Chores tab shows 5 seed chores (Make bed, Brush teeth, Feed pet, Tidy room, Homework). If empty, see Step 5.
3. Add 2 kids: "Sara" (avatar 2) and "Leo" (avatar 3). One with PIN "1234", one without.
4. Sign out from Settings → sign back in → expect to land on the avatar lock screen with the sectioned layout.
5. Tap Sara → enter PIN "1234" → kid home shows seed chores (assigned to "Anyone").
6. Tap Done on "Brush teeth" (auto) → it disappears. Tap Done on "Make bed" (approval) → it moves to "Waiting for parent ✋".
7. Edit a seed chore in parent mode → switch to Photo verification + change to weekly Mon/Wed/Fri. Save.
8. Create a new one-off chore due tomorrow assigned to Leo.
9. Manually trigger generator: in another terminal, `npx supabase functions serve generate_chore_instances --no-verify-jwt` and `curl -X POST http://127.0.0.1:54321/functions/v1/generate_chore_instances`.
10. Sign in as Leo (no PIN) → the new one-off chore appears (or appears tomorrow depending on timing).
11. Switch → parent → Activity tab shows submissions from step 6 with correct icons (✓ for auto, ✋ for approval).

- [ ] **Step 3: If acceptance passes, tag the milestone**

```bash
git tag -a m2-chore-loop -m "M2: Core Chore Loop milestone complete"
git tag --list m2-chore-loop -n5
```

- [ ] **Step 4: Update the project memory**

Edit `~/.claude/projects/.../memory/MEMORY.md` and `m2_progress.md` (analogous to `m1_progress.md`) recording M2 status, deferrals carried into M3, and next steps. Detail in `.remember/remember.md` if used.

---

## Spec coverage check (self-review)

| Spec section | Tasks |
|---|---|
| 1.1 chore CRUD | T4, T5, T6, T22, T23, T24 |
| 1.1 recurrence (one-off + daily + weekly) | T3, T15, T21 |
| 1.1 three verification modes | T7, T21, T18, T19 |
| 1.1 kid mode entry / avatar lock | T16, T17 |
| 1.1 kid home + Done | T18 |
| 1.1 photo capture | T19 |
| 1.1 parent activity feed | T25 |
| 1.1 seed chores | T8, T27 |
| 1.1 CI | T28 |
| 1.2 deferrals (no ledger / no approve UI) | enforced by absence — no `star_ledger` table or approve_chore migration |
| 2.1 chores + chore_instances tables | T1, T2 |
| 2.2 recurrence jsonb shape | T3 (validation), T15 (rendering), T21 (input UI) |
| 2.3 storage bucket | T9 |
| 3.1 next_occurrence | T3 |
| 3.2 RPCs | T4–T8 |
| 3.3 generate_chore_instances Edge Function | T10 |
| 3.4 RLS | T1, T2 |
| 3.5 storage policies | T9 |
| 3.6 migration order | enforced by 0001..0010 numbering |
| 4 routing tree | T17, T18, T19, T20, T22, T23, T24, T25, T26 |
| 5 kid mode UX | T17, T18, T19 |
| 6 parent mode UX | T20, T22, T23, T24, T25, T26 |
| 7.1 seed at create-family | T27 |
| 7.2 backfill | T8 (DO block in migration) |
| 8 CI | T28 |
| 9.4 manual acceptance | T29 |
| 1.3 exit criteria | T29 + tag |

Every spec section is reached by at least one task. No placeholders. Function/component names are consistent across tasks (`complete_chore`, `create_chore`, `archive_chore`, `formatRecurrence`, `PinPad`, `RecurrencePicker`, `AssigneePicker`, `VerificationModePicker`).

---

**End of M2 plan.**
