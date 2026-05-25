# Android internal launch + Google sign-in — Design

**Date:** 2026-05-25
**Owner:** Carlos Gomez
**Status:** Draft (awaiting user review)

## Goal

Ship a HomeSquad Android build to the **Play Store internal testing track** with **Sign in with Google** working end-to-end against a **cloud** Supabase project. Email + password sign-in remains as a fallback.

At milestone end:
- The internal-track install link can be shared with up to 100 testers
- A fresh user can complete Google sign-in on a real Android device and land in the existing family-creation onboarding flow
- All M1–M8 functionality (chores, approvals, rewards, push, realtime, achievements) works against cloud Supabase, not local Docker

## Success criteria

Each is a binary gate. None can be partial.

1. App package is `com.homesquad.app` in every place it appears: `app.json` (`android.package`, `ios.bundleIdentifier`), Google Cloud OAuth Android client, Supabase redirect URL list, Play Console listing.
2. A fresh user can complete Google sign-up on the Pixel-7-API-34 emulator and land in `(onboarding)/create-family`.
3. Push notifications still deliver on the new build. (M5 verified pushes work on EAS dev builds — verify no regression.)
4. The Play Store internal-track install link, clicked from an Android device whose Google account is on the testers list, installs HomeSquad and lets the user sign in with Google.
5. Email/password sign-up and sign-in still work for testers who prefer them.

## Out of scope (explicit non-goals)

The following are **deferred** to future milestones, not part of this one:

- iOS / Apple sign-in / TestFlight / App Store
- Open testing or production Play Store tracks
- Sentry / crash reporting (deferred from M7)
- Email verification turned on in cloud Supabase (deferred from M1)
- Replacing placeholder sound assets (deferred from M6)
- `eas submit` automation — first AAB is uploaded manually to Play Console

## Architecture overview

Two sequential phases with a hard verification gate between them.

```
Phase 1: Code + config            Phase 2: Play Console
─────────────────────────         ────────────────────────
rename to com.homesquad.app       create Play Console app
generate EAS Android keystore     listing assets + privacy policy
register SHA-1 with Google OAuth  Data safety + content rating
enable Supabase Google provider   upload AAB to internal track
build preview APK                 add testers, share link
smoke-test on emulator      ───▶  install on real device via Play Store
   (8-item gate)                  tag commit
```

The gate matters: every Phase 2 task is wasted work if Phase 1 turns up a keystore-SHA-1 or package-name issue. Gate cost is one EAS build (~15 min); skipped-gate cost is a burned Play Console release version.

## Phase 1: Code + external config

### Code changes (small — mostly identifiers)

| File | Change |
|---|---|
| `mobile/app.json` | `android.package` → `com.homesquad.app`; `ios.bundleIdentifier` → `com.homesquad.app`; `scheme` → `homesquad`; `plugins[@react-native-google-signin/google-signin].iosUrlScheme` → real reversed iOS client ID (placeholder until iOS milestone — fine to leave for now); bump `version` 0.1.0 → 0.1.1 |
| `mobile/src/lib/auth.ts:35` | `redirectTo: 'shores://reset-password'` → `homesquad://reset-password` |
| `mobile/eas.json` | Confirm `production` profile produces an AAB (default for Android — no explicit `buildType` needed; preview already explicitly uses `apk` for sideload). No change expected; verify only. |
| `mobile/.env.local` | Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com`; add `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=` (empty, gates iOS Apple button rendering) |

**Pre-commit grep sweep:** search the `mobile/` tree for any remaining `shores://` URI scheme references or `com.shores.app` identifier references and fix them. The repo slug `shores` and EAS project remain untouched — only user-facing identifiers and URI schemes change.

### External config (one-time, no code)

**Ordering matters.** Do these in numbered order. Steps 2 and 4 are blocked on step 3's output (the SHA-1).

1. **Google Cloud Console — OAuth consent screen**
   - App name: "HomeSquad"
   - User support email, publisher email: `sabiondo3101@gmail.com` (or your choice)
   - Scopes: `email`, `profile`, `openid` (defaults — do not request anything else)
   - Publishing status: leave as **Testing**; promote to **In production** later when you have a real privacy-policy URL (Phase 2 step C). Testing mode allows up to 100 test users which is sufficient.

2. **Google Cloud Console — Web OAuth client**
   - Type: **Web application**
   - Name: "HomeSquad Web"
   - No authorized JavaScript origins or redirect URIs needed (Supabase handles the redirect server-side via ID token verification)
   - Copy the Client ID → save as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and as an EAS secret
   - Copy the Client Secret → paste into Supabase Google provider in step 5

3. **EAS — generate Android keystore**
   - Command: `eas credentials -p android` → select **Set up a new keystore** (or accept EAS auto-generation on first build)
   - EAS prints the SHA-1 fingerprint after generation — record it; you'll need it for step 4

4. **Google Cloud Console — Android OAuth client**
   - Type: **Android**
   - Package name: `com.homesquad.app`
   - SHA-1: paste from step 3
   - No client secret needed (Android clients don't have one — the package-name + SHA-1 pair is the credential)

5. **Supabase cloud project — Google provider**
   - Auth → Providers → Google → enable
   - Paste the **Web** Client ID from step 2 into "Client ID for OAuth"
   - Paste the **Web** Client Secret from step 2 into "Client Secret for OAuth"
   - Save

6. **Supabase cloud project — Redirect URLs**
   - Auth → URL Configuration → Redirect URLs → add `homesquad://reset-password`
   - Remove `shores://reset-password` if present
   - Save

7. **Supabase cloud project — migration parity check**
   - Run `supabase db push --linked --dry-run` from the repo root
   - Expected output: "No new migrations to apply"
   - If output shows pending migrations, apply them with `supabase db push --linked` and verify in Supabase dashboard that key tables exist (`families`, `profiles`, `chores`, `approvals`, `rewards`, `redemptions`, `achievements`)

8. **EAS secrets**
   - `eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value <cloud-supabase-url>`
   - `eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <cloud-anon-key>`
   - `eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web-client-id>`
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` can be set to empty string for now (gates iOS Apple button — not used on Android)

## Phase 1 → Phase 2 verification gate

This is the binary checkpoint. Nothing in Phase 2 begins until every item below passes.

**Build:** `eas build --profile preview --platform android` — produces a signed APK (preview profile already configured for `buildType: apk`, internal distribution).

**Install:** drag-and-drop the APK onto a running Pixel-7-API-34 emulator (same emulator used for M8 / celebration-replay acceptance). Confirm Play Services is available: `adb shell pm list packages | grep gms` returns at least `com.google.android.gms`.

**Smoke checklist (8 items, all must pass):**

1. **Cold launch** — app opens, lands on welcome, no red error box.
2. **Google sign-up** — tap Google button → native Google account picker → pick an account → app lands on `(onboarding)/create-family`.
3. **Family creation** — create a family, add one kid profile. Confirm rows exist in Supabase cloud dashboard.
4. **Sign out → Google sign-in** — sign out, tap Google again, pick the same account → app lands on `(app)` home (existing-user path, no re-onboarding).
5. **Email/password fallback** — sign up a different user with email+password → onboarding completes successfully.
6. **Push token registration** — after sign-in, confirm `app.settings.*` row in Supabase has a push token (M5 behavior must not regress).
7. **Realtime smoke** — create a chore on parent side → appears on kid side without manual refresh (M5 + 2026-05-22 realtime fix).
8. **Deep link** — trigger a password-reset email → tap link in email → app opens to reset screen (validates `homesquad://` scheme change).

**Failure handling:** if any step fails, fix and rebuild. Do not proceed to Phase 2 until all 8 pass.

**Not verified by this gate:** behavior on a real Android device that isn't an emulator. Accepted risk for internal-track-only; real-device smoke happens via the Play Store install link in Phase 2 step E.

## Phase 2: Play Store internal track

### A. Play Console account + app creation

1. Pay the **$25 one-time** Google Play Console developer fee at play.google.com/console.
   - Account: `sabiondo3101@gmail.com` is the default; a dedicated `homesquad-dev@gmail.com` is cleaner if you want a separate identity for the publisher record. **Decision deferred to execution time** — both work.
2. Create app:
   - Name: **HomeSquad**
   - Default language: English (US)
   - App or game: **App**
   - Free or paid: **Free**
   - Declaration: app is **not primarily directed at children under 13**
3. Complete the post-create onboarding checklist Google walks you through (~15 min — sets up the listing skeleton).

**Why "not primarily directed at children" is correct:** HomeSquad is a family-management app where parents create kid profiles. Kids do not sign up directly. Kid mode is gated behind a parent PIN. The app's primary user is the parent. Declaring "yes, primarily for children" would subject HomeSquad to the **Designed for Families** program (no third-party ads, COPPA-aligned data minimisation, Teacher Approved review process) — overkill for this model and would block several future product directions.

### B. Listing assets

| Asset | Requirements | Status |
|---|---|---|
| App icon | 512×512 PNG | `mobile/assets/icon.png` exists — verify it's 512×512 and HomeSquad-branded (not the early Shores placeholder). Regenerate if needed. |
| Feature graphic | 1024×500 PNG | **Does not exist.** Create one: Tide Pool palette, HomeSquad wordmark, crew avatars in the same aesthetic as the welcome screen. Save at `mobile/assets/play-store-feature-graphic.png`. |
| Phone screenshots | ≥ 2, max 8, ≥ 1080×1920 | Capture from emulator: welcome, signup, parent home with chores list, approval screen, kid celebration / achievement banner. Save under `mobile/assets/play-store-screenshots/`. |
| Short description | ≤ 80 chars | Draft: *"Family chores, rewards, and routines that kids actually want to do."* |
| Full description | ≤ 4000 chars | Draft included in execution plan; tone matches existing onboarding copy. |

### C. Privacy policy

1. Draft `docs/privacy-policy.md` covering:
   - What data Supabase stores (email, display name, family/kid data entered by parent, push token)
   - Google sign-in: identifier usage (email + name from Google profile), no other Google data accessed
   - Push tokens: used only to send chore reminders and approval notifications
   - Kid profile data: entered by parent, never collected from a child directly; parent-controlled deletion
   - No third-party analytics, no ads, no data shared with third parties
   - Deletion-on-request via emailing the developer
   - Last-updated date
2. Convert to `docs/privacy-policy.html` (static HTML, no JS).
3. Host via GitHub Pages from the repo `docs/` folder (free, no DNS work).
   - GitHub repo settings → Pages → source = `main` branch, `docs/` folder
   - URL becomes `https://<gh-username>.github.io/<repo-name>/privacy-policy.html`
   - **Decision deferred to execution time:** confirm the exact URL (depends on your GitHub username and the published repo name)
4. Add the URL to Play Console → App content → Privacy policy.
5. Add a comment in `docs/privacy-policy.md` reminding future-you that the URL is referenced externally — do not break it without updating Play Console.

### D. Compliance forms (~30–45 min)

1. **Data safety form** — declare:
   - Collects: email + name (via Google sign-in), user-entered content (chore/reward titles, kid display names + avatars), device push token, optional kid voice journal (recorded on-device, currently never uploaded — confirm before submitting)
   - Shared with third parties: **No**
   - Encrypted in transit: **Yes** (Supabase HTTPS)
   - Users can request data deletion: **Yes** (via email)
2. **Content rating questionnaire** — IARC form. HomeSquad rates **Everyone**.
3. **Target audience** — age groups: **13+** (parents are the primary user; kid mode is parent-mediated). Match the "not primarily directed at children" declaration from step A.
4. **News app declaration** — No.
5. **Government app declaration** — No.
6. **Ads declaration** — No.
7. **App access** — provide test Google account credentials so Google reviewers can sign in if the app is ever reviewed (internal track usually isn't, but this is required up front).

**Justification text for the `RECORD_AUDIO` permission** (the spec will paste this exact wording into the Data safety form if Google asks): *"The microphone permission supports an optional voice-journal feature for kids within the family. Recordings are stored locally on the device and are never uploaded to a server or shared with any third party."*

### E. Production AAB, upload, share

1. **Build:** `eas build --profile production --platform android` — uses the **same** keystore generated in Phase 1 step 3. Produces a signed AAB.
   - `appVersionSource: remote` + `autoIncrement: true` means EAS owns the Android version code; no manual `versionCode` bump.
   - `version` in `app.json` (0.1.1) becomes the Play Console "version name" shown to testers.
2. Download AAB from EAS dashboard.
3. **Upload:** Play Console → HomeSquad → Testing → **Internal testing** → Create new release → upload AAB. Google's automated checks run (~5 min).
4. **Release notes:** *"First internal build — Google sign-in, family setup, chores, rewards, achievements."*
5. **Save → Review release → Roll out to internal testing.**
6. **Add testers:** Internal testing → Testers tab → create email list "HomeSquad internal" → add your own email first. Copy the **"Join on the web"** opt-in URL.
7. **Real-device smoke test:** click the opt-in URL from an Android device, install HomeSquad via Play Store, run the same 8-item smoke checklist from Phase 1 on the real device. Any failure here blocks the milestone.
8. **Tag the commit:** suggested name `m9-android-launch` (following the `m<N>-<slug>` pattern of `m1-foundations` … `m6-gamification`). Last actually-tagged milestone is `m6-gamification`; post-M6 work has been fast-forward-merged without tags. This launch is a meaningful boundary worth tagging — final tag name is your call at execution time.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SHA-1 / package-name mismatch between EAS keystore and Google OAuth Android client | Medium | High — sign-in fails silently with `DEVELOPER_ERROR` | Phase 1 gate (Section 3) catches this before any Play Store work |
| Cloud Supabase migrations missing or out of sync with local | Low | High — real testers hit RLS errors or 404s | Phase 1 step 7 explicitly includes `supabase db push --linked --dry-run` |
| Privacy policy URL goes stale later (repo rename, GH username change) | Low | Medium — Play Console must be updated | Choose stable URL up front; add reminder comment in `docs/privacy-policy.md` |
| Google flags `RECORD_AUDIO` permission justification | Medium | Low — fixed by replying with the prepared text | Justification text included in Phase 2 step D |
| Tester opt-in confusion (non-technical testers don't understand the flow) | High when audience grows | Low — fixable per-tester | Include a short tester-onboarding message in the spec (paste-ready); not urgent while testers = only you |

## Open questions (resolved at execution time, not blocking spec approval)

1. **Play Console publisher Google account** — `sabiondo3101@gmail.com` or a dedicated account? Default: existing.
2. **Privacy policy URL path** — depends on the GitHub username/org and the published repo name. Confirm before Phase 2 step C.
3. **Voice-journal upload status** — Data safety form needs an accurate answer. Confirm "recorded on device, never uploaded" still matches the current implementation before submitting the form (one-line check against the audio feature code).

## Follow-ups deferred to future milestones

- iOS / Apple sign-in / TestFlight / App Store
- Sentry + crash reporting (deferred from M7)
- Email verification toggle in cloud Supabase (deferred from M1)
- Replacing M6 placeholder sound assets
- `eas submit` + Play Console service-account JSON for automated submission (manual upload fine for first build; automate before the third)
- Promotion path: internal → closed → open testing → production
