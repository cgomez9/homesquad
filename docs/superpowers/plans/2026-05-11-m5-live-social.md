# M5 — Live + Social Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship realtime + push notifications + co-parent invite per `docs/superpowers/specs/2026-05-11-m5-live-social-design.md`.

**Architecture:** New `family_invites` table + 3 RPCs (`create_family_invite`, `accept_invite`, `set_push_token`); RLS hardening on `profiles` (drop broad UPDATE policy + add partial unique index for parent uniqueness); push pipeline via Postgres triggers → `pg_net.http_post` → new `send_push` Deno Edge Function → Expo Push API; mobile subscribes to Supabase `postgres_changes` per family for live UI updates.

**Tech Stack:** Supabase (Postgres + Auth + RLS + Realtime + Edge Functions + pg_net), pgTAP, Deno, TypeScript, Expo SDK 54 / React Native 0.81 / Expo Router 6, TanStack Query v5, `expo-notifications`, `expo-clipboard`, Expo Push API.

---

## File structure

**New SQL migrations** (`supabase/migrations/`):
- `20260511000001_family_invites_table.sql`
- `20260511000002_profiles_parent_unique_idx.sql`
- `20260511000003_create_family_invite_rpc.sql`
- `20260511000004_accept_invite_rpc.sql`
- `20260511000005_set_push_token_rpc.sql`
- `20260511000006_drop_profiles_update_policy.sql`
- `20260511000007_chore_push_trigger.sql`
- `20260511000008_redemption_push_trigger.sql`

**New pgTAP tests** (`supabase/tests/`):
- `27_family_invites_rls.sql`
- `28_profiles_parent_unique.sql`
- `29_create_family_invite_rpc.sql`
- `30_accept_invite_rpc.sql`
- `31_set_push_token_rpc.sql`
- `32_profiles_update_revoked.sql`

**New Edge Function** (`supabase/functions/`):
- `send_push/index.ts`

**New mobile files**:
- `mobile/src/lib/pushNotifications.ts`
- `mobile/tests/pushNotifications.test.ts`
- `mobile/src/lib/realtime.ts`
- `mobile/app/(onboarding)/join-family.tsx`

**Modified mobile files**:
- `mobile/app/(onboarding)/create-family.tsx` — link to join-family
- `mobile/app/(app)/parent/settings.tsx` — invite a co-parent section + modal
- `mobile/app/_layout.tsx` — global notification handler + realtime subscription
- `mobile/app/(app)/_layout.tsx` — push token registration
- `mobile/src/lib/auth.ts` — clear push_token on signOut
- `mobile/src/types/database.ts` — regenerated
- `mobile/package.json` — new deps

---

## Task 0: Branch + verify baseline

**Files:** none (git only)

- [ ] **Step 1: Create the M5 branch off main**

```bash
git switch main
git switch -c m5-live-social
```

- [ ] **Step 2: Verify Supabase + tests still green**

```bash
npx supabase status
npx supabase test db
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false && cd ..
```

Expected: pgTAP `Files=26, Tests=108, Result: PASS`; tsc clean; jest 20/20 pass.

---

## Task 1: family_invites table

**Files:**
- Create: `supabase/migrations/20260511000001_family_invites_table.sql`
- Create: `supabase/tests/27_family_invites_rls.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000001_family_invites_table.sql
create table public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9]{6}$'),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  used_by     uuid references public.profiles(id),
  used_at     timestamptz
);

create index family_invites_family_idx on public.family_invites(family_id);

alter table public.family_invites enable row level security;

create policy family_invites_select_own_family on public.family_invites
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = family_invites.family_id)
  );
-- No INSERT/UPDATE/DELETE policies. All writes via SD RPCs.
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/27_family_invites_rls.sql
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

insert into public.family_invites(family_id, code, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '111111', 'a1111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '222222', 'b2222222-2222-2222-2222-222222222222');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.family_invites), 1,
  'Alice sees only her family invites'
);

select is_empty(
  $$ select * from public.family_invites where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'Alice cannot see Family B invites'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000001_family_invites_table.sql supabase/tests/27_family_invites_rls.sql
git commit -m "feat(db): family_invites table + select-only RLS"
```

Expected: 110 tests across 27 files.

---

## Task 2: Partial unique index on profiles

**Files:**
- Create: `supabase/migrations/20260511000002_profiles_parent_unique_idx.sql`
- Create: `supabase/tests/28_profiles_parent_unique.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000002_profiles_parent_unique_idx.sql
create unique index profiles_one_parent_per_user_idx
  on public.profiles(user_id)
  where type = 'parent';
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/28_profiles_parent_unique.sql
begin;
select plan(2);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');

insert into public.profiles(family_id, type, display_name, avatar_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

select pass('first parent profile inserts cleanly');

prepare second_parent as
  insert into public.profiles(family_id, type, display_name, avatar_id, user_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Alice2', 1, '11111111-1111-1111-1111-111111111111');
select throws_ok('second_parent', '23505', null, 'second parent profile for same user_id raises unique-violation');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000002_profiles_parent_unique_idx.sql supabase/tests/28_profiles_parent_unique.sql
git commit -m "feat(db): partial unique index on profiles(user_id) where type='parent'"
```

Expected: 112 tests across 28 files.

---

## Task 3: create_family_invite RPC

**Files:**
- Create: `supabase/migrations/20260511000003_create_family_invite_rpc.sql`
- Create: `supabase/tests/29_create_family_invite_rpc.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000003_create_family_invite_rpc.sql
create or replace function public.create_family_invite()
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  candidate      text;
  attempts       int := 0;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  loop
    attempts := attempts + 1;
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.family_invites(family_id, code, created_by)
      values (caller_family, candidate, caller_profile);
      return candidate;
    exception when unique_violation then
      if attempts >= 5 then
        raise exception 'could not generate unique code after 5 attempts';
      end if;
    end;
  end loop;
end;
$$;
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/29_create_family_invite_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select matches(public.create_family_invite(), '^[0-9]{6}$', 'returns 6-digit code');

set local role postgres;
select is(
  (select count(*)::int from public.family_invites where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'one invite row inserted'
);
select isnt(
  (select expires_at from public.family_invites where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1),
  null, 'expires_at is populated'
);

-- Non-parent caller raises.
insert into auth.users(id, email) values ('33333333-3333-3333-3333-333333333333', 'c@test.com');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare non_parent as select public.create_family_invite();
select throws_ok('non_parent', null, null, 'non-parent caller raises');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000003_create_family_invite_rpc.sql supabase/tests/29_create_family_invite_rpc.sql
git commit -m "feat(db): create_family_invite RPC with retry on code collision"
```

Expected: 116 tests across 29 files.

---

## Task 4: accept_invite RPC

**Files:**
- Create: `supabase/migrations/20260511000004_accept_invite_rpc.sql`
- Create: `supabase/tests/30_accept_invite_rpc.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000004_accept_invite_rpc.sql
create or replace function public.accept_invite(
  code         text,
  display_name text,
  avatar_id    smallint
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  inv            public.family_invites%rowtype;
  new_profile_id uuid;
begin
  if caller_user_id is null then raise exception 'must be authenticated'; end if;

  if exists (select 1 from public.profiles where user_id = caller_user_id and type = 'parent') then
    raise exception 'already a parent in another family';
  end if;

  select * into inv from public.family_invites where family_invites.code = accept_invite.code for update;
  if inv.id is null then raise exception 'invite not found'; end if;
  if now() > inv.expires_at then raise exception 'invite expired'; end if;
  if inv.used_by is not null then raise exception 'invite already used'; end if;

  insert into public.profiles(family_id, type, display_name, avatar_id, user_id)
  values (inv.family_id, 'parent', accept_invite.display_name, accept_invite.avatar_id, caller_user_id)
  returning id into new_profile_id;

  update public.family_invites
    set used_by = new_profile_id, used_at = now()
    where id = inv.id;

  return new_profile_id;
end;
$$;
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/30_accept_invite_rpc.sql
begin;
select plan(7);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Family B');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Bob',   1, '22222222-2222-2222-2222-222222222222');

insert into public.family_invites(id, family_id, code, created_by, expires_at) values
  ('111aaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '100100', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day'),
  ('222aaaaa-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '200200', 'a1111111-1111-1111-1111-111111111111', now() - interval '1 hour'),
  ('333aaaaa-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '300300', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day');

-- Mark the third invite as already used.
update public.family_invites set used_by = 'b2222222-2222-2222-2222-222222222222', used_at = now()
  where id = '333aaaaa-3333-3333-3333-333333333333';

-- 1. Happy path: Carlos (user_id 33...) accepts a valid code.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select isnt(
  public.accept_invite('100100', 'Carl', 1::smallint),
  null,
  'accept_invite returns new profile id'
);

-- 2. Profile actually inserted into Family A.
set local role postgres;
select is(
  (select count(*)::int from public.profiles
    where user_id = '33333333-3333-3333-3333-333333333333' and family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'Carl is now a parent in Family A'
);

-- 3. Invite marked used.
select isnt(
  (select used_by from public.family_invites where id = '111aaaaa-1111-1111-1111-111111111111'),
  null, 'invite used_by populated'
);

-- 4. Already-a-parent guard: re-accepting another code fails.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare already_parent as select public.accept_invite('200200', 'Carl2', 1::smallint);
select throws_ok('already_parent', null, null, 'cannot accept twice');

-- 5. Bob (already a parent in Family B) cannot accept Family A's code.
set local role postgres;
delete from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
-- Create a fresh invite since 100100 is now used.
insert into public.family_invites(family_id, code, created_by, expires_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '400400', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
prepare bob_accept as select public.accept_invite('400400', 'Bob2', 1::smallint);
select throws_ok('bob_accept', null, null, 'parent in another family cannot accept');

-- 6. Expired invite raises (user with no existing profile).
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
prepare expired as select public.accept_invite('200200', 'Carl3', 1::smallint);
select throws_ok('expired', null, null, 'expired invite raises');

-- 7. Already-used invite raises.
prepare used as select public.accept_invite('300300', 'Carl4', 1::smallint);
select throws_ok('used', null, null, 'already-used invite raises');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000004_accept_invite_rpc.sql supabase/tests/30_accept_invite_rpc.sql
git commit -m "feat(db): accept_invite RPC with code lookup + guard rails"
```

Expected: 123 tests across 30 files.

---

## Task 5: set_push_token RPC

**Files:**
- Create: `supabase/migrations/20260511000005_set_push_token_rpc.sql`
- Create: `supabase/tests/31_set_push_token_rpc.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000005_set_push_token_rpc.sql
create or replace function public.set_push_token(token text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_profile uuid;
begin
  select id into caller_profile from public.profiles where user_id = auth.uid();
  if caller_profile is null then raise exception 'no profile for caller'; end if;
  update public.profiles set push_token = token where id = caller_profile;
end;
$$;
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/31_set_push_token_rpc.sql
begin;
select plan(4);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.set_push_token('ExponentPushToken[abc]') $$,
  'set_push_token succeeds for owner'
);
select is(
  (select push_token from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  'ExponentPushToken[abc]', 'token stored'
);

-- Empty string clears it.
select lives_ok(
  $$ select public.set_push_token('') $$,
  'set_push_token with empty string succeeds'
);

-- Caller without a profile raises.
set local "request.jwt.claims" to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
prepare no_profile as select public.set_push_token('xxx');
select throws_ok('no_profile', null, null, 'no-profile caller raises');

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000005_set_push_token_rpc.sql supabase/tests/31_set_push_token_rpc.sql
git commit -m "feat(db): set_push_token RPC (only path to write profiles.push_token)"
```

Expected: 127 tests across 31 files.

---

## Task 6: Drop broad UPDATE policy on profiles

**Files:**
- Create: `supabase/migrations/20260511000006_drop_profiles_update_policy.sql`
- Create: `supabase/tests/32_profiles_update_revoked.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000006_drop_profiles_update_policy.sql
drop policy if exists profiles_update_own_family on public.profiles;
```

- [ ] **Step 2: pgTAP test**

```sql
-- supabase/tests/32_profiles_update_revoked.sql
begin;
select plan(2);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice2', 2, '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Alice attempts to flip Alice2's type to 'kid'.
prepare hack as update public.profiles set type = 'kid' where id = 'a2222222-2222-2222-2222-222222222222';
select lives_ok('hack', 'UPDATE call does not error (RLS just affects 0 rows now)');

-- Verify nothing changed.
reset role;
select is(
  (select type::text from public.profiles where id = 'a2222222-2222-2222-2222-222222222222'),
  'parent', 'Alice2 is still a parent (no policy permits UPDATE)'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000006_drop_profiles_update_policy.sql supabase/tests/32_profiles_update_revoked.sql
git commit -m "feat(db): drop broad profiles_update_own_family policy (M1 parent-mutation fix)"
```

Expected: 129 tests across 32 files.

---

## Task 7: Push trigger for chore_instances

**Files:**
- Create: `supabase/migrations/20260511000007_chore_push_trigger.sql`

This task does not add a pgTAP test — trigger correctness is exercised manually via the Edge Function smoke test in Task 11 and the M5 acceptance flow.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000007_chore_push_trigger.sql
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

  perform net.http_post(
    url := current_setting('app.settings.functions_base_url', true) || '/send_push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'event', event_kind,
      'family_id', NEW.family_id,
      'instance_id', NEW.id,
      'kid_profile_id', NEW.completed_by
    )
  );
  return NEW;
end;
$$;

create trigger chore_instances_push_trigger
  after update on public.chore_instances
  for each row execute function notify_push_chore();
```

- [ ] **Step 2: Verify migration applies; existing pgTAP still passes**

```bash
npx supabase db reset && npx supabase test db
```

Expected: 129 tests still PASS (the trigger fires on UPDATEs from existing tests, but `app.settings.functions_base_url` is empty in local — `net.http_post` returns gracefully without breaking the calling transaction).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260511000007_chore_push_trigger.sql
git commit -m "feat(db): notify_push_chore trigger for chore_instances status transitions"
```

---

## Task 8: Push trigger for redemptions

**Files:**
- Create: `supabase/migrations/20260511000008_redemption_push_trigger.sql`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260511000008_redemption_push_trigger.sql
create or replace function public.notify_push_redemption() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if TG_OP = 'INSERT' and NEW.status = 'pending' then
    event_kind := 'redemption_requested';
  elsif TG_OP = 'UPDATE' and NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'redemption_approved';
  elsif TG_OP = 'UPDATE' and NEW.status = 'denied' and OLD.status <> 'denied' then
    event_kind := 'redemption_denied';
  elsif TG_OP = 'UPDATE' and NEW.status = 'fulfilled' and OLD.status <> 'fulfilled' then
    event_kind := 'redemption_fulfilled';
  else
    return NEW;
  end if;

  perform net.http_post(
    url := current_setting('app.settings.functions_base_url', true) || '/send_push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'event', event_kind,
      'family_id', NEW.family_id,
      'redemption_id', NEW.id,
      'reward_id', NEW.reward_id,
      'kid_profile_id', NEW.kid_profile_id
    )
  );
  return NEW;
end;
$$;

create trigger redemptions_push_trigger_insert
  after insert on public.redemptions
  for each row execute function notify_push_redemption();

create trigger redemptions_push_trigger_update
  after update on public.redemptions
  for each row execute function notify_push_redemption();
```

- [ ] **Step 2: Verify + commit**

```bash
npx supabase db reset && npx supabase test db
git add supabase/migrations/20260511000008_redemption_push_trigger.sql
git commit -m "feat(db): notify_push_redemption trigger (insert + status transitions)"
```

Expected: 129 tests still PASS.

---

## Task 9: send_push Edge Function

**Files:**
- Create: `supabase/functions/send_push/index.ts`

- [ ] **Step 1: Edge function**

```typescript
// supabase/functions/send_push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type PushEvent =
  | { event: 'chore_submitted' | 'chore_approved' | 'chore_rejected';
      family_id: string; instance_id: string; kid_profile_id: string | null }
  | { event: 'redemption_requested' | 'redemption_approved' | 'redemption_denied' | 'redemption_fulfilled';
      family_id: string; redemption_id: string; reward_id: string; kid_profile_id: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const payload = (await req.json()) as PushEvent;

  // 1. Resolve recipient parent push tokens.
  const { data: parents, error: pErr } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('family_id', payload.family_id)
    .eq('type', 'parent')
    .not('push_token', 'is', null);
  if (pErr) return new Response(`profile lookup failed: ${pErr.message}`, { status: 500 });
  const tokens = (parents ?? [])
    .map((p) => p.push_token as string)
    .filter((t) => t && t.length > 0);
  if (tokens.length === 0) return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), { status: 200 });

  // 2. Resolve auxiliary data + format message.
  let title = 'Shores';
  let body = '';
  if (payload.event.startsWith('chore_')) {
    const { data: inst } = await supabase
      .from('chore_instances')
      .select('stars_awarded,kid:profiles!chore_instances_completed_by_fkey(display_name),chore:chores(title)')
      .eq('id', (payload as { instance_id: string }).instance_id)
      .single();
    const kid = (inst as any)?.kid?.display_name ?? 'A kid';
    const choreTitle = (inst as any)?.chore?.title ?? 'a chore';
    const stars = (inst as any)?.stars_awarded ?? 0;
    if (payload.event === 'chore_submitted') body = `${kid} submitted '${choreTitle}' 📸`;
    else if (payload.event === 'chore_approved') body = `+${stars}⭐! Great job on '${choreTitle}' 🎉`;
    else if (payload.event === 'chore_rejected') body = `'${choreTitle}' needs another look`;
  } else {
    const { data: red } = await supabase
      .from('redemptions')
      .select('star_cost_snapshot,kid:profiles!redemptions_kid_profile_id_fkey(display_name),reward:rewards(title)')
      .eq('id', (payload as { redemption_id: string }).redemption_id)
      .single();
    const kid = (red as any)?.kid?.display_name ?? 'A kid';
    const rewardTitle = (red as any)?.reward?.title ?? 'a reward';
    const cost = (red as any)?.star_cost_snapshot ?? 0;
    if (payload.event === 'redemption_requested') body = `${kid} wants ${rewardTitle} (${cost}⭐)`;
    else if (payload.event === 'redemption_approved') body = `${rewardTitle} approved! 🍦`;
    else if (payload.event === 'redemption_denied') body = `Request for ${rewardTitle} was denied`;
    else if (payload.event === 'redemption_fulfilled') body = `🎁 ${kid} got their ${rewardTitle}`;
  }

  // 3. Build Expo Push messages and POST.
  const messages = tokens.map((to) => ({ to, sound: 'default', title, body }));
  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const expoBody = await expoRes.text();
  return new Response(JSON.stringify({ sent: messages.length, expoStatus: expoRes.status, expoBody }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Smoke test manually**

In one terminal:
```bash
npx supabase functions serve send_push --no-verify-jwt
```

In another:
```bash
SERVICE_ROLE_KEY=$(npx supabase status -o json | jq -r '.[]|select(.name=="service_role_key")|.value')
curl -X POST http://127.0.0.1:54321/functions/v1/send_push \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event":"chore_submitted","family_id":"00000000-0000-0000-0000-000000000000","instance_id":"00000000-0000-0000-0000-000000000000","kid_profile_id":null}'
```

Expected: `{"sent":0,"reason":"no tokens"}` (no parent tokens in fresh DB yet). The function should NOT error.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send_push/
git commit -m "feat(edge): send_push edge function builds + posts to Expo Push API"
```

---

## Task 10: Regenerate database types

**Files:**
- Modify: `mobile/src/types/database.ts`

- [ ] **Step 1: Regenerate, filtering CLI noise**

```bash
npx supabase gen types typescript --local 2>/dev/null \
  | grep -v '^Connecting to' \
  | grep -v '<claude-code-hint' \
  > mobile/src/types/database.ts
```

- [ ] **Step 2: Type-check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: clean. New types include `family_invites`, `create_family_invite`, `accept_invite`, `set_push_token`.

- [ ] **Step 3: Commit**

```bash
cd .. && git add mobile/src/types/database.ts
git commit -m "chore(types): regenerate database types after M5 schema migrations"
```

---

## Task 11: Install mobile push + clipboard deps

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Install**

```bash
cd mobile
npx expo install expo-notifications expo-clipboard expo-device
```

`expo install` resolves SDK-compatible versions.

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add expo-notifications, expo-clipboard, expo-device"
```

---

## Task 12: pushNotifications module + tests

**Files:**
- Create: `mobile/src/lib/pushNotifications.ts`
- Create: `mobile/tests/pushNotifications.test.ts`

TDD task — failing test first.

- [ ] **Step 1: Failing test**

```typescript
// mobile/tests/pushNotifications.test.ts
import { registerForPushNotifications, syncPushToken } from '../src/lib/pushNotifications';
import * as Notifications from 'expo-notifications';
import { supabase } from '../src/lib/supabase';

jest.mock('expo-notifications');
jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn().mockResolvedValue({ error: null }) },
}));

describe('pushNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const token = await registerForPushNotifications();
    expect(token).toBeNull();
  });

  it('returns the Expo push token when permission is granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    const token = await registerForPushNotifications();
    expect(token).toBe('ExponentPushToken[abc]');
  });

  it('syncPushToken calls set_push_token RPC with the returned token', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
    await syncPushToken();
    expect(supabase.rpc).toHaveBeenCalledWith('set_push_token', { token: 'ExponentPushToken[xyz]' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd mobile && npm test -- pushNotifications
```

- [ ] **Step 3: Implement**

```typescript
// mobile/src/lib/pushNotifications.ts
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export async function registerForPushNotifications(): Promise<string | null> {
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status === 'undetermined') {
    perm = await Notifications.requestPermissionsAsync();
  }
  if (perm.status !== 'granted') return null;
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export async function syncPushToken(): Promise<void> {
  const token = await registerForPushNotifications();
  if (token === null) return;
  const { error } = await supabase.rpc('set_push_token', { token });
  if (error) console.warn('set_push_token failed:', error.message);
}
```

- [ ] **Step 4: Run — expect 3/3 PASS**

```bash
cd mobile && npm test -- pushNotifications
```

- [ ] **Step 5: Run full suite + tsc**

```bash
cd mobile && npx tsc --noEmit && npm test -- --watchAll=false
```

Expected: tsc clean; jest 20 + 3 = 23.

- [ ] **Step 6: Commit**

```bash
cd .. && git add mobile/src/lib/pushNotifications.ts mobile/tests/pushNotifications.test.ts
git commit -m "feat(mobile): pushNotifications module — registerForPushNotifications + syncPushToken"
```

---

## Task 13: realtime module

**Files:**
- Create: `mobile/src/lib/realtime.ts`

No unit test (heavy mocking of `RealtimeChannel`; manual acceptance covers it).

- [ ] **Step 1: Implement**

```typescript
// mobile/src/lib/realtime.ts
import type { RealtimeChannel } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function subscribeToFamily(familyId: string, queryClient: QueryClient): RealtimeChannel {
  const channel = supabase
    .channel(`family-${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chore_instances', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['kid-today'] });
        queryClient.invalidateQueries({ queryKey: ['approvals-chores'] });
        queryClient.invalidateQueries({ queryKey: ['activity-chores'] });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'redemptions', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['approvals-redemptions-pending'] });
        queryClient.invalidateQueries({ queryKey: ['approvals-redemptions-approved'] });
        queryClient.invalidateQueries({ queryKey: ['kid-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['kid-open-redemptions'] });
        queryClient.invalidateQueries({ queryKey: ['activity-redemptions'] });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'star_ledger', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['balance'] });
        queryClient.invalidateQueries({ queryKey: ['streak'] });
      },
    )
    .subscribe();
  return channel;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/src/lib/realtime.ts
git commit -m "feat(mobile): realtime module — subscribeToFamily via postgres_changes"
```

---

## Task 14: Wire notification handler + realtime subscription into root layout

**Files:**
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Replace `mobile/app/_layout.tsx`**

```typescript
// mobile/app/_layout.tsx — full file
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../src/hooks/useAuth';
import { useFamily } from '../src/hooks/useFamily';
import { queryClient } from '../src/lib/queryClient';
import { subscribeToFamily } from '../src/lib/realtime';
import { supabase } from '../src/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RealtimeBridge() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.session.user.id : undefined;
  const family = useFamily(userId);
  const qc = useQueryClient();

  useEffect(() => {
    if (family.status !== 'has-family') return;
    const channel = subscribeToFamily(family.familyId, qc);
    return () => { supabase.removeChannel(channel); };
  }, [family, qc]);

  return null;
}

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
      <RealtimeBridge />
      <Slot />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/app/_layout.tsx
git commit -m "feat(mobile): wire foreground notification handler + realtime subscription"
```

---

## Task 15: Push token registration on authed mount

**Files:**
- Modify: `mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Replace `(app)/_layout.tsx`**

```typescript
// mobile/app/(app)/_layout.tsx
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { syncPushToken } from '../../src/lib/pushNotifications';

export default function AppLayout() {
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    syncPushToken().catch(() => { /* silent — user denied or no Google Play Services */ });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/app/\(app\)/_layout.tsx
git commit -m "feat(mobile): register push token on first authed app mount"
```

---

## Task 16: Clear push_token on signOut

**Files:**
- Modify: `mobile/src/lib/auth.ts`

- [ ] **Step 1: Read existing `auth.ts`**

```bash
cat mobile/src/lib/auth.ts
```

The existing `signOut` function calls `supabase.auth.signOut()`. Wrap that with a `set_push_token('')` call.

- [ ] **Step 2: Modify `signOut`**

Replace the current `signOut` implementation with:

```typescript
export async function signOut() {
  try {
    await supabase.rpc('set_push_token', { token: '' });
  } catch {
    // best-effort — don't block sign-out on network blip
  }
  await supabase.auth.signOut();
}
```

- [ ] **Step 3: Run jest to ensure existing auth tests still pass**

```bash
cd mobile && npm test -- auth
```

Expected: 5/5 auth tests still pass. The new `set_push_token` call inside `signOut` may need the supabase mock updated to include `rpc`. If a test fails with "rpc is undefined" on the mocked client, extend the mock in `mobile/tests/auth.test.ts`:

```typescript
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }), /* ... existing keys */ },
    rpc: jest.fn().mockResolvedValue({ error: null }),
  },
}));
```

Adjust whichever existing mock structure is there.

- [ ] **Step 4: Commit**

```bash
cd .. && git add mobile/src/lib/auth.ts mobile/tests/auth.test.ts
git commit -m "feat(mobile): clear push_token via set_push_token RPC on sign-out"
```

---

## Task 17: Settings — invite a co-parent

**Files:**
- Modify: `mobile/app/(app)/parent/settings.tsx`

- [ ] **Step 1: Replace the file**

```typescript
// mobile/app/(app)/parent/settings.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../src/lib/supabase';
import { Button } from '../../../src/components/Button';
import { signOut } from '../../../src/lib/auth';

export default function Settings() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_family_invite');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (c) => { setCopied(false); setCode(c); },
    onError: (e) => Alert.alert('Could not generate code', (e as Error).message),
  });

  async function onCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {isLoading ? <ActivityIndicator /> : (
        <View style={styles.section}>
          <Text style={styles.label}>Family</Text>
          <Text style={styles.value}>{data?.familyName} · {data?.memberCount} member{data?.memberCount === 1 ? '' : 's'}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Co-parents</Text>
        <Button label="Invite a co-parent" onPress={() => invite.mutate()} loading={invite.isPending} variant="secondary" />
      </View>

      <View style={styles.stub}><Text style={styles.stubText}>Notifications — coming soon</Text></View>
      <View style={styles.stub}><Text style={styles.stubText}>Subscription — coming soon</Text></View>

      <Button label="Switch profile" variant="secondary" onPress={() => router.replace('/(app)')} />
      <Button label="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: 8 }} />

      <Modal visible={!!code} transparent animationType="fade" onRequestClose={() => setCode(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Co-parent invite code</Text>
            <Text style={styles.codeBig}>{code}</Text>
            <Text style={styles.modalSub}>Expires in 24 hours. Share it with your co-parent — they enter it on the join-family screen when they sign up.</Text>
            <Pressable onPress={onCopy} style={styles.copyBtn}>
              <Text style={styles.copyText}>{copied ? '✓ Copied' : 'Copy code'}</Text>
            </Pressable>
            <Pressable onPress={() => setCode(null)} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, gap: 12, alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  codeBig: { fontSize: 36, fontWeight: '700', letterSpacing: 8, color: '#111827', marginVertical: 8 },
  modalSub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  copyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#3b82f6' },
  copyText: { color: '#fff', fontWeight: '600' },
  doneBtn: { paddingVertical: 8 },
  doneText: { color: '#6b7280', fontWeight: '500' },
});
```

- [ ] **Step 2: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/app/\(app\)/parent/settings.tsx
git commit -m "feat(mobile): settings — invite a co-parent with modal + copy button"
```

---

## Task 18: Join-family onboarding screen + link from create-family

**Files:**
- Create: `mobile/app/(onboarding)/join-family.tsx`
- Modify: `mobile/app/(onboarding)/create-family.tsx` — add link

- [ ] **Step 1: Implement join-family screen**

```typescript
// mobile/app/(onboarding)/join-family.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { refetchFamily } from '../../src/hooks/useFamily';

export default function JoinFamilyScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!/^[0-9]{6}$/.test(code.trim())) return setError('Code must be 6 digits');
    if (name.trim().length === 0) return setError('Your name is required');
    setLoading(true);
    const { error } = await supabase.rpc('accept_invite', {
      code: code.trim(),
      display_name: name.trim(),
      avatar_id: avatar,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    refetchFamily();
    // Layout will redirect to /(app) when has-family resolves.
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Join a family</Text>
      <Text style={styles.sub}>Enter the 6-digit code shared by an existing parent.</Text>
      <TextField label="Invite code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="123456" />
      <TextField label="Your name (parent)" value={name} onChangeText={setName} placeholder="Sam" />
      <Text style={styles.label}>Pick your avatar</Text>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Join family" onPress={onSubmit} loading={loading} />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  error: { color: '#ef4444', marginBottom: 12, textAlign: 'center' },
});
```

- [ ] **Step 2: Add link on create-family screen**

Open `mobile/app/(onboarding)/create-family.tsx`. Find this block:

```typescript
      <Button label="Create family" onPress={onSubmit} loading={loading} />
      <Pressable onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
```

Insert a new link above the sign-out:

```typescript
      <Button label="Create family" onPress={onSubmit} loading={loading} />
      <Pressable onPress={() => router.push('/(onboarding)/join-family')} style={styles.joinLink}>
        <Text style={styles.joinLinkText}>Have an invite code? Join an existing family</Text>
      </Pressable>
      <Pressable onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
```

And in the styles object, append:

```typescript
  joinLink: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  joinLinkText: { color: '#3b82f6', fontSize: 14, fontWeight: '500' },
```

- [ ] **Step 3: Type-check + commit**

```bash
cd mobile && npx tsc --noEmit
cd .. && git add mobile/app/\(onboarding\)/join-family.tsx mobile/app/\(onboarding\)/create-family.tsx
git commit -m "feat(mobile): join-family onboarding screen + link from create-family"
```

---

## Task 19: Configure deploy-time settings for triggers (local dev)

**Files:** none (psql commands; documented in repo for the cloud deploy step)

The chore + redemption push triggers (Tasks 7, 8) read `app.settings.functions_base_url` and `app.settings.service_role_key`. M2 already required these — same values work for `send_push`.

- [ ] **Step 1: Set the database parameters for local dev**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "alter database postgres set app.settings.functions_base_url = 'http://host.docker.internal:54321/functions/v1';"

SERVICE_ROLE_KEY=$(npx supabase status -o json | jq -r '.[]|select(.name=="service_role_key")|.value')
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "alter database postgres set app.settings.service_role_key = '$SERVICE_ROLE_KEY';"
```

The values persist across `db reset`.

- [ ] **Step 2: Verify by running `supabase functions serve send_push` and driving a trigger event**

```bash
# Terminal A
npx supabase functions serve send_push --no-verify-jwt

# Terminal B — drive a chore approval that fires notify_push_chore
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "update public.chore_instances set status='approved', approved_at=now() where id = (select id from public.chore_instances limit 1);"
```

If no chore_instances exist, this is a no-op — the trigger only fires when a real status transition happens. Skip this verification until the M5 manual acceptance flow drives a real submission.

- [ ] **Step 3: No commit — this is a local-dev shell action**

(The cloud-deploy step needs the equivalent psql commands run against the cloud Postgres; documented in the M5 progress memory after the milestone tags.)

---

## Task 20: Manual M5 acceptance + tag + push + memory

**Files:** none (manual run + git tag + memory write)

- [ ] **Step 1: Reset DB and start everything**

```bash
# Terminal A
npx supabase db reset
npx supabase functions serve send_push --no-verify-jwt

# Terminal B
cd mobile && npx expo start --android --clear
```

- [ ] **Step 2: Run the M5 acceptance flow**

In the emulator:
1. Sign up as Parent A (`m5parent-a@example.com` / `test1234`) → onboarding → create family → add 1 kid.
2. Parent A → Settings → "Invite a co-parent" → modal shows a 6-digit code → tap Copy → note the code.
3. Sign out Parent A.
4. Sign up as Parent B (`m5parent-b@example.com` / `test1234`) → onboarding lands on create-family → tap "Have an invite code? Join an existing family" → enter the code, display name "Sam", avatar → tap "Join family" → app routes to the avatar lock.
5. Tap Sam's avatar → land on parent home (Chores tab); confirm Parent A's chores are visible.
6. From the same device (Parent B's session): tap kid avatar → kid taps Done on a chore → switch back to parent → Approvals tab shows the submission.
7. **Verify push:** background the app (recents tray, don't kill it). On Parent A's device (sign back in if you're sharing the emulator: sign out as B, sign in as A), trigger an action (e.g., from a fresh session do a chore approval on Parent A's side). Verify Parent B's emulator receives a push within ~2s. (If using a single emulator for both: open Mailpit-style or have someone else on a second device. For solo testing, use the curl smoke from Task 9 to manually fire a notification and confirm it arrives.)
8. **Verify realtime:** with both sessions running simultaneously (Parent A signed in on a second device / second emulator), drive a chore submission on the kid side and observe Parent A's Approvals tab populate without pull-to-refresh.
9. **RLS hardening sanity:** open Supabase Studio (http://127.0.0.1:54323), Authentication → Users, then SQL editor: `update public.profiles set type='kid' where id = '<another parent profile id>';` — 0 rows affected (RLS-silent). Confirm with `select type from public.profiles where id = ...` still says 'parent'.

- [ ] **Step 3: Tag the milestone**

```bash
git tag -a m5-live-social -m "M5: Live + Social (realtime + push + co-parent invite) milestone complete"
git tag --list m5-live-social -n5
```

- [ ] **Step 4: Merge to main + push**

```bash
git switch main
git merge m5-live-social --ff-only
git push origin main
git push origin --tags
```

- [ ] **Step 5: Update project memory**

Write `m5_progress.md` (analogous to `m4_progress.md`) to the memory directory recording M5 status, late acceptance fixes (if any), deferrals into M6, and the manual deploy-time config note about `app.settings.functions_base_url` + `app.settings.service_role_key` needing to be set on cloud Postgres for triggers to reach the deployed `send_push` Edge Function. Update `MEMORY.md` to link it.

---

## Spec coverage check (self-review)

| Spec section | Tasks |
|---|---|
| 1.1 family_invites + 3 RPCs | T1, T3, T4, T5 |
| 1.1 RLS hardening (drop policy + index + set_push_token) | T2, T5, T6 |
| 1.1 Realtime via postgres_changes | T13, T14 |
| 1.1 Push triggers + send_push edge function | T7, T8, T9 |
| 1.1 Mobile push UX (permission + token + foreground handler + signOut clear) | T11, T12, T14, T15, T16 |
| 2 data model | T1, T2 |
| 3.1 create_family_invite | T3 |
| 3.2 accept_invite | T4 |
| 3.3 set_push_token | T5 |
| 3.4 RLS changes | T1, T6 |
| 3.5 push triggers + send_push | T7, T8, T9 |
| 3.6 validation paths | T3, T4, T5 (each test file exercises raise paths) |
| 3.7 deploy-time config | T19 |
| 4.1 join-family onboarding | T18 |
| 4.2 settings invite UI | T17 |
| 4.3 push notification permission + foreground handler | T11, T12, T14, T15 |
| 4.4 realtime subscription | T13, T14 |
| 4.5 signOut cleanup | T16 |
| 5.1 pgTAP coverage | T1–T6 |
| 5.2 jest coverage | T12 |
| 5.3 edge function smoke test | T9 |
| 5.4 manual acceptance | T20 |
| 5.5 exit criteria + tag | T20 |

Every spec section reached by a task. No placeholders. Function / module names consistent: `create_family_invite`, `accept_invite`, `set_push_token`, `notify_push_chore`, `notify_push_redemption`, `send_push`, `registerForPushNotifications`, `syncPushToken`, `subscribeToFamily`.

---

**End of M5 plan.**
