# Android Internal Launch + Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HomeSquad to the Play Store internal testing track with Google sign-in working end-to-end against cloud Supabase, while keeping email/password sign-in as a fallback.

**Architecture:** Two sequential phases with a hard verification gate between them. Phase 1 = code rename to `com.homesquad.app` + OAuth credentials + Supabase cloud wiring + a preview-build smoke test on the Pixel-7-API-34 emulator. Phase 2 = Play Console setup + listing assets + Data safety form + production AAB upload to the internal track + real-device smoke via the Play Store install link.

**Tech Stack:** Expo SDK 54 · React Native 0.81 · `@react-native-google-signin/google-signin` v16 · Supabase (cloud) · EAS Build · Google Cloud Console (OAuth) · Google Play Console (internal testing) · GitHub Pages (privacy policy)

**Spec reference:** `docs/superpowers/specs/2026-05-25-android-google-signin-internal-launch-design.md`

---

## File Structure

This milestone is mostly configuration. Only three repo files change as code:

```
mobile/
├── app.json                   # MODIFY: package name, bundle id, scheme, version
├── eas.json                   # MODIFY (small): verify production builds AAB; no change expected
└── src/lib/auth.ts            # MODIFY: redirectTo scheme

docs/
├── privacy-policy.md          # CREATE: source of truth for privacy text
├── privacy-policy.html        # CREATE: rendered, served by GitHub Pages
└── superpowers/
    └── plans/                 # this file lives here

mobile/assets/
├── icon.png                   # VERIFY (modify if needed): 512x512, HomeSquad brand
├── play-store-feature-graphic.png    # CREATE: 1024x500
└── play-store-screenshots/    # CREATE: 5 captured screenshots
    ├── 01-welcome.png
    ├── 02-signup.png
    ├── 03-parent-home.png
    ├── 04-approval.png
    └── 05-celebration.png
```

External systems (no repo file representation):
- Google Cloud Console — OAuth consent screen, Web client, Android client
- Supabase cloud project — Google provider config, redirect URLs, migrations applied
- EAS — Android keystore, project secrets, build profiles
- Google Play Console — app listing, Data safety, content rating, internal track release

---

## Task 1: Rename code identifiers from `shores` → `homesquad`

**Files:**
- Modify: `mobile/app.json`
- Modify: `mobile/src/lib/auth.ts:35`
- Modify: `mobile/.env.local` (gitignored)
- Verify: `mobile/eas.json`

**Why:** Package name is permanent once published. Per spec Section 2, we rename `com.shores.app` → `com.homesquad.app`, `shores://` → `homesquad://`, and bump version 0.1.0 → 0.1.1 before any Play Store work.

- [ ] **Step 1: Grep-check the rename surface area**

Run from `C:/Users/USUARIO/Desktop/Shores`:
```
grep -rn "com\.shores\.app\|shores://" mobile/ --exclude-dir=node_modules
```
Expected: exactly two files match — `mobile/app.json` and `mobile/src/lib/auth.ts`.
If anything else matches, surface it before continuing — the spec was written assuming only these two files have the strings.

- [ ] **Step 2: Modify `mobile/app.json`**

Replace these exact values (full file at the top of the spec):

```diff
   "expo": {
     "name": "HomeSquad",
     "slug": "shores",
-    "scheme": "shores",
-    "version": "0.1.0",
+    "scheme": "homesquad",
+    "version": "0.1.1",
     ...
     "ios": {
       "supportsTablet": true,
-      "bundleIdentifier": "com.shores.app",
+      "bundleIdentifier": "com.homesquad.app",
       "usesAppleSignIn": true
     },
     "android": {
-      "package": "com.shores.app",
+      "package": "com.homesquad.app",
       ...
     },
```

Leave `slug` as `shores` (EAS project linkage uses it; renaming the slug breaks the EAS project ID binding) and leave the `iosUrlScheme` placeholder under the google-signin plugin alone (this is iOS-only and not exercised by Android).

- [ ] **Step 3: Modify `mobile/src/lib/auth.ts`**

At line 35:

```diff
 export async function requestPasswordReset(email: string) {
   const { error } = await supabase.auth.resetPasswordForEmail(email, {
-    redirectTo: 'shores://reset-password',
+    redirectTo: 'homesquad://reset-password',
   });
   if (error) throw new Error(error.message);
 }
```

- [ ] **Step 4: Add Google Web client ID env to `mobile/.env.local`**

`.env.local` is gitignored. Append these lines (real value pasted after Task 2 creates the Web client):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

Leave both empty for now. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` gets filled in at the end of Task 2. The IOS one stays empty (gates the Apple button in `SocialAuthRow.tsx:13-14`).

- [ ] **Step 5: Verify `mobile/eas.json` produces AAB for production**

Read the production block. Default Android build type is `app-bundle` (AAB) when `buildType` is not specified. The current production profile has no `android.buildType` override, so no change is needed. Confirm by reading the file — if `android.buildType` appears under `production`, remove it (preview should keep `apk`, production should default to AAB).

- [ ] **Step 6: Re-run the grep to confirm no `shores://` or `com.shores.app` strings remain in `mobile/`**

```
grep -rn "com\.shores\.app\|shores://" mobile/ --exclude-dir=node_modules
```
Expected: zero results.

- [ ] **Step 7: TypeScript compile check**

```
cd mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```
git add mobile/app.json mobile/src/lib/auth.ts
git commit -m "feat(mobile): rename Android package + URI scheme to com.homesquad.app

Prepares the codebase for Play Store internal launch. Package name is
permanent after first publish so we rename before any Console work.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

Do not stage `mobile/.env.local` — it is gitignored.

---

## Task 2: Google Cloud Console — OAuth consent screen + Web client

**External system:** Google Cloud Console. No repo files change.

**Why:** The Web client ID is what Supabase needs to verify Google ID tokens server-side. The OAuth consent screen is the public face of the OAuth flow (app name, support email, scopes).

- [ ] **Step 1: Open or create a Google Cloud project**

Go to https://console.cloud.google.com. Use the existing project (per the user's earlier confirmation that one exists). If multiple projects exist, pick one dedicated to HomeSquad to keep credentials clean.

- [ ] **Step 2: Configure OAuth consent screen**

Navigation: APIs & Services → OAuth consent screen.
- User type: **External**
- App name: `HomeSquad`
- User support email: `sabiondo3101@gmail.com`
- App logo: skip for now (optional)
- App domain: skip
- Developer contact information email: `sabiondo3101@gmail.com`
- Click **Save and Continue**

Scopes screen:
- Click **Add or Remove Scopes**
- Select `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
- Save → **Save and Continue**

Test users screen:
- Add `sabiondo3101@gmail.com` as a test user
- Add 1-2 additional Google accounts you want to use for emulator/device testing (you can edit this list later — Testing mode allows up to 100 test users)
- Save → **Save and Continue**

Summary screen: confirm and exit. Publishing status will remain **Testing** (this is fine — promote to production only after the privacy policy URL is live in Task 11).

- [ ] **Step 3: Create Web OAuth client**

Navigation: APIs & Services → Credentials → **Create Credentials** → **OAuth client ID**.
- Application type: **Web application**
- Name: `HomeSquad Web`
- Authorized JavaScript origins: leave empty
- Authorized redirect URIs: leave empty (Supabase verifies the ID token server-side without a redirect)
- Click **Create**

A modal shows the **Client ID** and **Client Secret**. Copy both to a temporary scratch file — they're needed in Task 5 (Supabase) and Task 7 (EAS secret).

- [ ] **Step 4: Paste the Web Client ID into `.env.local`**

Open `mobile/.env.local` and set:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<paste-client-id>.apps.googleusercontent.com
```

- [ ] **Step 5: Verify**

Run from `C:/Users/USUARIO/Desktop/Shores/mobile`:
```
npx expo start --clear
```
The Metro bundler should boot with no env-related warning. Stop with Ctrl-C (no need to actually run the app yet — keystore not generated).

No commit (no tracked files changed).

---

## Task 3: EAS — generate Android keystore + extract SHA-1

**External system:** EAS credentials store. No repo files change.

**Why:** SHA-1 fingerprint is required to create the Android OAuth client in Task 4. Doing this before the first build means the OAuth client is ready when the first preview build runs.

- [ ] **Step 1: Confirm EAS CLI is authenticated**

```
eas whoami
```
Expected: your EAS username. If `Not logged in`, run `eas login` first.

- [ ] **Step 2: Generate a new Android keystore**

```
cd mobile
eas credentials --platform android
```

Interactive flow:
- Select profile: `production`
- Select "Keystore: Manage everything needed to build your project"
- Select "Set up a new keystore"
- Confirm "Generate new keystore" (EAS creates and stores it remotely)

- [ ] **Step 3: Print the SHA-1 fingerprint**

After keystore creation, EAS prints SHA-1 and SHA-256. If you missed it, re-print:

```
eas credentials --platform android
```
Select `production` → "Keystore" → "Show keystore credentials". EAS displays:
```
SHA-1 Fingerprint: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

Copy the SHA-1 to your scratch file. **This value is permanent** — it identifies your app to Google for as long as you keep this keystore. Losing the keystore means losing the ability to publish updates to the published app, so confirm EAS is storing it (default behavior — see "EAS-managed keystore" in EAS dashboard under Project → Credentials).

- [ ] **Step 4: Verify**

EAS dashboard → your project → Credentials → Android → confirm the keystore is listed with status "EAS-managed". Note the **Keystore alias** value too (useful for debugging signing issues later).

No commit (no tracked files changed).

---

## Task 4: Google Cloud Console — Android OAuth client

**External system:** Google Cloud Console. No repo files change.

**Why:** The Android OAuth client binds your app's package name + signing key to Google's auth servers. Without it, `GoogleSignin.signIn()` returns `DEVELOPER_ERROR` on real builds.

- [ ] **Step 1: Create Android OAuth client**

Navigation: APIs & Services → Credentials → **Create Credentials** → **OAuth client ID**.
- Application type: **Android**
- Name: `HomeSquad Android`
- Package name: `com.homesquad.app`
- SHA-1 certificate fingerprint: paste from Task 3 step 3
- Click **Create**

Android clients do not have a client secret — the (package name, SHA-1) pair is the credential.

- [ ] **Step 2: Verify both clients exist**

Credentials page should now list:
- `HomeSquad Web` (Web application)
- `HomeSquad Android` (Android)

If either is missing, redo the relevant task.

No commit (no tracked files changed).

---

## Task 5: Supabase cloud — enable Google provider + add redirect URL

**External system:** Supabase cloud dashboard. No repo files change.

**Why:** Supabase needs the Google **Web** Client ID + Secret to verify ID tokens returned by `signInWithIdToken({ provider: 'google', token })` in `mobile/src/lib/auth.ts:64`.

- [ ] **Step 1: Enable Google provider**

Supabase dashboard → your cloud project → Authentication → Providers → Google.
- Toggle **Enable Sign in with Google** to ON
- **Client IDs (for OAuth)**: paste the Web Client ID from Task 2 step 3
- **Client Secret (for OAuth)**: paste the Web Client Secret from Task 2 step 3
- **Skip nonce checks**: leave OFF (default — `signInWithIdToken` handles nonce correctly)
- Click **Save**

- [ ] **Step 2: Add redirect URL for password reset deep link**

Supabase dashboard → Authentication → URL Configuration.
- Under **Redirect URLs**, click **Add URL**
- Add `homesquad://reset-password`
- If `shores://reset-password` is present, remove it
- **Site URL**: leave as-is (not used by mobile flows)
- Click **Save changes**

- [ ] **Step 3: Verify**

Reload the Providers page. Google should show "Enabled" with the masked Client ID visible. URL Configuration should list `homesquad://reset-password`.

No commit (no tracked files changed).

---

## Task 6: Supabase cloud — verify migration parity

**External system:** Supabase cloud project. Read-only check.

**Why:** If cloud migrations are behind local, real testers will hit RLS errors or missing-table 404s. Per spec Phase 1 step 7, we explicitly verify parity before building.

- [ ] **Step 1: Confirm Supabase CLI is linked to the cloud project**

```
supabase projects list
```
Expected: your cloud project shows in the list. If `supabase link` has not been run, run:
```
supabase link --project-ref <your-cloud-project-ref>
```
(Find the ref in Supabase dashboard → Project Settings → General → Reference ID.)

- [ ] **Step 2: Dry-run a push to detect drift**

```
supabase db push --linked --dry-run
```
Expected output: `No new migrations to apply`.

- [ ] **Step 3: If migrations are pending, apply them**

If step 2 lists pending migration files:
```
supabase db push --linked
```
Then re-run the dry-run to confirm "No new migrations to apply".

- [ ] **Step 4: Spot-check key tables exist**

Supabase dashboard → Table Editor → confirm these tables are present in `public` schema:
- `families`
- `profiles`
- `chores`
- `chore_instances`
- `approvals`
- `rewards`
- `redemptions`
- `achievements`
- `app.settings` (in the `app` schema, not `public`)

If any are missing, you have a deeper migration issue — stop and resolve before continuing.

No commit (no tracked files changed).

---

## Task 7: EAS — configure project secrets

**External system:** EAS project secrets. No repo files change.

**Why:** `eas.json` references these via `$VAR_NAME` syntax for preview and production builds (`mobile/eas.json:18-22, 30-34`). Without them, EAS builds will fail at the env-substitution step.

- [ ] **Step 1: Set Supabase cloud URL secret**

```
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "<cloud-supabase-url>"
```
Use the URL from Supabase dashboard → Project Settings → API → Project URL. Looks like `https://<ref>.supabase.co`.

If a secret with this name already exists, EAS will refuse. Either delete (`eas secret:delete --name EXPO_PUBLIC_SUPABASE_URL`) and recreate, or use `--force`.

- [ ] **Step 2: Set Supabase anon key secret**

```
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<cloud-anon-key>"
```
Use the `anon` key from Supabase dashboard → Project Settings → API → Project API keys → `anon` `public`.

- [ ] **Step 3: Set Google Web Client ID secret**

```
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "<web-client-id>.apps.googleusercontent.com"
```

- [ ] **Step 4: Set Google iOS Client ID secret to empty**

```
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value ""
```
Empty string is fine — gates the iOS Apple button which is not used on Android.

- [ ] **Step 5: Verify**

```
eas secret:list
```
Expected: all four secrets above appear with `project` scope.

No commit (no tracked files changed).

---

## Task 8: Build preview APK

**External system:** EAS Build cloud. No repo files change.

**Why:** The preview profile builds a signed APK (set `apk` in `mobile/eas.json:24`) for direct emulator install, bypassing the Play Store. This is the artifact for the Phase 1 smoke gate.

- [ ] **Step 1: Trigger the build**

```
cd mobile
eas build --profile preview --platform android
```

The first time, EAS will prompt:
- Confirm project: yes
- Use the existing keystore (from Task 3): yes
- Auto-bump versionCode: yes (auto-increment configured in `eas.json:28`)

Build queues and runs on EAS infrastructure (~10-15 min on free tier).

- [ ] **Step 2: Wait for build completion**

Monitor in terminal output or at https://expo.dev/accounts/<your-username>/projects/shores/builds.

Expected: build status = **finished**. If **failed**, click into the build to view logs. Common issues:
- Missing env secret → re-run Task 7
- Keystore credential issue → re-run Task 3
- TypeScript error → re-run Task 1 step 7

- [ ] **Step 3: Download APK**

From the build detail page, click **Download** to get the signed APK to your local disk. Save to `C:/Users/USUARIO/Desktop/Shores/mobile/builds/homesquad-preview-v0.1.1.apk` (create the `builds/` directory if needed; it should be gitignored — verify it is, add to `mobile/.gitignore` if not).

- [ ] **Step 4: Verify APK signature matches the EAS keystore**

```
keytool -printcert -jarfile mobile/builds/homesquad-preview-v0.1.1.apk
```
Expected: SHA1 fingerprint matches Task 3 step 3. If they differ, the build used a different keystore — sign-in will fail on the smoke test.

No commit (no tracked files changed).

---

## Task 9: Phase 1 → Phase 2 gate — emulator smoke test

**Test environment:** Pixel-7-API-34 Android Studio emulator (same one used for M8 / celebration-replay acceptance).

**Why:** Binary gate. All 8 items must pass before any Phase 2 (Play Console) work begins. Any failure → fix and rebuild the APK before retrying.

- [ ] **Step 1: Boot the emulator**

Android Studio → Device Manager → start Pixel-7-API-34. Confirm Play Services is available:
```
adb shell pm list packages | findstr gms
```
Expected: at least `package:com.google.android.gms` appears. If not, you're on a non-GAPI emulator image — recreate with the Google Play system image.

- [ ] **Step 2: Install the APK**

```
adb install -r mobile/builds/homesquad-preview-v0.1.1.apk
```
Expected: `Success`. If `INSTALL_FAILED_VERSION_DOWNGRADE`, uninstall first: `adb uninstall com.homesquad.app`.

- [ ] **Step 3: Smoke item 1 — Cold launch**

Tap HomeSquad icon. App opens to welcome screen. **Pass:** no red error overlay; brand wordmark says HomeSquad; Tide Pool palette renders. **Fail:** red error box or stuck on splash → check `adb logcat | findstr ReactNative` for stack trace.

- [ ] **Step 4: Smoke item 2 — Google sign-up**

Tap "Sign up" → tap Google button on signup screen. **Pass:** native Google account picker appears → pick a Google account that's in the OAuth consent screen test-users list → app lands on `(onboarding)/create-family` screen. **Fail with `DEVELOPER_ERROR`:** SHA-1 / package mismatch between EAS keystore and Google Android OAuth client — re-run Task 4 with the SHA-1 from Task 3.

- [ ] **Step 5: Smoke item 3 — Family creation**

Create a family ("Test Family"), add one kid ("Kid One") with any avatar. Confirm in Supabase dashboard → Table Editor → `families` and `profiles` tables that the rows exist with `family_id` linking them.

- [ ] **Step 6: Smoke item 4 — Sign out, then Google sign-in (existing user)**

In the app, navigate to settings → sign out. From welcome, tap "Log in" → tap Google → pick the same account. **Pass:** lands on `(app)` home (not onboarding), family appears.

- [ ] **Step 7: Smoke item 5 — Email/password fallback**

Sign out. Tap "Sign up" → fill email + password (8+ chars) → complete onboarding for a second test family. **Pass:** onboarding completes; new family appears in Supabase `families`.

- [ ] **Step 8: Smoke item 6 — Push token registration**

After either sign-in above, query Supabase dashboard → Table Editor → `app.settings` schema → `settings` table → confirm a row exists for the signed-in user with a non-empty `push_token` column.

- [ ] **Step 9: Smoke item 7 — Realtime smoke**

Use both halves of the parent UI: create a chore on the parent side, then switch to kid mode (via parent PIN) on the same emulator. **Pass:** the new chore appears on the kid side without manual refresh. Validates M5 realtime + the 2026-05-22 channel-name uniqueness fix.

- [ ] **Step 10: Smoke item 8 — Deep link (password reset)**

Sign out. Tap "Log in" → "Forgot password?" → enter the email of a signed-up user → submit. Open the email in the emulator's browser (or copy the reset link manually) → tap the link. **Pass:** HomeSquad opens to the reset screen. Validates the `homesquad://` scheme change in `mobile/app.json` + `mobile/src/lib/auth.ts:35`.

- [ ] **Step 11: Gate decision**

All 8 pass → proceed to Task 10. **Do not skip ahead if any item failed.** Re-run Task 1 step 6 to confirm no `shores://` strings remain, fix the failing path, rebuild APK (Task 8), re-run this gate from step 2.

- [ ] **Step 12: Commit a gate-pass marker (optional but recommended)**

If any small code fixes were needed during gate verification:
```
git add <fixed files>
git commit -m "fix(mobile): <specific fix>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
If no fixes were needed, no commit — proceed to Task 10.

---

## Task 10: Draft privacy policy + host on GitHub Pages

**Files:**
- Create: `docs/privacy-policy.md`
- Create: `docs/privacy-policy.html`
- Modify: GitHub repo settings (Pages config)

**Why:** Privacy policy URL is a hard requirement to publish anything to Play Store, including internal testing. Hosting from `docs/` via GitHub Pages is free and requires no DNS work.

- [ ] **Step 1: Write `docs/privacy-policy.md`**

Create the file with exactly this content:

```markdown
# HomeSquad Privacy Policy

**Last updated:** 2026-05-25

HomeSquad is a family-management app built and operated by Carlos Gomez.
This policy describes what data the app handles, why, and how you can
remove it.

> **Important:** The URL of this page is referenced from the Google Play
> Store listing. Do not rename the file or move the page without updating
> the Play Console "Privacy policy" field.

## What we collect

We collect only what HomeSquad needs to work:

- **Account identifier (email + display name).** When you sign in with
  Google, we receive your email address and the name on your Google
  profile. When you sign up with email + password, we store your email
  and a hashed password. We never receive or store your Google password.
- **Family data you enter.** Family name, chore titles, reward names,
  schedules, kid profile names, kid avatars, kid PINs (stored hashed
  starting in M3). You enter this yourself; we do not infer it from
  other sources.
- **Push notification token.** A device-specific identifier we use to
  send chore reminders and approval notifications to your phone. Stored
  in your account row; rotated whenever your device reinstalls the app.
- **Voice journal recordings (optional).** When a kid uses the voice
  journal feature, the audio is recorded on the device. **Recordings
  stay on the device and are not uploaded to any server.**

We do **not** collect: precise location, contacts, calendar, photos
outside what you explicitly attach to a kid avatar, browsing history, or
any analytics events tied to your identity.

## Where it lives

Account and family data is stored in Supabase (Postgres), encrypted at
rest by the cloud provider, encrypted in transit by HTTPS. Row-Level
Security policies prevent any user from reading another family's data.

## Third parties

- **Google Identity Services** — used only when you choose to sign in
  with Google. Google's policy applies to the data Google itself handles
  on your behalf.
- **Supabase** — our database and authentication provider.
- **Expo Push Notifications** — relays push notifications to your device.

We do not share data with advertisers, analytics services, or data
brokers.

## Children

HomeSquad is **not** primarily directed at children under 13. Parents
create kid profiles inside their own account; kids do not sign in
directly. Kid profile data (name, avatar, achievement progress) is
entered by the parent and controlled by the parent. Parents can delete
any kid profile at any time from the app.

## Deletion

To delete your account and all associated family + kid data, email
`sabiondo3101@gmail.com` from the address tied to your account. We will
delete the data within 30 days and reply to confirm.

You can also remove individual kid profiles from the app at any time.

## Contact

Questions: `sabiondo3101@gmail.com`.
```

- [ ] **Step 2: Convert to `docs/privacy-policy.html`**

Create the file with this content (same body, wrapped in minimal HTML so Play Console accepts it as a standalone page):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HomeSquad Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           max-width: 720px; margin: 2em auto; padding: 0 1em; color: #222; line-height: 1.55; }
    h1, h2 { color: #0F766E; }
    h1 { border-bottom: 2px solid #0F766E; padding-bottom: 0.3em; }
    code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    blockquote { border-left: 3px solid #0F766E; margin: 1em 0; padding: 0.5em 1em;
                 background: #f7fafa; color: #555; }
  </style>
</head>
<body>
<h1>HomeSquad Privacy Policy</h1>
<p><strong>Last updated:</strong> 2026-05-25</p>

<p>HomeSquad is a family-management app built and operated by Carlos Gomez. This policy describes what data the app handles, why, and how you can remove it.</p>

<blockquote><strong>Important:</strong> The URL of this page is referenced from the Google Play Store listing. Do not rename the file or move the page without updating the Play Console "Privacy policy" field.</blockquote>

<h2>What we collect</h2>
<p>We collect only what HomeSquad needs to work:</p>
<ul>
  <li><strong>Account identifier (email + display name).</strong> When you sign in with Google, we receive your email address and the name on your Google profile. When you sign up with email + password, we store your email and a hashed password. We never receive or store your Google password.</li>
  <li><strong>Family data you enter.</strong> Family name, chore titles, reward names, schedules, kid profile names, kid avatars, kid PINs (stored hashed starting in M3). You enter this yourself; we do not infer it from other sources.</li>
  <li><strong>Push notification token.</strong> A device-specific identifier we use to send chore reminders and approval notifications to your phone. Stored in your account row; rotated whenever your device reinstalls the app.</li>
  <li><strong>Voice journal recordings (optional).</strong> When a kid uses the voice journal feature, the audio is recorded on the device. <strong>Recordings stay on the device and are not uploaded to any server.</strong></li>
</ul>

<p>We do <strong>not</strong> collect: precise location, contacts, calendar, photos outside what you explicitly attach to a kid avatar, browsing history, or any analytics events tied to your identity.</p>

<h2>Where it lives</h2>
<p>Account and family data is stored in Supabase (Postgres), encrypted at rest by the cloud provider, encrypted in transit by HTTPS. Row-Level Security policies prevent any user from reading another family's data.</p>

<h2>Third parties</h2>
<ul>
  <li><strong>Google Identity Services</strong> &mdash; used only when you choose to sign in with Google. Google's policy applies to the data Google itself handles on your behalf.</li>
  <li><strong>Supabase</strong> &mdash; our database and authentication provider.</li>
  <li><strong>Expo Push Notifications</strong> &mdash; relays push notifications to your device.</li>
</ul>
<p>We do not share data with advertisers, analytics services, or data brokers.</p>

<h2>Children</h2>
<p>HomeSquad is <strong>not</strong> primarily directed at children under 13. Parents create kid profiles inside their own account; kids do not sign in directly. Kid profile data (name, avatar, achievement progress) is entered by the parent and controlled by the parent. Parents can delete any kid profile at any time from the app.</p>

<h2>Deletion</h2>
<p>To delete your account and all associated family + kid data, email <code>sabiondo3101@gmail.com</code> from the address tied to your account. We will delete the data within 30 days and reply to confirm.</p>
<p>You can also remove individual kid profiles from the app at any time.</p>

<h2>Contact</h2>
<p>Questions: <code>sabiondo3101@gmail.com</code>.</p>
</body>
</html>
```

- [ ] **Step 3: Verify the voice-journal "not uploaded" claim still holds**

Before committing the privacy policy, sanity-check that the voice journal feature still stores recordings on-device only (no S3 / Supabase Storage upload). Grep:
```
grep -rn "uploadAsync\|expo-file-system.*upload\|storage.from" mobile/src --include="*.ts" --include="*.tsx"
```
Expected: no matches related to voice / journal / audio. If a match exists in audio-recording code, the privacy policy text in step 1 + 2 needs to be updated to disclose the upload destination **before** committing this task.

- [ ] **Step 4: Enable GitHub Pages**

This requires the repo to exist on GitHub. If `git remote -v` shows no `origin`, push first:
```
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

In the GitHub repo web UI: **Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: **main**, folder: **`/docs`**
- Click **Save**

GitHub returns a URL like `https://<username>.github.io/<repo-name>/`. Note the URL — used in Task 13.

- [ ] **Step 5: Commit + push**

```
git add docs/privacy-policy.md docs/privacy-policy.html
git commit -m "docs: add HomeSquad privacy policy for Play Store listing

Hosted via GitHub Pages from /docs/. URL is referenced from the Play
Console listing — do not rename the file without updating Console.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: Verify the page is live**

Wait ~2 minutes after push (GH Pages build delay). Visit `https://<username>.github.io/<repo-name>/privacy-policy.html` in a browser. Confirm the page renders. The URL you'll paste into Play Console is this exact URL.

If it 404s, recheck Settings → Pages source = `main` branch, `/docs` folder. The file must be at `docs/privacy-policy.html` (not a subfolder).

---

## Task 11: Google Play Console — pay $25 + create app

**External system:** Google Play Console. No repo files change.

**Why:** $25 one-time developer fee is the prerequisite for any publishing — even internal testing.

- [ ] **Step 1: Sign up for Play Console**

Go to https://play.google.com/console. Sign in with `sabiondo3101@gmail.com` (or a dedicated account if you decided otherwise). Choose **Yourself** as the account type (vs. organization). Pay the **$25 USD** registration fee. Identity verification takes 1-2 business days; you can continue with the rest of this task immediately.

- [ ] **Step 2: Create app**

Play Console → **Create app**.
- App name: `HomeSquad`
- Default language: **English (United States) – en-US**
- App or game: **App**
- Free or paid: **Free**
- Declarations:
  - "Developer Program Policies" — agree
  - "US export laws" — agree

Click **Create app**.

- [ ] **Step 3: Verify**

Play Console dashboard shows HomeSquad with a "Dashboard tasks" panel listing setup tasks. Most of these tasks are completed in Task 13.

No commit (no tracked files changed).

---

## Task 12: Listing assets — icon, feature graphic, screenshots, descriptions

**Files:**
- Verify/modify: `mobile/assets/icon.png` (must be 512x512, HomeSquad-branded)
- Create: `mobile/assets/play-store-feature-graphic.png` (1024x500)
- Create: `mobile/assets/play-store-screenshots/01-welcome.png` through `05-celebration.png` (1080+ px height)

**Why:** Play Console requires all listing assets before a build can be published — even to internal testing.

- [ ] **Step 1: Verify icon is 512x512 and HomeSquad-branded**

```
file mobile/assets/icon.png
```
or open the file. Expected dimensions: 512x512. If the icon still shows "Shores" branding or placeholder art, regenerate with HomeSquad text/imagery using the same Tide Pool palette as the welcome screen. Tools: any image editor; the existing `mobile/assets/adaptive-icon.png` can be a starting template.

- [ ] **Step 2: Create feature graphic (1024x500)**

Required by Play Console — appears at the top of the listing. Create a 1024x500 PNG showing:
- HomeSquad wordmark (large, left or center)
- Tide Pool palette (teal/coral gradient — match `mobile/src/theme/palette.ts` if you want to be exact)
- 2-3 crew-style avatar bubbles (pink unicorn, yellow lion, blue dog — matches `app/(auth)/signup.tsx:29` `CREW`)
- Optional tagline: "Chores kids actually want to do"

Save to `mobile/assets/play-store-feature-graphic.png`.

- [ ] **Step 3: Capture 5 phone screenshots from the emulator**

With the preview APK installed (from Task 8), capture these screens at 1080x1920 or larger. Use `adb exec-out screencap -p > mobile/assets/play-store-screenshots/01-welcome.png` (PowerShell) or Android Studio's screenshot button.

1. `01-welcome.png` — Welcome screen (Tide Pool background + CREW avatars + "Get started" button)
2. `02-signup.png` — Signup screen with Google button visible
3. `03-parent-home.png` — Parent dashboard after creating a family and 2-3 chores
4. `04-approval.png` — Approvals tab with at least one pending decision
5. `05-celebration.png` — Kid celebration / achievement banner (use M6 achievement flow)

Each must be at minimum 1080px on the short side. The Pixel 7 emulator natively captures at 1080x2400 which is fine.

- [ ] **Step 4: Write store listing copy**

In Play Console → HomeSquad → **Grow → Store presence → Main store listing**:

- **App name:** `HomeSquad`
- **Short description** (max 80 chars):
  ```
  Family chores, rewards, and routines that kids actually want to do.
  ```
- **Full description** (max 4000 chars):
  ```
  HomeSquad is a family-management app that turns everyday chores into a
  cooperative game. Parents set up chores and rewards. Kids tap to mark
  things done. Parents approve. Kids unlock achievements and trade points
  for real-life rewards the family chose together.

  Built for families that want a simple shared system — not another
  social network, not another notification firehose, not another app
  that wants your data.

  WHAT YOU CAN DO

  • Create a family with up to 8 kid profiles, each with an avatar and
    optional PIN
  • Set chores: one-time, daily, weekly, or on specific weekdays — with
    optional reminder times
  • Approve completed chores from the parent dashboard
  • Award points and reward catalog items
  • Track achievements: first chore, weekly streak, helping hand, and
    more
  • Co-parent invites: two parents share the same family
  • Push reminders 10 minutes before a chore is due

  HOW IT'S DIFFERENT

  • Kid mode is parent-gated by a PIN — kids never sign in directly
  • No third-party analytics, no ads, no data sharing
  • Voice journal entries stay on the device
  • Email & Google sign-in for parents; kids use parent-set PINs

  REQUIREMENTS

  • Android 8.0 (API 26) or newer
  • Google Play Services
  • A parent Google account or email address to sign in

  PRIVACY

  Read our full privacy policy at the link in the listing. Short version:
  we collect only what the app needs to work, we don't sell or share
  your data, and you can delete your account anytime by emailing us.
  ```
- **App icon:** upload `mobile/assets/icon.png` (must be 512x512 — Play Console will reject other sizes)
- **Feature graphic:** upload `mobile/assets/play-store-feature-graphic.png`
- **Phone screenshots:** upload the 5 from step 3 (drag-drop in order)
- **Tablet screenshots:** skip (we declare phone-only initially)
- **App category:** **Parenting**
- **Tags:** `Family`, `Productivity`
- **Contact details:**
  - Email: `sabiondo3101@gmail.com`
  - Phone: leave empty (optional)
  - Website: leave empty (optional)
- **External marketing:** skip
- Save (no "Send for review" yet — listing data is finalized only after Task 14's build is uploaded).

- [ ] **Step 5: Commit assets**

```
git add mobile/assets/icon.png mobile/assets/play-store-feature-graphic.png mobile/assets/play-store-screenshots/
git commit -m "feat(android): add Play Store listing assets

Icon, feature graphic, and 5 phone screenshots used in the internal
testing track listing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

Note: if `mobile/assets/icon.png` was unchanged (already 512x512 HomeSquad-branded), only stage the new files.

---

## Task 13: Compliance forms — Data safety, content rating, declarations, privacy policy URL

**External system:** Google Play Console. No repo files change.

**Why:** Play Console blocks any release (including internal track) until all "App content" sections are marked complete.

- [ ] **Step 1: Privacy policy URL**

Play Console → HomeSquad → **Policy → App content → Privacy policy**.
- Paste the URL from Task 10 step 6: `https://<username>.github.io/<repo-name>/privacy-policy.html`
- Save.

- [ ] **Step 2: App access**

Play Console → **App content → App access**.
- "Are all functions in your app available without restrictions?" — **No, some functionality is restricted**
- Add instructions: Title = `Test Google account`, Description = "Sign in with Google using any account on our OAuth consent screen test-users list. We have added 'sabiondo3101@gmail.com' and 1-2 dedicated test accounts."
- Save.

- [ ] **Step 3: Ads**

Play Console → **App content → Ads**.
- "Does your app contain ads?" — **No**
- Save.

- [ ] **Step 4: Content rating**

Play Console → **App content → Content ratings**.
- Email: `sabiondo3101@gmail.com`
- Category: **Other (productivity, education, communication, etc.)**
- Questionnaire (answer each):
  - Violence — No
  - Sexuality — No
  - Profanity — No
  - Controlled substances — No
  - Gambling — No
  - User-generated content — **Yes** (kid + chore names are user-entered; flag this honestly)
    - Does the app let users interact with each other? **No** (HomeSquad has no cross-family communication; co-parents in the same family share data but do not "chat")
    - Does the app share user-supplied content with other users? **No** (RLS prevents cross-family reads)
  - Sharing user data with third parties — **No**
  - Sharing user location — No
  - Digital purchases — No
- Submit. IARC issues an "Everyone" rating across regions within a minute.

- [ ] **Step 5: Target audience**

Play Console → **App content → Target audience and content**.
- Target age groups: **13–15, 16–17, 18 and over** (the app is parent-facing, not child-facing)
- "Does the store listing or in-app content appeal to children under 13 even though the target age is 13+?" — **No** (the kid-facing UI is parent-gated, not directly accessible to a child user without parent action)
- "Does the app collect personal info from anyone under 13?" — **No** (kid profile data is entered by the parent, not by a child user; parents are the data controllers)
- Save.

This declaration must match the consent screen + Data safety form — if all three say "13+, parent-mediated," there's no policy gap.

- [ ] **Step 6: News app declaration**

Play Console → **App content → News apps**.
- "Is your app a news app?" — **No**

- [ ] **Step 7: COVID-19 contact tracing**

- "Is your app a publicly available COVID-19 contact tracing app?" — **No**

- [ ] **Step 8: Data safety form**

Play Console → **App content → Data safety**. This is the longest section (~20 min). Answer:

**Data collection and security**
- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (Supabase HTTPS)
- Do you provide a way for users to request that their data be deleted? **Yes** (privacy policy step describes email-based deletion)

**Data types — declare collection + use for each:**

Personal info → Email address
- Collected: Yes
- Shared: No
- Optional or required: Required
- Purpose: App functionality, Account management

Personal info → Name
- Collected: Yes (Google profile name during sign-in)
- Shared: No
- Optional: Optional (only if user signs in with Google)
- Purpose: App functionality, Account management

Personal info → User IDs
- Collected: Yes (Supabase auth user UUID)
- Shared: No
- Required
- Purpose: App functionality

App activity → Other user-generated content
- Collected: Yes (chore titles, reward names, kid display names, kid avatars)
- Shared: No
- Required
- Purpose: App functionality

Audio → Voice or sound recordings
- Collected: **No** (per Task 10 step 3 verification — recordings stay on-device)
- If the verification in Task 10 step 3 found uploads happening, declare Yes here and explain on-device-only vs. uploaded

Device or other IDs → Device or other IDs
- Collected: Yes (Expo push token)
- Shared: No
- Required
- Purpose: App functionality (push notifications)

All other data types: **No**

- [ ] **Step 9: Government apps**

- "Is your app developed by or on behalf of a government?" — **No**

- [ ] **Step 10: Verify all "App content" sections show green checkmarks**

Play Console → HomeSquad → **App content**. Every row should display a green check. If any row shows yellow/red, revisit that step.

No commit (no tracked files changed).

---

## Task 14: Build production AAB

**External system:** EAS Build. No repo files change.

**Why:** Internal testing track requires an Android App Bundle (AAB), not an APK. Production profile builds AAB by default.

- [ ] **Step 1: Trigger production build**

```
cd mobile
eas build --profile production --platform android
```

EAS uses the same keystore as the preview build (Task 3). `autoIncrement: true` (`eas.json:28`) bumps the Android versionCode.

- [ ] **Step 2: Wait for completion**

~15 min on free tier. Confirm status **finished** in EAS dashboard. **versionCode** in the build summary should be 2 or higher (preview was 1).

- [ ] **Step 3: Download the AAB**

From the build page, **Download** → save to `mobile/builds/homesquad-production-v0.1.1.aab`.

- [ ] **Step 4: Verify signature**

```
jarsigner -verify -verbose -certs mobile/builds/homesquad-production-v0.1.1.aab
```
Expected: `jar verified.` and the SHA-1 of the signing cert matches Task 3 step 3. **If SHA-1 differs from the one registered in the Android OAuth client (Task 4), Google sign-in WILL fail on testers' devices.**

No commit (no tracked files changed).

---

## Task 15: Upload AAB → internal track → add testers → opt-in link

**External system:** Google Play Console. No repo files change.

**Why:** Promotes the AAB into a real distribution channel.

- [ ] **Step 1: Create internal testing release**

Play Console → HomeSquad → **Testing → Internal testing → Create new release**.

- [ ] **Step 2: Upload AAB**

Drag-drop or click "Upload" → select `mobile/builds/homesquad-production-v0.1.1.aab`. Google's automated scanning runs (~3 min). Expected: no blockers; you may see informational notices (e.g., "Some APIs require disclosure" — Data safety form was answered for those in Task 13).

If a blocker appears, click into the warning and resolve. Common ones:
- **Missing service account for `eas submit`** — ignore (we're uploading manually)
- **Permission justification needed** — for `RECORD_AUDIO`, paste: *"The microphone permission supports an optional voice-journal feature for kids within the family. Recordings are stored locally on the device and are never uploaded to a server or shared with any third party."*

- [ ] **Step 3: Release name + notes**

Release name auto-fills as the versionCode. Set release notes (English – en-US):
```
First internal build: Google sign-in, family setup, chores,
approvals, rewards, push reminders, kid mode, achievements.
```

- [ ] **Step 4: Save → Review release**

Click **Next** → **Save** → **Review release**. Review the summary. Confirm:
- Release version name: `0.1.1`
- versionCode: 2 (or higher)
- Signing: Google Play App Signing enrolled
- No errors in the warnings section

- [ ] **Step 5: Start rollout to internal testing**

Click **Start rollout to internal testing**. Status changes to "Rolling out" then "Released" within ~1 minute.

- [ ] **Step 6: Configure testers**

Play Console → HomeSquad → **Testing → Internal testing → Testers** tab.

- Click **Create email list**
- Name: `HomeSquad internal`
- Add emails (one per line): start with `sabiondo3101@gmail.com` only. Add others later.
- Save.

Then under **Testers → Email lists**, check the box next to `HomeSquad internal` to assign it to this track. Save.

- [ ] **Step 7: Copy the opt-in URL**

Play Console → **Testing → Internal testing**. Scroll to **How testers join your test** → **Copy link**. Save this URL — it's what testers click to opt in.

URL format: `https://play.google.com/apps/internaltest/<test-track-id>`

No commit (no tracked files changed).

---

## Task 16: Real-device smoke test via Play Store, then tag the release

**External system:** Your physical Android phone. No repo files change directly, but a git tag is created.

**Why:** Final binary validation. The 8-item smoke checklist (Task 9) re-run on a real device through the actual Play Store install path catches the last class of issues (signing, Play Store install gating, real device performance).

- [ ] **Step 1: Opt in on your phone**

On your Android phone, open the URL from Task 15 step 7 in Chrome. Sign in to Chrome with the same Google account on the testers list (`sabiondo3101@gmail.com`). Click **Become a tester** (or **Accept invite**). Wait 5-10 minutes for Play Store to propagate the change.

- [ ] **Step 2: Install via Play Store**

On the same phone, open Play Store → tap your profile icon → **Manage apps & device** → search for `HomeSquad`, or just search for `HomeSquad` from the main Play Store search. Tap **Install**.

If HomeSquad doesn't appear: opt-in propagation isn't done yet. Wait 5 more minutes, force-close Play Store, retry.

- [ ] **Step 3: Re-run all 8 smoke items from Task 9 on the real device**

Run the same checklist as Task 9 steps 3-10. Pay particular attention to:
- **Item 2 (Google sign-up)**: This is the highest-risk item on a real device — if it works in the emulator but fails here, the most likely cause is a Play Store signing mismatch. The fix: confirm Play App Signing is enrolled (Play Console → Setup → App signing) and that the SHA-1 listed under "App signing key certificate" matches the one in the Google Cloud Android OAuth client (Task 4). If Play has re-signed with a different key, register that new SHA-1 with Google Cloud as well.
- **Item 6 (push token)**: Real-device push delivery is the only way to confirm Expo push works through Play-Store-installed builds.
- **Item 8 (deep link)**: A real Android device handling `homesquad://` URIs from an email client is a different code path than the emulator's webview.

- [ ] **Step 4: If anything fails**

Reproduce locally on the emulator (Task 9 environment) to confirm it's a real-device-only issue. Fix, bump version (`mobile/app.json` → 0.1.2), rebuild (Task 14), upload (Task 15). The Play Store internal track auto-updates within ~1 hour on installed devices — or pull-to-refresh in Play Store → Manage apps to force.

- [ ] **Step 5: Tag the release**

Once all 8 items pass on real device:

```
git tag -a m9-android-launch -m "HomeSquad first internal Play Store release

Phase 1: rename to com.homesquad.app, generate EAS Android keystore,
register SHA-1 with Google Cloud Android OAuth client, enable Google
provider in cloud Supabase, build + verify preview APK on emulator
(8/8 smoke).

Phase 2: pay PS Console fee, create app, draft + host privacy policy,
fill Data safety + content rating + target audience, build production
AAB, upload to internal track, add testers, real-device smoke (8/8).

versionName: 0.1.1
versionCode: 2 (auto-managed by EAS)"
git push origin m9-android-launch
```

- [ ] **Step 6: Update memory**

Append to `MEMORY.md` (via the auto-memory system) a new line linking to a new memory file `m9_android_internal_launch_progress.md` covering:
- Tag name + date
- Anything that went sideways during execution that the next milestone should know
- Open follow-ups confirmed at execution time (e.g., voice-journal still on-device only? Play Console publisher account choice?)

- [ ] **Step 7: Share the opt-in URL with at most 1-2 trusted testers**

Don't fan out. Confirm one external tester's flow works end-to-end before expanding the email list past 5 people.

---

## Self-Review

Per writing-plans skill: checked spec coverage, placeholders, type consistency.

**Spec coverage:**
- Phase 1 code changes → Task 1 ✓
- Google Cloud OAuth setup → Tasks 2, 4 ✓
- EAS keystore → Task 3 ✓
- Supabase Google provider + redirect URLs → Task 5 ✓
- Migration parity → Task 6 ✓
- EAS secrets → Task 7 ✓
- Preview APK + 8-item smoke gate → Tasks 8, 9 ✓
- Play Console account + create app → Task 11 ✓
- Listing assets → Task 12 ✓
- Privacy policy draft + hosting → Task 10 ✓
- Compliance forms → Task 13 ✓
- Production AAB → Task 14 ✓
- Upload + add testers → Task 15 ✓
- Real-device smoke + tag → Task 16 ✓

**Risk mitigations from spec section "Risks":**
- SHA-1 mismatch → Task 8 step 4 + Task 14 step 4 (signature checks) + Task 16 step 3 item-2 troubleshooting
- Cloud Supabase migration drift → Task 6
- Privacy policy URL going stale → Task 10 step 1 reminder comment inline
- `RECORD_AUDIO` justification flag → Task 15 step 2 paste-ready text
- Tester opt-in confusion → Task 16 step 7 ("don't fan out")

**Placeholder scan:** No "TODO", "TBD", or "fill in" text. All env values and external URLs are flagged with explicit `<placeholder>` notation that requires user input at execution time (Google Cloud client IDs, Supabase URL, GitHub username). These are unavoidable — they don't exist until the user creates them.

**Type consistency:** Package name `com.homesquad.app` used consistently across Tasks 1, 4, 12, 15. URI scheme `homesquad://` used consistently in Tasks 1, 5, 9 step 10. Web Client ID env var name `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` used identically in Tasks 1, 2, 7. SHA-1 from Task 3 referenced in Tasks 4, 8, 14, 16 with consistent terminology.
