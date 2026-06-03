# iOS TestFlight internal launch — Design

**Date:** 2026-06-03
**Owner:** Carlos Gomez
**Status:** Draft (awaiting user review)

## Goal

Ship a HomeSquad iOS build to **TestFlight internal testing** with **Sign in with Apple** and **Sign in with Google** working end-to-end against the existing cloud Supabase project. Email + password remains as a fallback. Feature parity with the 2026-05-25 Android internal launch.

At milestone end:
- A TestFlight invite (internal track, up to 100 testers) can be sent from App Store Connect
- A fresh user can complete Apple sign-in or Google sign-in on a real iPhone running the TestFlight build and land in the existing family-creation onboarding flow
- All M1–M8 functionality (chores, approvals, rewards, push, realtime, achievements) works on iOS against the same cloud Supabase that Android already uses

## Success criteria

Each is a binary gate. None can be partial.

1. Bundle identifier `com.homesquad.app` is registered as an App ID in the Apple Developer portal with **Sign In with Apple** and **Push Notifications** capabilities enabled.
2. A fresh user can complete Apple sign-up on a real iPhone running the TestFlight build and land in `(onboarding)/create-family`.
3. A fresh user can complete Google sign-up on the same build and reach the same screen.
4. Push notifications still deliver on iOS. (Match the Android M5 baseline.)
5. Realtime updates and the `homesquad://` deep link still work on iOS.
6. The TestFlight build appears in the **TestFlight** iOS app for an invited internal tester and installs cleanly.
7. Email/password sign-up and sign-in still work for testers who prefer them.

## Out of scope (explicit non-goals)

The following are **deferred** to future milestones, not part of this one:

- App Store production submission (full App Review, marketing assets, screenshots, keywords, description)
- External TestFlight (requires a one-time Beta App Review)
- Universal Links migration (deep links continue to use the `homesquad://` custom URI scheme)
- App Tracking Transparency (HomeSquad does not track, no prompt needed)
- iPad-specific layout polish (`supportsTablet: true` is declared, but iPad UX QA is deferred)
- Sentry / crash reporting (still deferred from M7)
- Replacing M6 placeholder sound assets
- `eas submit` automation against an App Store Connect API key — first build is fine via manual Transporter or `eas submit` interactive
- iOS App Store screenshots and marketing copy — NOT required for TestFlight internal; deferred until App Store submission

## Architecture overview

Three phases with one hard verification gate. The new shape (vs. the two-phase Android spec) is **Phase 0**, which exists because Apple Developer Program enrollment is a 24–48h+ external block. Phase 0 lets us run the non-blocked prep work in parallel with Apple's review queue.

```
Phase 0: Enrollment + parallel prep      Phase 1: Apple-Dev-blocked config       Phase 2: TestFlight
─────────────────────────────────         ──────────────────────────────────      ─────────────────────────
enroll in Apple Developer Program         create App ID + capabilities            build iOS production via EAS
(submit; wait for approval email)         generate APNs key (.p8)                 eas submit to App Store Connect
                                          configure Supabase Apple provider       App Store Connect app record
create Google iOS OAuth client      ───▶  fill iosUrlScheme + EAS secrets    ───▶ create internal tester group
(only needs bundle ID; not blocked)       set ios.config.usesNonExemptEncryption  invite self via TestFlight
update privacy-policy.md for Apple        EAS credentials (cert + profile)        real-device 9-item smoke
draft App Store Connect listing copy      smoke-test on iOS simulator             tag commit
                                          (9-item gate)
```

The gate matters: every Phase 2 task is wasted work if Phase 1 turns up an App-ID-capability, Services-ID, or APNs misconfiguration. Gate cost is one EAS iOS build (~20 min); skipped-gate cost is a TestFlight build that uploads successfully but fails sign-in or push for every tester.

## Phase 0: Enrollment + parallel prep

These tasks can all proceed in parallel with Apple's enrollment review. None of them require an active Apple Developer Program account.

### 0.A — Apple Developer Program enrollment

1. Sign in to <https://developer.apple.com/programs/enroll> with the Apple ID you want to own this account.
2. Enrollment type: **Individual** — $99/year. (Organization needs a D-U-N-S number and weeks of review; not justified for a solo project. Publisher name on App Store will be your legal name.)
3. Submit. Approval typically arrives via email within 24–48h; can occasionally take a week.
4. **Decision deferred to execution time:** which Apple ID to use — `sabiondo3101@gmail.com` (same as Play Console publisher) or a dedicated `homesquad-dev@`. Either works. The existing one is the path of least friction.

### 0.B — Google iOS OAuth client (not blocked on Apple)

1. Google Cloud Console → APIs & Services → Credentials → **Create Credentials** → OAuth client ID → **iOS**.
2. Name: `HomeSquad iOS`.
3. Bundle ID: `com.homesquad.app`.
4. Save the Client ID — value looks like `1234567890-abcd1234.apps.googleusercontent.com`.
5. Reverse it: `com.googleusercontent.apps.1234567890-abcd1234`.
6. Replace the placeholder at `mobile/app.json:32` (`iosUrlScheme`).
7. Set the EAS secret: `eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value 1234567890-abcd1234.apps.googleusercontent.com`.

### 0.C — Update privacy policy for iOS + Apple Sign In

Edit `docs/privacy-policy.md` (and regenerate `docs/privacy-policy.html`):
- Add **Apple Sign In** to the "Third parties" section, parallel to the Google entry.
- Add a sentence under "Account identifier" noting that Apple's **Hide My Email** relay address (`*@privaterelay.appleid.com`) may be used instead of the user's real email; relays are passed through Apple's servers per Apple's policy.
- Update the "Important" callout to mention BOTH Play Store and App Store listings reference the URL.
- Bump the "Last updated" date.

The privacy policy URL (`https://carlosgomez.github.io/Shores/privacy-policy.html` — confirm at execution) goes into App Store Connect → App Privacy → Privacy Policy URL.

### 0.D — App Store Connect listing copy (draft only — not submitted)

Draft the App Store Connect required-for-TestFlight fields. These are short text fields; the marketing-quality copy can wait until App Store submission.

| Field | Required for TestFlight internal? | Draft |
|---|---|---|
| App name | Yes | `HomeSquad` |
| Subtitle | No (App Store only) | defer |
| Primary language | Yes | English (U.S.) |
| Bundle ID | Yes | `com.homesquad.app` (same App ID as Phase 1) |
| SKU | Yes | `homesquad-ios-001` |
| What to Test (per build) | Yes | *"First internal iOS build — Apple + Google sign-in, family setup, chores, rewards, push notifications."* |
| Beta App Description | No (only for external TestFlight) | defer |
| Beta App Feedback Email | Yes | `sabiondo3101@gmail.com` |
| Marketing URL, Support URL | Optional | use the GitHub Pages site URL |
| Screenshots, description, keywords | No | defer to App Store submission |

### 0.E — Add iOS export-compliance flag to `app.json`

Apple requires every uploaded build to answer "does your app use non-exempt encryption?" Adding this once in `app.json` avoids being prompted every TestFlight upload.

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.homesquad.app",
  "usesAppleSignIn": true,
  "config": {
    "usesNonExemptEncryption": false
  }
}
```

HomeSquad uses only standard HTTPS via Supabase — qualifies for the export-compliance exemption.

## Phase 1: Apple-Dev-blocked config

**Prerequisite:** Apple Developer Program approval email received.

### 1.A — Create the App ID

1. Apple Developer portal → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **App IDs** → **App**.
2. Description: `HomeSquad`.
3. Bundle ID: **Explicit**, `com.homesquad.app`.
4. Enable capabilities:
   - **Sign In with Apple** (required because we offer Google sign-in; Apple Store guideline 4.8)
   - **Push Notifications**
5. Save.

### 1.B — Generate the APNs authentication key

1. Apple Developer portal → **Keys** → **+**.
2. Name: `HomeSquad APNs`.
3. Enable: **Apple Push Notifications service (APNs)**.
4. Save.
5. **Download the `.p8` file immediately** — it can only be downloaded once. Note the **Key ID** and **Team ID** (Team ID is on every page header of the developer portal).
6. Store the `.p8` securely (1Password, etc.). Do not commit.
7. Upload to EAS so the production build embeds it: `eas credentials -p ios` → **Push Notifications: Manage your Apple Push Notifications Key** → upload the `.p8`, enter Key ID and Team ID.

**Note:** If the team already has an APNs key in use for another project, prefer to reuse it (one team-wide key works for all apps under that Team ID).

### 1.C — Supabase: enable the Apple auth provider

The HomeSquad iOS app uses native Sign In with Apple, which calls Supabase via `signInWithIdToken({ provider: 'apple', token })` (`mobile/src/lib/auth.ts:49`). For this native flow, Supabase only needs to know the accepted audience.

1. Supabase Dashboard → Authentication → Providers → **Apple** → enable.
2. **Authorized Client IDs:** add `com.homesquad.app` (the bundle ID — this is what the identity token's `aud` claim contains for native iOS sign-in).
3. Save.

**Verify at execution time:** Supabase's Apple provider UI may also offer optional fields (Services ID, Team ID, Key ID, Secret Key). These are needed for **web** Sign In with Apple (OAuth flow), which we do not use. For native-only, the Client ID is sufficient. If Supabase rejects the config or returns an error during sign-in, the fallback is to create a Services ID (e.g., `com.homesquad.app.signin`) in the Apple Developer portal with Sign In with Apple enabled, then provide it plus the Team ID, Key ID, and `.p8` to Supabase — but try the bundle-ID-only path first.

### 1.D — EAS credentials for iOS distribution

`eas credentials -p ios` → walk through:
- **Distribution Certificate** — choose **Let EAS manage** (auto-generates).
- **Provisioning Profile** — choose **Let EAS manage** (auto-generates against the App ID from 1.A).
- EAS will also surface the APNs key from 1.B.

This makes the production EAS profile self-sufficient — no manual cert/profile juggling.

### 1.E — Confirm app.json reflects all Phase 1 changes

Final `mobile/app.json` ios block expected shape:
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.homesquad.app",
  "usesAppleSignIn": true,
  "config": {
    "usesNonExemptEncryption": false
  }
}
```
Plugin entry for Google Sign-In with the real reversed iOS client ID swapped in (from 0.B step 6).

## Phase 1 → Phase 2 verification gate

This is the binary checkpoint. Nothing in Phase 2 begins until every item below passes.

**Build:** `eas build --profile preview --platform ios` — produces a signed `.ipa` for internal distribution. (Preview profile already configured for internal distribution; iOS simulator off.)

**Install:** download the `.ipa` from the EAS dashboard. Two install paths:
- **Real iPhone:** plug into a Mac, drag-and-drop via Apple Configurator 2, OR use the EAS-provided install link (works because preview is internal distribution).
- **No iPhone yet:** rebuild as a simulator build (`eas build --profile development --platform ios` with `ios.simulator = true` temporarily), drop into a friend's Mac iOS Simulator, OR pay for a brief MacInCloud session.

**Real-device strongly preferred** — only a real device verifies Apple Sign In, push notifications, and the App Store install path end-to-end.

**Smoke checklist (9 items, all must pass):**

1. **Cold launch** — app opens, lands on welcome, no red error box.
2. **Apple sign-up** — tap Apple button → native Apple sign-in sheet → choose "Share My Email" or "Hide My Email" → land on `(onboarding)/create-family`.
3. **Family creation** — create a family, add one kid profile. Confirm rows exist in Supabase cloud dashboard. Confirm the email stored is either the real email or the `*@privaterelay.appleid.com` relay (both are valid).
4. **Sign out → Apple sign-in again** — sign out, tap Apple → land on `(app)` home (existing-user path, not re-onboarding).
5. **Google sign-up** — separate fresh account; same end state as step 2.
6. **Email/password fallback** — sign up a third user with email+password.
7. **Push token registration** — after sign-in, confirm `app.settings.*` row in Supabase has a push token. iOS tokens start with `ExponentPushToken[...]` from Expo's relay (different format from Android FCM tokens).
8. **Realtime smoke** — create a chore on parent side → appears on kid side without manual refresh.
9. **Deep link** — trigger a password-reset email → tap link in email → app opens to the reset screen (validates `homesquad://` scheme works on iOS).

**Failure handling:** if any step fails, fix and rebuild. Do not proceed to Phase 2 until all 9 pass.

**Not verified by this gate:** behavior on a TestFlight-installed build vs. a sideloaded preview build. The two share the same `.ipa`-level config, but TestFlight introduces App Store Connect metadata and the TestFlight install path. Real-device-via-TestFlight smoke happens in Phase 2 step 2.G.

## Phase 2: TestFlight internal track

### 2.A — App Store Connect app record

1. <https://appstoreconnect.apple.com> → My Apps → **+** → **New App**.
2. Platforms: iOS.
3. Name: **HomeSquad**.
4. Primary language: English (U.S.).
5. Bundle ID: select `com.homesquad.app` from the dropdown (populated from Phase 1.A).
6. SKU: `homesquad-ios-001` (or any unique string — not user-visible).
7. User Access: Full Access.
8. Create.

### 2.B — Privacy nutrition labels (App Privacy)

App Store Connect → your app → **App Privacy** → Get Started.

For each data type collected, declare: (1) is it collected? (2) is it linked to the user? (3) is it used to track them across apps/sites?

| Data type | Collected? | Linked? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Device ID (push token) | Yes | Yes | No | App Functionality |
| User-generated content (chore/reward titles, kid names + avatars) | Yes | Yes | No | App Functionality |
| Audio Data (voice journal) | No — recorded on device only, never uploaded | — | — | — |

Encryption in transit: Yes (Supabase HTTPS). Data deletion supported: Yes (via email request — same as Play Store data safety).

### 2.C — Age rating + content rights

- Age Rating questionnaire → all "No" — HomeSquad rates **4+**.
- Content rights: declare the app does **not** contain third-party content.
- Government app: No. Made for Kids program: **No** (same reasoning as Play "not primarily directed at children" — parents are the primary user; kid mode is parent-mediated).

### 2.D — App Review Information (test-account credentials)

Provide a test account so Apple reviewers can sign in if a future build requires review:
- Test account email + password (use one of the existing Supabase test accounts).
- Notes: *"HomeSquad is a family chore-tracker. Sign in with the provided credentials, complete family setup to see the parent dashboard, and use kid mode (PIN: 0000) to see the kid view."*
- TestFlight internal **does not trigger App Review**, but the field is mandatory up front.

### 2.E — Build production iOS via EAS

```
eas build --profile production --platform ios
```

- Uses the same App ID, distribution cert, provisioning profile, and APNs key set up in Phase 1.
- `appVersionSource: remote` + `autoIncrement: true` (eas.json) → EAS owns the iOS build number (`CFBundleVersion`). No manual bump.
- `version` in `app.json` (`0.1.1`) becomes the App Store Connect version name (`CFBundleShortVersionString`).
- ~20 min queue + build time.

### 2.F — Submit to App Store Connect

```
eas submit --profile production --platform ios
```

- EAS pulls the `.ipa` it just built and uploads via the App Store Connect API.
- Requires an App Store Connect API key. **Decision deferred to execution time:** generate one now (App Store Connect → Users and Access → Keys → App Store Connect API) and add as an EAS secret, OR use the interactive `eas submit` prompt that asks for Apple ID + app-specific password on each run. Either works; the API key is cleaner for the second build onward.
- After submit: build appears in App Store Connect → TestFlight tab within ~5–30 minutes (Apple processing).

### 2.G — Internal tester group + invite

1. App Store Connect → your app → TestFlight → Internal Testing → **+** to create a group: `HomeSquad internal`.
2. Add yourself (and anyone else with an App Store Connect role on the team). Internal testers must be members of your App Store Connect team — up to 100.
3. Once the build finishes Apple processing, it appears in the group. Toggle "Enable" on the build for the group.
4. Apple sends each tester an invite email with a redeem code. Open the **TestFlight** app on the iPhone, redeem, install HomeSquad.

### 2.H — Real-device smoke test on TestFlight build

Run the same 9-item smoke checklist from Phase 1's gate against the TestFlight-installed build on a real iPhone. Any failure blocks the milestone.

### 2.I — Tag the commit

Suggested name: `m9-ios-launch`. The Android internal launch was `m9-android-launch`. If you want them paired, consider `m9-android-launch` → `m9-ios-launch` so both halves of the M9 release surface are tagged consistently. Final tag name is your call at execution time.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apple Developer Program approval takes >48h | Medium | High — Phase 1 is fully blocked | Phase 0 surfaces this as the critical path so Phase 0 prep work fills the wait |
| Bundle ID `com.homesquad.app` is already taken in Apple's global namespace | Low | High — would force a rename and re-do every place the identifier appears | Verify availability during App ID creation (Phase 1.A); if taken, fall back to `app.homesquad.com` or similar and audit `app.json`, OAuth clients, Supabase redirect URLs |
| Supabase Apple provider config differs from native-flow expectations (Services ID + private key actually required) | Medium | Medium — sign-in fails until config corrected | Phase 1.C documents the bundle-ID-only path AND the Services-ID fallback; smoke step 2 catches the failure before Phase 2 |
| APNs key conflict — team already has a key registered elsewhere | Medium | Low — reuse the existing key | Phase 1.B explicitly notes the reuse option |
| Hide My Email relay creates downstream friction (user revokes via Apple ID settings, relay breaks, password reset stops working) | Low | Low — affects rare individual testers | Document in privacy policy + tester onboarding note |
| TestFlight build successfully uploads but Apple processing stalls (no email, no error) | Low | Medium — adds hours of waiting | Check App Store Connect status; typical resolution is to wait 24h, then contact Apple Developer Support |
| TestFlight requires a Mac for some submission step | None | — | Confirmed false: `eas submit` works from any OS; Transporter (Mac-only) is just one of several upload paths |
| EAS preview/development build can't be installed without a Mac for first-time real-device install | Medium | Medium — slows Phase 1 gate | Use TestFlight (Phase 2) as the real-device test channel and skip standalone real-device gate; OR use the EAS-provided installable link on the preview profile (works on iOS without a Mac for ad-hoc distribution if the device UDID is registered) |
| `usesAppleSignIn: true` + missing Sign In with Apple capability on the App ID causes opaque crash | Low | High — silent failure on first launch | Phase 1.A explicitly enables the capability; smoke step 1 catches |

## Open questions (resolved at execution time, not blocking spec approval)

1. **Apple ID for enrollment** — `sabiondo3101@gmail.com` (same as Play Console) or dedicated `homesquad-dev@`. Default: existing.
2. **Privacy policy URL exact form** — depends on the GitHub Pages site URL; should already be confirmed from the Android milestone. Carry over the same value.
3. **App Store Connect API key vs interactive submit** — generate the key now (cleaner) or use interactive on first run. Default: interactive for the first build, generate the key before the second.
4. **Supabase Apple provider native-flow config** — verify bundle-ID-only works; if not, fall back to Services ID + Team ID + Key ID + `.p8`.
5. **Voice-journal upload status** — App Privacy form needs an accurate answer. Confirm "recorded on device, never uploaded" still matches the current implementation (same check from the Android milestone).
6. **Whether to also defer 0.D listing copy** — App Store Connect technically lets a TestFlight internal build go live without any listing fields beyond the bare minimum. If saving 30 minutes matters, skip 0.D and address fields just-in-time during Phase 2.A.

## Follow-ups deferred to future milestones

- iOS App Store production submission (full App Review, marketing screenshots, description, keywords, app preview videos)
- External TestFlight + Beta App Review
- Universal Links migration (replace `homesquad://` custom URI scheme for password-reset deep links — Apple recommends Universal Links for production)
- iPad layout QA (`supportsTablet: true` is declared; renders are unverified)
- Sentry + crash reporting (still deferred from M7)
- Email verification toggle in cloud Supabase (still deferred from M1)
- Replacing M6 placeholder sound assets
- App Store Connect API key + automated `eas submit` for subsequent builds
- Sign In with Apple **server-to-server notifications** endpoint (Apple notifies your server when a user revokes Hide My Email or deletes their Apple ID — only needed once we want to react to revocation)
