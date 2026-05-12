# M7 — Pre-launch Foundations Design Spec

**Date:** 2026-05-11
**Status:** Draft (pending user review)
**Author:** Brainstorm session
**Milestone scope:** App Store submission blockers only

---

## 1. Overview

M7 closes the gap between "feature-complete local prototype" and "Apple/Google review submittable build." It addresses the five remaining App Store submission blockers and nothing else. Engagement features (leaderboard, family co-op goals, streak-milestone pushes, quiet hours), reliability hardening (Sentry, push retry queue, dev-infra carry-overs), and post-launch polish are explicitly deferred to M8+.

### 1.1 Workstreams

1. **Cloud Supabase project** — migrate from local-only to a single production Supabase cloud project. Foundation for everything else.
2. **Account deletion** — in-app account deletion required by Apple Guideline 5.1.1(v). Hard delete; cascades family data if last parent.
3. **Sign In with Apple** — required by Apple Guideline 4.8 if any social login is offered.
4. **Sign In with Google** — native SDK integration on iOS + Android.
5. **iOS push via APNs** — upload APNs .p8 key to Expo so iOS device push registration actually delivers notifications.

### 1.2 Exit criteria

Milestone is complete when both of these are true:

1. Two physical devices (one iOS, one Android) run a fresh EAS preview build pointed at cloud Supabase, sign in via all available providers, complete the full chore loop end-to-end, receive push notifications on chore approval, and successfully delete their accounts.
2. The cloud Supabase project survives a recovery simulation: drop and re-apply all migrations + re-deploy edge function → step 1 still works. This validates that no cloud-only manual configuration is left undocumented.

Reaching this state means submission is *possible* — it does **not** mean submission happens at the end of M7. App Store metadata, screenshots, privacy nutrition labels, and reviewer notes are M8 submission work, not milestone scope.

### 1.3 Out of scope (deferred to M8+)

- Engagement: leaderboard, family co-op goals, streak-milestone pushes, quiet hours
- Reliability: Sentry, push retry queue, M2 dev-infra carry-overs (cron idempotency, RPC type quirks, gen-types stdout, FK alias verification), M1 `pin_hash` typing
- Polish: replacing placeholder sound assets (M6 carry-over)
- Staging Supabase environment
- OAuth identity linking (each provider = its own user)
- Soft-delete grace period for account deletion
- App Store / Play Store metadata
- Subscription / paywall

---

## 2. Architecture

Four of the five workstreams are configuration and credential plumbing, not new logic. The only "build a feature" workstream is account deletion. This shapes the spec — workstream sections vary in depth accordingly.

### 2.1 File change surface

| Type | Files |
|---|---|
| New SQL migration | `supabase/migrations/<timestamp>_delete_account_rpc.sql` |
| New SQL test | `supabase/tests/delete_account.test.sql` |
| New mobile file | `mobile/src/components/SocialAuthRow.tsx` |
| New repo file | `mobile/eas.json` |
| New gitignored env file | `mobile/.env` (local dev only) |
| New committed env example | `mobile/.env.example` |
| Modified | `mobile/src/lib/auth.ts` (add `signInWithApple`, `signInWithGoogle`) |
| Modified | `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/signup.tsx` (mount `SocialAuthRow`) |
| Modified | `mobile/app/(app)/parent/settings.tsx` (Account section + delete modal) |
| Modified | `mobile/app.json` (add `expo-apple-authentication` plugin, Google sign-in plugin config) |

External configuration (no repo files, recorded in 1Password / private notes):
- Apple Developer Program enrollment + Services ID + APNs .p8 key
- Google Cloud Console project + 3 OAuth client IDs (web/iOS/Android)
- Supabase cloud project + service_role key + anon key
- EAS account credentials

### 2.2 Auth identity model

Each OAuth provider creates its own `auth.users` row. No linking between providers, no merging on email match. If a user signs up with email/password and later uses Sign in with Apple, they end up with two separate accounts. Pre-launch with no users, this is acceptable; documentation in the auth UI reads "use the same sign-in method each time."

Apple private-relay emails (`@privaterelay.appleid.com`) are accepted as-is into `auth.users.email`. They do not trigger any special handling.

### 2.3 Account deletion model

Hard delete with family cascade on last-parent removal. Three cases:

| Scenario | Effect |
|---|---|
| Parent has no family (mid-onboarding edge case) | Delete `auth.users` row only |
| Parent has co-parent(s) in family | Delete only this profile + push token; family + kids + chores intact |
| Parent is last parent | Delete `families` row → all family-scoped data cascades via existing `ON DELETE CASCADE` FKs → then delete `auth.users` row |

The existing FK structure on `families` already supports this — no new schema is needed. All family-scoped tables (`profiles`, `chores`, `chore_instances`, `rewards`, `redemptions`, `star_ledger`, `streaks`, `achievements`, `family_invites`) reference `families.id ON DELETE CASCADE`.

### 2.4 Environment configuration

Mobile reads four `EXPO_PUBLIC_*` env vars at build time: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`. All four are "public" in the sense that they ship in the app bundle anyway — but we keep them out of git for two reasons: (1) the cloud Supabase URL shouldn't be discoverable from a public repo, and (2) we follow the production-grade pattern even pre-launch so we don't have to retrofit later.

**Local dev:**
- `mobile/.env` (gitignored — `.env` is already covered by root `.gitignore`) holds local Supabase URL + local anon key. Google client IDs may be empty in local; the social auth row gracefully disables the Google button when the env vars are unset.
- `mobile/.env.example` (committed) documents the four keys with empty values.

**EAS Build profiles** (defined in new `mobile/eas.json`):
- `development` — dev-client build; env from `.env`.
- `preview` — internal distribution (TestFlight internal track + Play internal testing); env injected from **EAS Secrets** (`eas secret:create EXPO_PUBLIC_SUPABASE_URL --value ...`, etc.).
- `production` — store-distribution build; same EAS Secrets as `preview`, different signing artifacts.

This means `eas.json` itself contains profile structure and references but no secret values. Cloud Supabase URL and anon key live only in EAS Secrets + 1Password.

### 2.5 Push notification pipeline

No code changes. The existing pipeline (set_push_token RPC → profiles.push_token → Postgres triggers → pg_net → send_push Edge Function → Expo Push API → APNs/FCM) is already implemented and works on Android. M7 adds the missing APNs credential at the Expo side so the same code path delivers to iOS.

---

## 3. Workstream details

### 3.1 Cloud Supabase migration

Foundation for the other workstreams. Lands first.

**Setup steps (manual via Supabase dashboard + CLI):**

1. Create project at supabase.com. Free tier, region closest to user.
2. Record `project ref`, `anon key`, `service_role key` in 1Password.
3. Enable extensions via Dashboard → Database → Extensions: `pg_cron`, `pg_net`. **This must happen before migrations are applied** — the cron migration calls `cron.schedule(...)`, which fails if `pg_cron` isn't installed yet.
4. Set deploy-time configuration via Dashboard → Settings → Database → Custom Postgres Config:
   - `app.settings.functions_base_url` = `https://<project-ref>.supabase.co/functions/v1`
   - `app.settings.service_role_key` = `<service_role_key>`

   This route is used (not direct psql `ALTER DATABASE`) because cloud Supabase locks down those privileges from the `postgres` role. Setting these before migrations isn't required for migrations themselves, but it is required before the push triggers (added in M5) will function without no-op'ing.
5. Link local CLI: `supabase link --project-ref <ref>`.
6. Apply migrations: `supabase db push`. Runs all 44+ migrations in order.
7. Deploy edge function: `supabase functions deploy send_push --no-verify-jwt`. The `--no-verify-jwt` flag is required because the function is invoked by pg_net from triggers, not by an authenticated client.

**Verification before moving to the next workstream:**

- `select tablename from pg_publication_tables where pubname = 'supabase_realtime';` returns the four expected tables.
- `select extname from pg_extension where extname in ('pg_cron','pg_net');` returns both rows.
- `select proname from pg_proc where pronamespace = 'public'::regnamespace;` returns all expected RPCs (create_family, create_kid_profile, create_chore, complete_chore, approve_chore, reject_chore, etc., plus the new `delete_account`).
- Throwaway local Expo build pointed at cloud completes signup → family creation → chore creation → real-time chore update. This catches forgotten migrations before any auth provider work layers on top.

**Mobile env wiring:**

- `mobile/.env.example` (committed):
  ```
  EXPO_PUBLIC_SUPABASE_URL=
  EXPO_PUBLIC_SUPABASE_ANON_KEY=
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
  ```
- `mobile/.env` (gitignored): local Supabase URL + local anon key. Google client IDs may be left empty for local; the social auth row disables the Google button when those env vars are empty strings.
- Cloud values for `preview` / `production` EAS profiles are set as **EAS Secrets** via `eas secret:create` and referenced in `eas.json`. No cloud values land in git.

### 3.2 Account deletion

The only workstream that builds new feature code.

**SQL migration (`<timestamp>_delete_account_rpc.sql`):**

```sql
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id    uuid := auth.uid();
  v_family_id  uuid;
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

**pgTAP test (`supabase/tests/delete_account.test.sql`):**

Three scenarios:
1. Single-parent family → call RPC → family + kids + chores + ledger + push_token + auth.users row all gone.
2. Two-parent family → first parent calls RPC → family remains, second parent's profile + push_token intact, first parent's auth.users row gone.
3. Unauthenticated call → raises with SQLSTATE 28000.

**Mobile UI (`mobile/app/(app)/parent/settings.tsx`):**

New section between Feedback and the Switch profile / Sign out buttons:

```
ACCOUNT
[Delete account]    ← danger style, red text
```

Tap opens a modal:

```
Delete your account?

This permanently deletes your account and all
your data. If you're the last parent in this family,
the family, your kids' profiles, all chores, rewards,
and history will be deleted too. This cannot be undone.

Type DELETE to confirm:
[____________]

[Cancel]   [Delete forever]
```

The "Delete forever" button is disabled until the input matches the literal string `DELETE` (case-sensitive, exact match — no trim, no case-folding). Tap calls `supabase.rpc('delete_account')`. On success: `signOut()` + `router.replace('/(auth)/login')`. On error: surface message in modal. Loading spinner on button until RPC returns.

**Privilege contingency:** `delete from auth.users` in a security-definer RPC works in current Supabase because the function owner has `supabase_admin`-equivalent grants on `auth.users` by default. If a future Supabase update tightens this, the fallback is a `delete-account` Edge Function that calls `supabase.auth.admin.deleteUser()` with the service_role key. The implementer tries the RPC path first; if pgTAP cloud verification fails specifically on the `delete from auth.users` line, switch to the Edge Function path.

### 3.3 Auth providers (Apple + Google)

Bundled because they share screen layout work and a new helper component. Platform-specific guts are different.

#### 3.3.1 Sign In with Apple

**External setup (Apple Developer Portal):**
- Enable "Sign in with Apple" capability for `com.shores.app` app ID.
- Create a **Services ID** — this is the OAuth client ID Supabase uses.
- Generate a **Sign in with Apple key** (.p8) with team ID + key ID.
- Upload Services ID + .p8 + team ID + key ID to Supabase Dashboard → Authentication → Providers → Apple.

**Install:**
```
npx expo install expo-apple-authentication
```
Add `"expo-apple-authentication"` to `mobile/app.json` `plugins` array.

**`mobile/src/lib/auth.ts` addition:**

```typescript
import * as AppleAuthentication from 'expo-apple-authentication';

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
  });
  if (!credential.identityToken) throw new Error('No identity token from Apple');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

**Button rendering:** `<AppleAuthentication.AppleAuthenticationButton>` (Apple requires their styled button for SIWA). Rendered only when `Platform.OS === 'ios'`.

#### 3.3.2 Sign In with Google

**External setup (Google Cloud Console):**
- Create OAuth 2.0 client IDs:
  - **Web** client ID — this is the audience for Supabase. Configure with Supabase's `https://<project-ref>.supabase.co/auth/v1/callback` redirect URI.
  - **iOS** client ID — bundle identifier `com.shores.app`. URL scheme is the reversed-DNS form of this client ID.
  - **Android** client ID — package `com.shores.app`, SHA-1 fingerprint from the EAS keystore (`eas credentials` reveals it after first build).
- Upload Web client ID + secret to Supabase Dashboard → Authentication → Providers → Google.

**Install:**
```
npx expo install @react-native-google-signin/google-signin
```
Add the plugin config to `mobile/app.json`:
```json
{
  "plugins": [
    [
      "@react-native-google-signin/google-signin",
      { "iosUrlScheme": "<reversed-dns-of-ios-client-id>" }
    ]
  ]
}
```

**`mobile/src/lib/auth.ts` addition:**

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken;
  if (!idToken) throw new Error('No identity token from Google');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

**Button rendering:** Custom-styled button matching Google's brand guidelines (logo + "Continue with Google" label). Rendered on both iOS and Android.

#### 3.3.3 Shared screen changes

Extract a `mobile/src/components/SocialAuthRow.tsx` component:

```
[ 🍎 Sign in with Apple ]    ← iOS only
[ G   Sign in with Google ]
─────────  or  ─────────
```

Mount in both `mobile/app/(auth)/login.tsx` and `mobile/app/(auth)/signup.tsx` above the email field.

**Error handling:**
- Apple user-cancel (`ERR_REQUEST_CANCELED`) → silently dismiss.
- Google user-cancel (`statusCodes.SIGN_IN_CANCELLED`) → silently dismiss.
- Google `PLAY_SERVICES_NOT_AVAILABLE` → "Google sign-in requires Google Play services."
- Network error → inline error message under the social row.
- Provider returns no identity token → "Sign-in failed, try again."

**Jest tests (`mobile/src/lib/__tests__/auth.test.ts`):**
- Mock `expo-apple-authentication` and `@react-native-google-signin/google-signin`.
- `signInWithApple` calls `supabase.auth.signInWithIdToken` with `{ provider: 'apple', token: <mock> }`.
- `signInWithGoogle` calls `supabase.auth.signInWithIdToken` with `{ provider: 'google', token: <mock> }`.
- User-cancel paths don't propagate as caller-visible errors.

Screens are not unit tested — they are integration-verified on the EAS dev build.

### 3.4 iOS push (APNs)

**External setup (Apple Developer Portal + Expo):**

1. Generate APNs Authentication Key (.p8) in Apple Developer Portal → Certificates, Identifiers & Profiles → Keys → New Key → check "Apple Push Notifications service (APNs)" → download (one-time only, store in 1Password). Record Key ID + Team ID.
2. Run `eas credentials` from `mobile/`. Select iOS → Push Notifications → upload .p8 + paste Key ID + Team ID.

**Code changes:** none. The M5 push pipeline (notifications.ts → set_push_token RPC → triggers → send_push edge function → Expo Push API) is unchanged. The only difference is that Expo's gateway now has APNs credentials, so iOS device tokens are deliverable instead of dropped.

**Verification:** Install a TestFlight build on a real iOS device, sign in, create a chore-with-approval, have a kid mark Done, confirm push arrives on the parent's lock screen.

**Diagnostic chain if push fails on iOS after APNs upload:**

1. `profiles.push_token` populated for the iOS user? (Expo push tokens look like `ExponentPushToken[...]`.)
2. Postgres trigger fired? (Add temporary `raise notice` in trigger, or check `net._http_response` table.)
3. pg_net posted? (Query `net._http_response` for status codes against the function URL.)
4. `send_push` invoked? (Edge Function logs in Supabase Dashboard.)
5. Expo accepted the push? (Edge Function logs include the Expo API response — look for `DeviceNotRegistered`, `InvalidCredentials`, or `MessageRateExceeded`.)

Layers 1-4 are M5 territory and proven on Android. Layer 5 is the only new failure surface in M7 — and the symptom there is a specific error string in the Expo response.

---

## 4. Sequencing and dependencies

### 4.1 Day 0 — kick off slow async work

1. Submit Apple Developer Program enrollment (individual account: ~24h review).
2. Create Google Cloud Console project (instant; OAuth client IDs are created per-platform later as keystores become available).

These run in the background while active engineering work proceeds.

### 4.2 Active path

```
1. Cloud Supabase project + migrations
   │  gate: throwaway build hits cloud OK
   ▼
2. EAS configuration (eas.json, first dev build via EAS)
   │  gate: dev build installs and runs against cloud
   ▼
3. Account deletion
   │  gate: pgTAP green + manual deletion E2E
   ▼
4. Sign in with Apple    (after Apple Dev cleared, .p8 generated, Services ID created)
   ▼
5. Sign in with Google   (after EAS first build, SHA-1 known, OAuth clients created)
   ▼
6. iOS push (APNs)       (after Apple Dev + .p8 uploaded via eas credentials)
   ▼
7. TestFlight + Play internal-track build
   │  gate: acceptance checklist (Section 5.2)
   ▼
DONE
```

### 4.3 Dependency matrix

| Workstream | External deps | Repo deps |
|---|---|---|
| Cloud Supabase | Supabase free-tier account | — |
| EAS config | EAS account, cloud Supabase | Cloud Supabase done |
| Account deletion | Cloud Supabase (for verification) | Cloud Supabase done |
| Sign in with Apple | Apple Dev enrollment, Services ID, .p8 | EAS dev build, cloud Supabase done |
| Sign in with Google | Google OAuth clients (web/iOS/Android), Play SHA-1 | EAS dev build (Android SHA-1), cloud Supabase done |
| iOS push | Apple Dev, APNs .p8 uploaded to Expo | EAS dev build, cloud Supabase done |

### 4.4 Parallelism we are not pursuing

We do not interleave cloud-migration and auth-provider work. Cloud-first then auth-on-top is linear and easy to reason about. Pre-launch, the parallelism gain isn't worth the integration risk.

---

## 5. Testing and acceptance

### 5.1 Automated test coverage

| Workstream | Test type | Coverage |
|---|---|---|
| Account deletion | pgTAP | single-parent cascade, multi-parent removal, unauthenticated rejection |
| Account deletion | Jest | modal state machine: typed confirmation enables button, RPC error surfaces, post-success navigates to login |
| SIWA / Google | Jest | `signInWithApple` / `signInWithGoogle` call `supabase.auth.signInWithIdToken` with correct args; user-cancel doesn't throw |
| Cloud Supabase | none | verified by 5.2 smoke test |
| iOS push | none | verified end-to-end on device |

### 5.2 Manual acceptance checklist (runs against cloud after each workstream)

1. Fresh `eas build --profile preview` installed on one iOS and one Android device.
2. iOS device: Sign in with Apple → create family → create kid → create chore with approval → background app → kid marks Done → push arrives on parent lock screen.
3. Android device: Sign in with Google → repeat (2).
4. iOS device: email/password signup → repeat (2).
5. Settings → Delete account → typed confirmation → lands on login screen → re-sign-up with same email → confirm no leftover family/chores/kids/push_tokens.
6. Two-parent scenario: parent A invites parent B (M5 invite flow) → parent B accepts → parent A deletes account → parent B still in app with family + kids + chores intact.

### 5.3 Recovery verification

The cloud project must survive a full "fresh init" simulation:

1. Drop and re-apply all migrations against cloud.
2. Re-deploy `send_push` edge function.
3. Re-run section 5.2 acceptance checklist.

This catches any cloud-only manual configuration left undocumented. If anything breaks, the missing step is added to the spec / plan documentation, not to in-line knowledge.

---

## 6. Edge cases

- **Apple private-relay emails** land in `auth.users.email` unchanged. No special handling; family creation works as normal.
- **Apple "Hide my email" + existing email/password collision** — the user gets two separate accounts. Per the no-linking decision, this is accepted behavior.
- **Google sign-in on a device without Play services** — `GoogleSignin.hasPlayServices()` throws. Caller surfaces a clear error.
- **Last-parent deletion race** — two parents both call `delete_account()` concurrently. Both check `count(*) of other parents`. The RPC's count + delete runs in a single statement-level transaction; row-locking ensures the second caller observes the first's effect or fails the row-not-found check. Worst case is one of them returns an error; the other succeeds.
- **`delete from auth.users` privilege on cloud** — works today via security-definer ownership. If a future Supabase update tightens grants, fallback is a service_role Edge Function. Implementer tries the RPC path first; switches only if cloud pgTAP fails specifically on that line.
- **APNs sandbox vs production environment** — Expo Push API auto-routes; no config required. TestFlight and dev-builds both use the production APNs environment.
- **Cloud `app.settings.*` persistence** — some users have reported these settings not persisting through Supabase maintenance windows. Mitigation: re-set via dashboard if push triggers silently no-op in prod. Document the symptom and fix in M7 progress notes for future reference.

---

## 7. Decision log

Decisions made during brainstorming, captured here so the implementation plan doesn't relitigate them:

| # | Decision | Alternative considered | Why |
|---|---|---|---|
| 1 | M7 scope = App Store blockers only | Bundle reliability + dev-infra carry-overs | Reliability changes touch enough surface that bundling makes the milestone hard to verify end-to-end |
| 2 | Single production cloud Supabase env | Staging + production | Pre-launch, staging is a second thing to maintain with no traffic to justify it |
| 3 | Hard delete with family cascade on last-parent | Soft delete with 30-day grace period | No real users to recover; Apple reviewers prefer immediate hard delete |
| 4 | No OAuth identity linking | Link providers when email matches | No users to confuse; linking is additive post-launch if needed |
| 5 | Native Google SDK | Browser-based expo-auth-session | Production-grade UX; EAS dev build is already required for push anyway |
| 6 | Cloud-first then auth-on-top sequencing | Layer-by-layer (all DB → all UI → all infra) | Linear path; integration risk concentrated late in B-style ordering |

---

## 8. References

- Apple Guideline 4.8 (Sign in with Apple): https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple
- Apple Guideline 5.1.1(v) (Account deletion): https://developer.apple.com/app-store/review/guidelines/#5.1.1
- Supabase Auth with id tokens: https://supabase.com/docs/guides/auth/social-login
- Expo `expo-apple-authentication`: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- `@react-native-google-signin/google-signin`: https://react-native-google-signin.github.io/docs/install
- EAS Build config: https://docs.expo.dev/build/eas-json/

---

**End of spec.**
