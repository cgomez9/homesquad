# M7 Pre-launch Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shores submittable to the App Store and Play Store by adding the five remaining blockers — cloud Supabase, account deletion, Sign in with Apple, Sign in with Google, iOS push via APNs — without scope-creeping into engagement or reliability work.

**Architecture:** Four of the five workstreams are external configuration plus credential plumbing wired into existing pipelines. The only new feature code is the `delete_account` RPC and the Account section in settings. Apple Developer Program enrollment is the long-pole external dependency and is kicked off on Day 0 to run in parallel with active engineering work.

**Tech Stack:** Supabase (cloud), Expo SDK 54 + React Native 0.81, Expo Router 6, TanStack Query 5, Jest + jest-expo, pgTAP, `expo-apple-authentication`, `@react-native-google-signin/google-signin`, EAS Build.

**Spec:** `docs/superpowers/specs/2026-05-11-m7-prelaunch-design.md` (commit `9a1d3c9` on branch `m7-prelaunch`).

---

## File map

**New files:**
- `mobile/eas.json` — three EAS Build profiles (development, preview, production)
- `mobile/.env.example` — committed placeholder documenting four `EXPO_PUBLIC_*` keys
- `mobile/.env` — gitignored (covered by root `.env`), local Supabase URL + anon key
- `mobile/src/components/SocialAuthRow.tsx` — Apple + Google buttons rendered above email fields
- `mobile/src/components/DeleteAccountModal.tsx` — typed-confirmation modal
- `supabase/migrations/20260511000015_delete_account_rpc.sql` — `delete_account()` security-definer RPC
- `supabase/tests/37_delete_account_rpc.sql` — three pgTAP scenarios
- `mobile/tests/socialAuth.test.ts` — Jest tests for `signInWithApple` + `signInWithGoogle`
- `mobile/tests/DeleteAccountModal.test.tsx` — Jest tests for modal state machine

**Modified files:**
- `mobile/src/lib/auth.ts` — add `signInWithApple` + `signInWithGoogle` exports
- `mobile/app.json` — add `expo-apple-authentication` + `@react-native-google-signin/google-signin` plugins
- `mobile/app/(auth)/login.tsx` — mount `<SocialAuthRow />` above email field
- `mobile/app/(auth)/signup.tsx` — mount `<SocialAuthRow />` above email field
- `mobile/app/(app)/parent/settings.tsx` — add Account section + delete modal trigger
- `mobile/package.json` — picks up new deps automatically

**External configuration (no repo files):**
- Apple Developer Program enrollment, Services ID, APNs `.p8` key
- Google Cloud OAuth client IDs (web/iOS/Android)
- Supabase cloud project (anon key, service_role key, `app.settings.*`)
- EAS account + Android keystore + EAS Secrets

---

## Phase 0 — Async kickoff (run on Day 0, then continue with active work)

### Task 1: Kick off Apple Developer Program enrollment

External, blocks Tasks 17, 25, 26.

- [ ] **Step 1: Navigate to Apple Developer Program**

Go to https://developer.apple.com/programs/enroll/

- [ ] **Step 2: Enroll as an Individual** (or Organization if applicable)

Pay $99 USD. Apple will review the application — usually 24–48 hours for individuals.

- [ ] **Step 3: Record the Apple Developer Team ID**

Once approved, find Team ID at https://developer.apple.com/account → Membership → Team ID. Save it in 1Password as `Shores / Apple / Team ID`.

- [ ] **Step 4: Verify access**

Confirm "Certificates, Identifiers & Profiles" is reachable at https://developer.apple.com/account/resources/. Without this, Tasks 17 and 26 cannot proceed.

No git commit — external state only.

---

### Task 2: Create Google Cloud project + base OAuth consent screen

External. Required by Task 21. Independent of Apple Dev.

- [ ] **Step 1: Create a Google Cloud project**

Go to https://console.cloud.google.com/projectcreate. Project name: `shores`. Save the project ID in 1Password.

- [ ] **Step 2: Configure the OAuth consent screen**

Navigate APIs & Services → OAuth consent screen. User type: **External**. Fill app name `Shores`, user support email, developer contact. Scopes: leave defaults (only `.../auth/userinfo.email` and `.../auth/userinfo.profile` and `openid` — these are non-sensitive). Save and continue. **Do not submit for verification** — non-sensitive scopes don't require it.

- [ ] **Step 3: Add yourself as a test user**

Add your Google account email to the Test users list so you can sign in while the app is in "Testing" mode. Production publish happens after launch.

No git commit — external state only.

---

## Phase 1 — Cloud Supabase migration

### Task 3: Create Supabase cloud project + enable extensions

External setup that all subsequent cloud work depends on.

- [ ] **Step 1: Create the cloud project**

Go to https://supabase.com/dashboard. Create project: name `shores-prod`, region closest to you (e.g., `us-east-1`), database password — save in 1Password as `Shores / Supabase / DB Password`. Wait ~2 minutes for provisioning.

- [ ] **Step 2: Record keys**

Settings → API. Save in 1Password:
- `Project URL` → `Shores / Supabase / Project URL` (e.g., `https://abcdef.supabase.co`)
- `Project ref` (the `abcdef` portion) → `Shores / Supabase / Project Ref`
- `anon public` key → `Shores / Supabase / Anon Key`
- `service_role secret` key → `Shores / Supabase / Service Role Key`

- [ ] **Step 3: Enable extensions before migrations**

Database → Extensions. Toggle ON:
- `pg_cron`
- `pg_net`

This must happen before `supabase db push` — the cron migration calls `cron.schedule(...)` and would fail otherwise.

- [ ] **Step 4: Set `app.settings.*` via Dashboard**

Settings → Database → Custom Postgres Config. Add two entries:
- Key: `app.settings.functions_base_url` — Value: `https://<project-ref>.supabase.co/functions/v1`
- Key: `app.settings.service_role_key` — Value: `<service_role_key>`

Restart the database when prompted. The Dashboard route is used (not direct `ALTER DATABASE`) because cloud Supabase locks down those privileges from the `postgres` role.

No git commit — external state only.

---

### Task 4: Link CLI and push all migrations to cloud

- [ ] **Step 1: Authenticate CLI**

Run from project root:

```bash
supabase login
```

Browser opens — authorize. Token saved to `~/.supabase/`.

- [ ] **Step 2: Link to the cloud project**

```bash
supabase link --project-ref <ref-from-task-3>
```

When prompted, paste the database password from Task 3 Step 1.

- [ ] **Step 3: Push migrations**

```bash
supabase db push
```

Expected: all 44 migrations apply in timestamp order, with output ending in `Finished supabase db push`. If any migration fails (most commonly the cron migration if Task 3 Step 3 was skipped), stop and fix before continuing.

- [ ] **Step 4: Verify migration application**

Run from a SQL client (Supabase Dashboard → SQL Editor):

```sql
select count(*) from supabase_migrations.schema_migrations;
```

Expected: 44 (or whatever count matches `git ls-files supabase/migrations/*.sql | wc -l`).

- [ ] **Step 5: Verify publication opt-in**

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
```

Expected: four rows — `achievements`, `chore_instances`, `redemptions`, `star_ledger`.

- [ ] **Step 6: Verify extensions and settings**

```sql
select extname from pg_extension where extname in ('pg_cron','pg_net');
select current_setting('app.settings.functions_base_url', true);
select current_setting('app.settings.service_role_key', true);
```

Expected: both extensions present, both settings non-null. If `current_setting` returns null, Task 3 Step 4 wasn't saved correctly — retry.

- [ ] **Step 7: Verify storage bucket**

```sql
select id, name, public from storage.buckets where id = 'chore-proofs';
```

Expected: one row with `public = false`.

No git commit — only external cloud state changed.

---

### Task 5: Deploy `send_push` edge function to cloud

- [ ] **Step 1: Deploy the function**

```bash
supabase functions deploy send_push --no-verify-jwt
```

The `--no-verify-jwt` flag matters — `send_push` is invoked by `pg_net` from triggers, not by an authenticated client. Without it, all invocations 401.

- [ ] **Step 2: Smoke-test reachability**

```bash
curl.exe -X POST https://<project-ref>.supabase.co/functions/v1/send_push \
  -H "Content-Type: application/json" \
  -d '{"event":"test","family_id":"00000000-0000-0000-0000-000000000000"}'
```

(Use `curl.exe` not `curl` — PowerShell aliases `curl` to `Invoke-WebRequest`, M5 lesson.)

Expected: HTTP 200 with a JSON response body. The function will not actually push anything (no real family_id) but should respond cleanly without crashing.

- [ ] **Step 3: Check function logs**

Dashboard → Edge Functions → `send_push` → Logs. Confirm the request from Step 2 appears with status 200. No commit needed.

No git commit — external state only.

---

### Task 6: Smoke-test cloud via throwaway local Expo build

- [ ] **Step 1: Temporarily point local Expo at cloud**

Edit `mobile/.env` (create if missing — already gitignored via root `.env` pattern):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-task-3>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 2: Start Expo**

```bash
cd mobile
npx expo start --clear
```

- [ ] **Step 3: End-to-end smoke from a real device**

On a phone with Expo Go:
1. Sign up with email/password.
2. Create a family ("Smoke test").
3. Add a kid ("Test kid").
4. Create a chore with auto-credit verification.
5. Tap the kid's avatar → see today's chore → tap Done → see ⭐ awarded.

Expected: all five steps complete without error. This proves cloud Supabase has all RPCs, the storage bucket, and a functioning auth flow.

- [ ] **Step 4: Clean up smoke test data**

In Dashboard SQL Editor:

```sql
delete from auth.users where email = '<smoke-test-email>';
```

(Cascade-deletes family + kids + chores via FKs.)

- [ ] **Step 5: Revert `.env` for now**

Restore `mobile/.env` to local Supabase values:

```
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<from `npx supabase status` "anon key" output>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

No git commit — `.env` is gitignored.

---

## Phase 2 — EAS Build setup

### Task 7: Create `mobile/.env.example` and commit

- [ ] **Step 1: Create the file**

Create `mobile/.env.example`:

```
# Copy to mobile/.env for local development.
# For EAS preview/production builds these are set as EAS Secrets, not via .env.

EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 2: Commit**

```bash
git add mobile/.env.example
git commit -m "chore(mobile): add .env.example with EXPO_PUBLIC_* keys"
```

---

### Task 8: Install EAS CLI and log in

- [ ] **Step 1: Install EAS CLI globally**

```bash
npm install -g eas-cli
```

- [ ] **Step 2: Log in**

```bash
eas login
```

Browser opens — authorize with the Expo account. (Create one at https://expo.dev/signup if needed.)

- [ ] **Step 3: Verify auth**

```bash
eas whoami
```

Expected: prints the Expo username.

No git commit — only local CLI state changed.

---

### Task 9: Create `mobile/eas.json` with three profiles

- [ ] **Step 1: Initialize EAS in mobile/**

```bash
cd mobile
eas build:configure
```

When prompted, choose: all platforms (iOS + Android). EAS will generate a starter `eas.json` and may modify `app.json` to add an `extra.eas.projectId`. Accept those changes.

- [ ] **Step 2: Replace generated `eas.json` with the M7 three-profile structure**

Open `mobile/eas.json` and replace contents:

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "http://10.0.2.2:54321"
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "$EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "$EXPO_PUBLIC_SUPABASE_ANON_KEY",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "$EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
      },
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "$EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "$EXPO_PUBLIC_SUPABASE_ANON_KEY",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "$EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
      },
      "ios": { "simulator": false }
    }
  },
  "submit": {
    "production": {}
  }
}
```

The `$VAR_NAME` syntax in `env` blocks tells EAS to pull values from EAS Secrets at build time.

The development profile's `EXPO_PUBLIC_SUPABASE_URL` is `http://10.0.2.2:54321` because that's how Android emulators reach the host machine's localhost. For iOS simulator add a separate value or override locally via `eas build --local`.

- [ ] **Step 3: Commit**

```bash
git add mobile/eas.json mobile/app.json
git commit -m "chore(mobile): add eas.json with development/preview/production profiles"
```

---

### Task 10: Create EAS Secrets for cloud values

- [ ] **Step 1: Set the four secrets**

From `mobile/`:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project-ref>.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon-key>"
```

Leave the two Google secrets unset for now — Task 22 will create them once Google OAuth client IDs exist.

- [ ] **Step 2: Verify**

```bash
eas secret:list
```

Expected: both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` listed at project scope.

No git commit — only EAS state changed.

---

### Task 11: Generate Android keystore and capture SHA-1

Needed for Task 21 (Google Android OAuth client).

- [ ] **Step 1: Trigger Android keystore generation**

From `mobile/`:

```bash
eas credentials --platform android
```

Choose:
- Build profile: `preview`
- Action: "Set up a new keystore" → "Yes, generate a new keystore"

EAS provisions a keystore server-side.

- [ ] **Step 2: Capture SHA-1 fingerprint**

In the same `eas credentials` session, the SHA-1 is displayed. Save in 1Password as `Shores / Android / SHA-1`.

Alternatively, retrieve later via:

```bash
eas credentials --platform android
```

then Action: "Show credentials".

No git commit — only EAS state changed.

---

### Task 12: First EAS dev build (verifies setup before any auth provider work)

- [ ] **Step 1: Trigger Android dev build**

```bash
eas build --profile development --platform android
```

Build takes ~10–15 minutes on EAS infrastructure. Wait for completion.

- [ ] **Step 2: Install on Android device**

When the build completes, EAS provides an install link. Open it on an Android phone connected to the same WiFi as your dev machine. Install the APK.

- [ ] **Step 3: Verify dev build runs against local Supabase**

Start the dev server:

```bash
cd mobile
npx expo start --dev-client --tunnel
```

Open the installed app on the phone. Confirm it loads the auth screen. (If `10.0.2.2:54321` isn't reachable on a physical device, use `npx expo start --dev-client --host lan` and update the dev profile's `EXPO_PUBLIC_SUPABASE_URL` to your machine's LAN IP.)

- [ ] **Step 4: Trigger iOS dev build** (works without Apple Dev enrollment because dev-client uses Expo's free provisioning)

```bash
eas build --profile development --platform ios
```

When prompted for credentials, choose "Let EAS handle it" — Expo will provision an ad-hoc certificate. You'll need to register your iOS device's UDID. Follow the EAS prompts.

- [ ] **Step 5: Install on iOS device**

Open the EAS install link on the iPhone. Trust the developer profile via Settings → General → VPN & Device Management.

No git commit — builds + credentials live on EAS.

---

## Phase 3 — Account deletion

### Task 13: Write failing pgTAP test for `delete_account` RPC

- [ ] **Step 1: Create the test file**

Create `supabase/tests/37_delete_account_rpc.sql`:

```sql
begin;
select plan(8);

-- Scenario 1: single-parent family, full cascade
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'solo@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Solo Family');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Solo Parent', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Solo Kid',    2, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_account() $$,
  'solo parent delete_account succeeds'
);

reset role;
select is(
  (select count(*)::int from public.families where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'family row deleted'
);
select is(
  (select count(*)::int from public.profiles where family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'profiles cascade-deleted'
);
select is(
  (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  0, 'auth.users row deleted'
);

-- Scenario 2: two-parent family, only caller removed
insert into auth.users(id, email) values
  ('22222222-2222-2222-2222-222222222222', 'parent-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'parent-b@test.com');
insert into public.families(id, name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Couple Family');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Parent A', 1, '22222222-2222-2222-2222-222222222222'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Parent B', 2, '33333333-3333-3333-3333-333333333333'),
  ('b3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'kid',    'Shared Kid', 3, null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_account() $$,
  'co-parent delete_account succeeds'
);

reset role;
select is(
  (select count(*)::int from public.families where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1, 'family row preserved'
);
select is(
  (select count(*)::int from public.profiles where family_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and user_id = '33333333-3333-3333-3333-333333333333'),
  1, 'other parent profile preserved'
);

-- Scenario 3: unauthenticated caller
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

prepare anon_delete as select public.delete_account();
select throws_ok('anon_delete', null, null, 'unauthenticated caller raises');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
supabase db reset
supabase test db
```

Expected: this test fails because `public.delete_account` does not exist yet. Output should include `function public.delete_account() does not exist`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/37_delete_account_rpc.sql
git commit -m "test(db): failing pgTAP for delete_account RPC"
```

---

### Task 14: Implement `delete_account` RPC migration

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260511000015_delete_account_rpc.sql`:

```sql
-- delete_account(): hard-delete the calling user.
-- If they are the last parent in their family, cascade-delete the family.
-- If a co-parent exists, only the calling profile + their auth.users row are removed.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id       uuid := auth.uid();
  v_family_id     uuid;
  v_other_parents int;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select family_id into v_family_id
  from public.profiles
  where user_id = v_user_id and type = 'parent';

  if v_family_id is null then
    -- mid-onboarding edge case: user has no parent profile yet
    delete from auth.users where id = v_user_id;
    return;
  end if;

  select count(*) into v_other_parents
  from public.profiles
  where family_id = v_family_id
    and type = 'parent'
    and user_id != v_user_id;

  if v_other_parents = 0 then
    delete from public.families where id = v_family_id;
  else
    delete from public.profiles where user_id = v_user_id;
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
```

- [ ] **Step 2: Apply migration locally**

```bash
supabase db reset
```

Expected: all migrations apply, including the new one.

- [ ] **Step 3: Run pgTAP and confirm all scenarios pass**

```bash
supabase test db
```

Expected: `37_delete_account_rpc.sql` shows `ok 8/8`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260511000015_delete_account_rpc.sql
git commit -m "feat(db): delete_account RPC with family cascade on last parent"
```

---

### Task 15: Apply `delete_account` migration to cloud

- [ ] **Step 1: Push the new migration to cloud**

```bash
supabase db push
```

Expected: only `20260511000015_delete_account_rpc.sql` applies (previous migrations already there).

- [ ] **Step 2: Verify the function exists on cloud**

In Dashboard → SQL Editor:

```sql
select proname, prosecdef from pg_proc where proname = 'delete_account';
```

Expected: one row, `prosecdef = true` (security definer).

- [ ] **Step 3: Test `delete from auth.users` privilege on cloud**

Run a small manual test in SQL Editor (replace UUIDs with real test values):

```sql
-- as service role:
insert into auth.users(id, email) values ('99999999-9999-9999-9999-999999999999', 'cloud-priv-test@example.com');

-- check the security-definer function can delete
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select public.delete_account();

reset role;
select count(*) from auth.users where id = '99999999-9999-9999-9999-999999999999';
```

Expected: final count is 0. If this fails (i.e., security-definer doesn't have auth.users delete grants on cloud), implement the contingency in Step 4 instead. If it passes, skip Step 4.

- [ ] **Step 4 (CONTINGENCY only if Step 3 failed): Switch to service-role Edge Function**

Create `supabase/functions/delete_account/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = auth.slice('Bearer '.length);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify the JWT and get user id
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const adminClient = createClient(supabaseUrl, serviceKey);

  // Run the family-cascade logic via a security-definer RPC that does NOT touch auth.users
  const { error: rpcErr } = await adminClient.rpc('delete_account_profile_cascade', { p_user_id: user.id });
  if (rpcErr) return new Response(rpcErr.message, { status: 500 });

  // Now admin-delete the auth user
  const { error: delErr } = await adminClient.auth.admin.deleteUser(user.id);
  if (delErr) return new Response(delErr.message, { status: 500 });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

Then split the RPC: rename `delete_account` to `delete_account_profile_cascade(p_user_id uuid)`, drop the `delete from auth.users` line, and call it from the Edge Function as shown above. Update the mobile client to invoke the Edge Function via `supabase.functions.invoke('delete_account')` instead of `supabase.rpc('delete_account')`.

This contingency adds a migration + Edge Function. Document the switch in M7 progress notes.

No git commit if Step 3 passed (no code changes). If Step 4 was needed, commit the Edge Function + revised migration.

---

### Task 16: Write failing Jest test for `DeleteAccountModal`

- [ ] **Step 1: Create the test file**

Create `mobile/tests/DeleteAccountModal.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';

describe('DeleteAccountModal', () => {
  it('renders title and confirmation field', () => {
    const { getByText, getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} />
    );
    expect(getByText('Delete your account?')).toBeTruthy();
    expect(getByTestId('delete-confirm-input')).toBeTruthy();
  });

  it('disables Delete button until DELETE is typed exactly', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={onConfirm} loading={false} />
    );
    const input = getByTestId('delete-confirm-input');
    const button = getByTestId('delete-confirm-button');

    fireEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'delete');
    fireEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'DELETE');
    fireEvent.press(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={onCancel} onConfirm={jest.fn()} loading={false} />
    );
    fireEvent.press(getByTestId('delete-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when loading=true', () => {
    const { getByTestId } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={true} />
    );
    expect(getByTestId('delete-loading')).toBeTruthy();
  });

  it('surfaces error prop in modal body', () => {
    const { getByText } = render(
      <DeleteAccountModal visible={true} onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} error="Could not delete: network error" />
    );
    expect(getByText('Could not delete: network error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

```bash
cd mobile
npm test -- DeleteAccountModal
```

Expected: `Cannot find module '../src/components/DeleteAccountModal'`.

- [ ] **Step 3: Commit**

```bash
git add mobile/tests/DeleteAccountModal.test.tsx
git commit -m "test(mobile): failing tests for DeleteAccountModal state machine"
```

---

### Task 17: Implement `DeleteAccountModal` component

- [ ] **Step 1: Create the component**

Create `mobile/src/components/DeleteAccountModal.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  loading: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountModal({ visible, loading, error, onCancel, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!visible) setConfirmText('');
  }, [visible]);

  const canConfirm = confirmText === 'DELETE' && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>
            This permanently deletes your account and all your data. If you're the last parent in this family,
            the family, your kids' profiles, all chores, rewards, and history will be deleted too.
            This cannot be undone.
          </Text>
          <Text style={styles.label}>Type DELETE to confirm:</Text>
          <TextInput
            testID="delete-confirm-input"
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable testID="delete-cancel-button" onPress={onCancel} style={styles.cancelBtn} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="delete-confirm-button"
              onPress={() => canConfirm && onConfirm()}
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              disabled={!canConfirm}
            >
              {loading ? (
                <ActivityIndicator testID="delete-loading" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Delete forever</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  body: { fontSize: 14, color: '#374151', lineHeight: 20 },
  label: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#ef4444', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmBtnDisabled: { backgroundColor: '#fca5a5' },
  confirmText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 2: Run tests**

```bash
cd mobile
npm test -- DeleteAccountModal
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/DeleteAccountModal.tsx
git commit -m "feat(mobile): DeleteAccountModal with typed DELETE confirmation"
```

---

### Task 18: Wire `DeleteAccountModal` into Settings

- [ ] **Step 1: Modify `mobile/app/(app)/parent/settings.tsx`**

Insert imports (top of file, after existing imports):

```tsx
import { DeleteAccountModal } from '../../../src/components/DeleteAccountModal';
import { useRouter } from 'expo-router'; // already imported — confirm
```

Inside the `Settings()` function body, after the existing `invite` mutation, add:

```tsx
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    },
    onError: (e) => setDeleteError((e as Error).message),
  });
```

Insert a new Account section in the JSX, between the existing **Feedback** section and the **Switch profile / Sign out** buttons:

```tsx
      <View style={styles.section}>
        <Text style={styles.label}>Account</Text>
        <Pressable onPress={() => { setDeleteError(null); setDeleteOpen(true); }} style={styles.dangerBtn}>
          <Text style={styles.dangerText}>Delete account</Text>
        </Pressable>
      </View>
```

Add the modal at the end of the outer `<View style={styles.container}>`, immediately before its closing `</View>`. Order doesn't matter for `Modal` rendering, but placing it last keeps the JSX hierarchy easy to read:

```tsx
      <DeleteAccountModal
        visible={deleteOpen}
        loading={deleteAccount.isPending}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteError(null); deleteAccount.mutate(); }}
      />
```

Add to the `StyleSheet.create(...)` block:

```tsx
  dangerBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ef4444', alignItems: 'center', marginTop: 8 },
  dangerText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test locally**

```bash
cd mobile
npx expo start --clear
```

1. Sign up with a test account.
2. Create a family.
3. Go to Settings → Delete account → confirm modal appears.
4. Type "delete" (lowercase) → button stays disabled.
5. Type "DELETE" → button enables → tap → spinner → lands on login screen.
6. Try to log in with the deleted account → "Invalid login credentials".

- [ ] **Step 4: Commit**

```bash
git add mobile/app/(app)/parent/settings.tsx
git commit -m "feat(mobile): settings — Account section with delete-account flow"
```

---

## Phase 4 — Sign in with Apple

Apple Developer enrollment must be approved before this phase. If still pending, skip to Phase 5 (Google) and return.

### Task 19: Install `expo-apple-authentication` and register plugin

- [ ] **Step 1: Install the package**

```bash
cd mobile
npx expo install expo-apple-authentication
```

This adds `expo-apple-authentication` to `package.json` and `package-lock.json`.

- [ ] **Step 2: Register the plugin in `mobile/app.json`**

Edit `mobile/app.json` `plugins` array:

```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  "expo-audio",
  "expo-apple-authentication"
]
```

- [ ] **Step 3: Add iOS usesAppleSignIn entitlement**

Add `ios.usesAppleSignIn: true` to `mobile/app.json`:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.shores.app",
  "usesAppleSignIn": true
}
```

- [ ] **Step 4: Commit**

```bash
git add mobile/app.json mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add expo-apple-authentication + usesAppleSignIn entitlement"
```

---

### Task 20: Configure Apple Sign-In credentials (Apple Developer Portal + Supabase)

External, gated by Task 1 enrollment.

- [ ] **Step 1: Create Services ID**

Go to https://developer.apple.com/account/resources/identifiers/serviceId. Add `+` → Services ID. Description: `Shores Sign in with Apple`. Identifier: `com.shores.app.signin`. Save the identifier in 1Password.

- [ ] **Step 2: Enable Sign in with Apple on the bundle's App ID**

Identifiers → select `com.shores.app` → check "Sign in with Apple" → Save.

- [ ] **Step 3: Configure the Services ID**

Edit the new Services ID → check "Sign in with Apple" → Configure:
- Primary App ID: `com.shores.app`
- Domains and Subdomains: `<project-ref>.supabase.co`
- Return URLs: `https://<project-ref>.supabase.co/auth/v1/callback`
Save.

- [ ] **Step 4: Generate Sign in with Apple key (.p8)**

Keys → `+` → name `Shores Sign in with Apple Key` → check "Sign in with Apple" → Configure → Primary App ID: `com.shores.app` → Save → Continue → Register → **download the .p8 file** (one-time download!). Record Key ID. Store .p8 in 1Password as `Shores / Apple / SignIn Key .p8`.

- [ ] **Step 5: Upload to Supabase**

Dashboard → Authentication → Providers → Apple → Enable.
- Services ID: `com.shores.app.signin`
- Team ID: from Task 1 Step 3
- Key ID: from Step 4
- Secret Key (.p8 contents): paste full file contents including `-----BEGIN PRIVATE KEY-----` lines

Save.

No git commit — external state only.

---

### Task 21: Write failing Jest test for `signInWithApple`

- [ ] **Step 1: Create the test file**

Create `mobile/tests/socialAuth.test.ts`:

```typescript
import { signInWithApple } from '../src/lib/auth';
import { supabase } from '../src/lib/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
    },
  },
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 'email', FULL_NAME: 'fullName' },
}));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const mockedApple = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;

beforeEach(() => jest.clearAllMocks());

describe('signInWithApple', () => {
  it('passes the Apple identity token to supabase.auth.signInWithIdToken', async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: 'apple-id-token-xyz',
      user: 'user-id',
    } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: null } as any);

    await signInWithApple();

    expect(mockedAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token-xyz',
    });
  });

  it('throws when Apple returns no identity token', async () => {
    mockedApple.signInAsync.mockResolvedValue({ identityToken: null } as any);
    await expect(signInWithApple()).rejects.toThrow(/identity token/i);
  });

  it('throws when supabase returns an error', async () => {
    mockedApple.signInAsync.mockResolvedValue({ identityToken: 'tok' } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'invalid' } } as any);
    await expect(signInWithApple()).rejects.toThrow('invalid');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd mobile
npm test -- socialAuth
```

Expected: `signInWithApple is not a function` or similar export error.

- [ ] **Step 3: Commit**

```bash
git add mobile/tests/socialAuth.test.ts
git commit -m "test(mobile): failing tests for signInWithApple"
```

---

### Task 22: Implement `signInWithApple` in `auth.ts`

- [ ] **Step 1: Modify `mobile/src/lib/auth.ts`**

Append to the existing file:

```typescript
import * as AppleAuthentication from 'expo-apple-authentication';

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
  });
  if (!credential.identityToken) {
    throw new Error('No identity token from Apple');
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Run tests**

```bash
cd mobile
npm test -- socialAuth
```

Expected: 3 `signInWithApple` tests pass.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/auth.ts
git commit -m "feat(mobile): signInWithApple using identity token flow"
```

---

### Task 23: Create `SocialAuthRow` component (Apple only for now)

Google button is added in Task 27 — keeping this step Apple-only avoids dead UI before Google clients exist.

- [ ] **Step 1: Create the component**

Create `mobile/src/components/SocialAuthRow.tsx`:

```tsx
import { Platform, View, Text, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '../lib/auth';

export function SocialAuthRow() {
  async function onApplePress() {
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e?.message ?? '';
      // User cancelled the Apple sheet — silently dismiss.
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('canceled')) return;
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleBtn}
          onPress={onApplePress}
        />
      )}
      {Platform.OS === 'ios' && (
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>or</Text>
          <View style={styles.line} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12, marginBottom: 12 },
  appleBtn: { height: 48 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  or: { color: '#6b7280', fontSize: 13 },
});
```

- [ ] **Step 2: Mount in `mobile/app/(auth)/login.tsx`**

Edit the file:

```tsx
import { SocialAuthRow } from '../../src/components/SocialAuthRow';
```

In the JSX, just below `<Text style={styles.title}>Welcome back</Text>`, add:

```tsx
      <SocialAuthRow />
```

- [ ] **Step 3: Mount in `mobile/app/(auth)/signup.tsx`**

Same import and same `<SocialAuthRow />` placement, after `<Text style={styles.title}>Create your account</Text>`.

- [ ] **Step 4: Verify TypeScript**

```bash
cd mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/SocialAuthRow.tsx mobile/app/\(auth\)/login.tsx mobile/app/\(auth\)/signup.tsx
git commit -m "feat(mobile): SocialAuthRow with Sign in with Apple on iOS"
```

---

### Task 24: EAS preview build and end-to-end test SIWA

- [ ] **Step 1: Build preview for iOS**

```bash
cd mobile
eas build --profile preview --platform ios
```

Wait ~15 minutes. EAS will prompt for App Store provisioning artifacts — let EAS handle them (uses Apple credentials from `eas credentials`).

- [ ] **Step 2: Install on iOS device via TestFlight Internal Track**

Submit to TestFlight via:

```bash
eas submit --profile production --platform ios --latest
```

Wait for Apple processing (~15 minutes). Install via TestFlight app.

Alternative: use the EAS install URL directly (ad-hoc) — faster but requires device UDID registered.

- [ ] **Step 3: Test the full SIWA flow**

On the iOS device, in the installed app:
1. On the auth screen, tap the "Sign in with Apple" button.
2. Complete the Apple sheet (Face ID / Touch ID / Apple ID password).
3. Choose "Share My Email" (or "Hide My Email" — either should work).
4. App should land on the family-creation screen (because no family exists for this auth user yet).
5. Create a family ("SIWA Test") → add a kid → confirm landing on family home.

- [ ] **Step 4: Verify Supabase recorded the user**

Dashboard → Authentication → Users. Confirm a new user with the Apple email (or `@privaterelay.appleid.com` if Hide My Email was used) and provider `apple`.

- [ ] **Step 5: Clean up test data**

Settings → Delete account → confirm. Verify the auth user is gone in Dashboard.

No git commit — only EAS build + Apple state.

---

## Phase 5 — Sign in with Google

### Task 25: Create Google OAuth client IDs

External, depends on Task 11 (Android SHA-1) and Task 2 (Google Cloud project).

- [ ] **Step 1: Create Web client ID** (audience for Supabase)

Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: **Web application** → Name: `Shores Web`. Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`. Create. Save Client ID + Client Secret in 1Password.

- [ ] **Step 2: Create iOS client ID**

Create credentials → OAuth client ID → Application type: **iOS** → Name: `Shores iOS` → Bundle ID: `com.shores.app`. Create. Save Client ID in 1Password. Note the **iOS URL scheme** (the Client ID reversed, e.g., `com.googleusercontent.apps.123-abc`).

- [ ] **Step 3: Create Android client ID**

Create credentials → OAuth client ID → Application type: **Android** → Name: `Shores Android` → Package name: `com.shores.app` → SHA-1 from Task 11 Step 2. Create. Save Client ID in 1Password.

- [ ] **Step 4: Upload Web client credentials to Supabase**

Dashboard → Authentication → Providers → Google → Enable.
- Client ID (for OAuth): Web Client ID from Step 1
- Client Secret (for OAuth): Web Client Secret from Step 1
- Authorized Client IDs: paste iOS Client ID and Android Client ID, comma-separated.

Save.

No git commit — external state only.

---

### Task 26: Install `@react-native-google-signin/google-signin` and configure

- [ ] **Step 1: Install the package**

```bash
cd mobile
npx expo install @react-native-google-signin/google-signin
```

- [ ] **Step 2: Add plugin config to `mobile/app.json`**

Edit the `plugins` array:

```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  "expo-audio",
  "expo-apple-authentication",
  [
    "@react-native-google-signin/google-signin",
    { "iosUrlScheme": "<reversed-iOS-client-id>" }
  ]
]
```

Replace `<reversed-iOS-client-id>` with the value from Task 25 Step 2 (e.g., `com.googleusercontent.apps.123456-abc`).

- [ ] **Step 3: Commit**

```bash
git add mobile/app.json mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): add @react-native-google-signin/google-signin"
```

---

### Task 27: Write failing Jest test for `signInWithGoogle`

- [ ] **Step 1: Append to `mobile/tests/socialAuth.test.ts`**

Add to the existing file:

```typescript
import { signInWithGoogle } from '../src/lib/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

const mockedGoogle = GoogleSignin as jest.Mocked<typeof GoogleSignin>;

describe('signInWithGoogle', () => {
  it('passes the Google id token to supabase.auth.signInWithIdToken', async () => {
    mockedGoogle.signIn.mockResolvedValue({ data: { idToken: 'google-id-token-xyz' } } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: null } as any);

    await signInWithGoogle();

    expect(mockedAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-id-token-xyz',
    });
  });

  it('throws when Google returns no id token', async () => {
    mockedGoogle.signIn.mockResolvedValue({ data: { idToken: null } } as any);
    await expect(signInWithGoogle()).rejects.toThrow(/identity token/i);
  });

  it('throws when supabase returns an error', async () => {
    mockedGoogle.signIn.mockResolvedValue({ data: { idToken: 'tok' } } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'invalid' } } as any);
    await expect(signInWithGoogle()).rejects.toThrow('invalid');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd mobile
npm test -- socialAuth
```

Expected: `signInWithGoogle is not a function`.

- [ ] **Step 3: Commit**

```bash
git add mobile/tests/socialAuth.test.ts
git commit -m "test(mobile): failing tests for signInWithGoogle"
```

---

### Task 28: Implement `signInWithGoogle` in `auth.ts`

- [ ] **Step 1: Modify `mobile/src/lib/auth.ts`**

Add imports + configure call at the top (after existing imports):

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});
```

Append the new function:

```typescript
export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken;
  if (!idToken) {
    throw new Error('No identity token from Google');
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Run tests**

```bash
cd mobile
npm test -- socialAuth
```

Expected: all 6 socialAuth tests pass (3 Apple + 3 Google).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/auth.ts
git commit -m "feat(mobile): signInWithGoogle using native SDK + id token flow"
```

---

### Task 29: Add Google button to `SocialAuthRow`

- [ ] **Step 1: Modify `mobile/src/components/SocialAuthRow.tsx`**

Replace the existing file contents:

```tsx
import { Platform, View, Text, Pressable, StyleSheet, Alert, Image } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInWithGoogle } from '../lib/auth';

export function SocialAuthRow() {
  const googleConfigured =
    !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
    !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  async function onApplePress() {
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('canceled')) return;
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

  async function onGooglePress() {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const msg = e?.message ?? '';
      const code = e?.code ?? '';
      if (code === 'SIGN_IN_CANCELLED' || msg.includes('cancelled')) return;
      if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        Alert.alert('Sign-in failed', 'Google sign-in requires Google Play services.');
        return;
      }
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

  const hasAnySocial = Platform.OS === 'ios' || googleConfigured;

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleBtn}
          onPress={onApplePress}
        />
      )}
      {googleConfigured && (
        <Pressable onPress={onGooglePress} style={styles.googleBtn}>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>
      )}
      {hasAnySocial && (
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>or</Text>
          <View style={styles.line} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12, marginBottom: 12 },
  appleBtn: { height: 48 },
  googleBtn: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleText: { fontSize: 16, color: '#1f2937', fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  or: { color: '#6b7280', fontSize: 13 },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/SocialAuthRow.tsx
git commit -m "feat(mobile): SocialAuthRow — add Google sign-in button (env-gated)"
```

---

### Task 30: Set Google client ID env vars (local + EAS Secrets)

- [ ] **Step 1: Update `mobile/.env` (local dev)**

Edit the gitignored `mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-client-id-from-task-25>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id-from-task-25>
```

- [ ] **Step 2: Set the two new EAS Secrets**

```bash
cd mobile
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "<ios-client-id>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "<web-client-id>"
```

- [ ] **Step 3: Verify EAS Secrets**

```bash
eas secret:list
```

Expected: 4 secrets total at project scope.

No git commit.

---

### Task 31: EAS preview build and end-to-end test Google sign-in

- [ ] **Step 1: Build preview for both platforms**

```bash
cd mobile
eas build --profile preview --platform all
```

Two parallel builds, ~15 minutes each.

- [ ] **Step 2: Test Google sign-in on iOS**

Install the iOS preview build via TestFlight or EAS install URL. Tap "Continue with Google" → complete the Google sheet → land on family-creation. Verify in Supabase Dashboard → Authentication → Users that a new row with provider `google` exists.

- [ ] **Step 3: Test Google sign-in on Android**

Install the Android preview APK on a real Android device with Google Play services. Tap "Continue with Google" → complete the sheet → land on family-creation. Verify in Supabase Dashboard same as Step 2.

- [ ] **Step 4: Clean up**

Delete the Google test accounts via Settings → Delete account on each device.

No git commit.

---

## Phase 6 — iOS push (APNs)

### Task 32: Generate APNs key and upload to Expo

External, gated by Task 1.

- [ ] **Step 1: Generate APNs Authentication Key (.p8)**

Apple Developer Portal → Certificates, Identifiers & Profiles → Keys → `+`:
- Key name: `Shores APNs`
- Check "Apple Push Notifications service (APNs)"
- Configure: leave defaults (all environments)
- Continue → Register → **download .p8** (one-time)

Record Key ID and store the .p8 file in 1Password as `Shores / Apple / APNs Key .p8`.

- [ ] **Step 2: Upload to Expo via EAS CLI**

```bash
cd mobile
eas credentials --platform ios
```

Select:
- Profile: `production`
- "Push Notifications: Manage your Apple Push Notifications Key" → "Set up a Push Key for your project"
- Upload .p8 → paste Key ID + Team ID

EAS stores the key server-side. Now when Expo's push gateway delivers to iOS device tokens from Shores builds, it has valid APNs credentials.

No git commit — external state.

---

### Task 33: EAS preview build and end-to-end test iOS push

- [ ] **Step 1: Trigger a new preview build for iOS**

```bash
cd mobile
eas build --profile preview --platform ios
```

The build needs to be **new** (after APNs key upload) so the device token + credential pairing is fresh in Expo's gateway.

- [ ] **Step 2: Install on iOS device**

Via TestFlight or EAS install URL.

- [ ] **Step 3: Test push end-to-end**

1. On iOS device, sign in (any provider) → create family → create a chore with `approval` verification mode → assign to a new kid.
2. Background the app (do not close).
3. On a second device (or browser) signed in as the same parent, switch to kid mode → tap Done on the chore (this triggers parent notification per M5 push triggers).
4. Wait up to 15 seconds.
5. Push notification should arrive on the iOS device's lock screen.

If push does not arrive, run through the diagnostic chain in spec §3.4:
- Check `profiles.push_token` for the iOS user in cloud DB.
- Check `net._http_response` for recent rows.
- Check `send_push` Edge Function logs.
- Look for `InvalidCredentials` or `DeviceNotRegistered` in Expo's API response in those logs.

- [ ] **Step 4: Clean up**

Delete test accounts.

No git commit.

---

## Phase 7 — Final acceptance and ship

### Task 34: Run full manual acceptance checklist

This is spec §5.2. Run end-to-end against fresh installs on real devices.

- [ ] **Step 1: Build fresh preview for both platforms**

```bash
cd mobile
eas build --profile preview --platform all
```

- [ ] **Step 2: Install on one iOS device and one Android device**

Use TestFlight + Play Internal Testing (preferred) or EAS install URLs.

- [ ] **Step 3: iOS device — Sign in with Apple full loop**

1. Tap "Sign in with Apple" → complete Apple sheet.
2. Create family "iOS Apple Test" → add kid → create chore with approval mode.
3. Background app.
4. Switch to kid avatar → tap Done.
5. Confirm push arrives on parent device (iOS).

- [ ] **Step 4: Android device — Sign in with Google full loop**

Same flow as Step 3 but via Google sign-in. Push arrives on Android device.

- [ ] **Step 5: iOS device — email/password full loop**

Sign up with email/password → create family → repeat the chore loop. Confirms email/password still works alongside social providers.

- [ ] **Step 6: Single-parent deletion**

On the iOS device's account from Step 3: Settings → Delete account → type DELETE → confirm. Land on login screen. Try to re-log in with same Apple ID — succeeds (new family flow, prior data gone).

- [ ] **Step 7: Two-parent deletion**

1. Parent A (iOS) creates family, generates co-parent invite.
2. Parent B (Android, via email/password) accepts invite.
3. Parent A → Settings → Delete account → confirm.
4. Parent B opens app → family + kids + chores intact.

- [ ] **Step 8: Record outcomes**

In a scratch document, record: each step's pass/fail, screenshots of push notifications, screenshots of post-delete state.

No git commit.

---

### Task 35: Cloud recovery simulation

Spec §5.3 — proves no undocumented manual cloud config exists.

- [ ] **Step 1: Snapshot cloud project state**

Dashboard → Database → Backups. Note the current latest backup timestamp.

- [ ] **Step 2: Drop all data (preserving migrations)**

Run in Dashboard SQL Editor:

```sql
-- Truncate user-facing tables; preserve schema_migrations
truncate table public.families cascade;
truncate table auth.users cascade;
delete from storage.objects where bucket_id = 'chore-proofs';
```

- [ ] **Step 3: Re-apply migrations idempotently**

```bash
supabase db push
```

Expected: "No new migrations to apply" — schema_migrations is intact.

- [ ] **Step 4: Re-deploy edge function**

```bash
supabase functions deploy send_push --no-verify-jwt
```

- [ ] **Step 5: Re-run Task 34 acceptance**

Repeat all of Task 34's manual flow against the now-truncated project. If any step fails, identify the missing manual config and either (a) add it to the spec, or (b) write a new migration that captures it.

- [ ] **Step 6: Restore from backup if cleanup is needed**

If Step 2 needs to be undone (e.g., other testers were using the project), restore from the Step 1 backup via Dashboard.

No git commit unless missing config was captured into a new migration.

---

### Task 36: Tag, merge, update memory

- [ ] **Step 1: Verify branch state**

```bash
git status
git log --oneline main..HEAD
```

Expected: clean working tree, commits since `e3e688c` (M6 follow-up tip of main) all on `m7-prelaunch`.

- [ ] **Step 2: Tag the milestone**

```bash
git tag -a m7-prelaunch -m "M7 — pre-launch foundations: cloud Supabase, account deletion, SIWA, Google sign-in, APNs"
```

- [ ] **Step 3: Merge to main**

```bash
git checkout main
git merge --ff-only m7-prelaunch
```

If fast-forward fails, investigate — main shouldn't have advanced.

- [ ] **Step 4: Push**

```bash
git push origin main
git push origin m7-prelaunch
```

- [ ] **Step 5: Update memory**

Create `C:\Users\USUARIO\.claude\projects\C--Users-USUARIO-Desktop-Shores\memory\m7_progress.md`:

```markdown
---
name: M7 pre-launch progress
description: M7 pre-launch foundations complete and tagged 2026-05-11. Records what shipped, contingencies used, deferrals.
type: project
---
M7 complete on branch `m7-prelaunch`, tagged `m7-prelaunch`. Spec: `docs/superpowers/specs/2026-05-11-m7-prelaunch-design.md`. Plan: `docs/superpowers/plans/2026-05-11-m7-prelaunch.md`.

**Why:** Closes the gap between feature-complete local prototype and App Store submittable build. Five workstreams: cloud Supabase migration, account deletion, Sign in with Apple, Sign in with Google, iOS push via APNs.

**How to apply:**
- Cloud Supabase: single prod project at `<project-ref>.supabase.co`. EAS Secrets hold all `EXPO_PUBLIC_*` cloud values; `mobile/.env` is local-dev only.
- Account deletion: hard delete, family cascade on last parent. RPC `public.delete_account()` lives in `20260511000015_delete_account_rpc.sql`. (If contingency used: Edge Function path documented in Task 15 Step 4.)
- Auth providers: each provider = its own user, no linking. Apple private-relay emails accepted as-is.
- iOS push: APNs .p8 uploaded to Expo via `eas credentials`. No mobile code changes from M5.
- M8 starts with: leaderboard, family co-op goals, streak-milestone pushes, quiet hours, Sentry, push retry queue, M2 dev-infra carry-overs, M1 pin_hash typing, real CC0 sound assets, App Store metadata + submission.
```

Update `C:\Users\USUARIO\.claude\projects\C--Users-USUARIO-Desktop-Shores\memory\MEMORY.md` index — append:

```
- [M7 pre-launch progress](m7_progress.md) — M7 complete and tagged 2026-05-11; ready for App Store submission (metadata still M8); M8 starts with engagement + reliability
```

No git commit needed for memory updates — they live outside the repo.

---

## Done.

Total tasks: 36. External-only tasks (1, 2, 3, 5, 10, 11, 20, 25, 32): 9. Code/test/commit tasks: 27.

Critical-path estimate (excluding Apple Dev review wait): ~3–5 dev days plus ~2 hours of external configuration. Apple Dev enrollment adds 1–2 calendar days of waiting that overlaps with Phase 1–3 work.
