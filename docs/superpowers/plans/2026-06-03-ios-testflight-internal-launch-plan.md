# iOS TestFlight Internal Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HomeSquad to TestFlight internal testing with Sign in with Apple and Sign in with Google working end-to-end against cloud Supabase, while keeping email/password as a fallback. Feature parity with the 2026-05-25 Android internal launch.

**Architecture:** Three phases with one hard verification gate. Phase 0 = Apple Developer Program enrollment kicked off + everything-non-blocked-by-Apple done in parallel (Google iOS OAuth, privacy policy, App Store Connect listing copy, export-compliance flag). Phase 1 = Apple-Dev-blocked config (App ID, APNs key, Supabase Apple provider, EAS credentials) and a 9-item simulator/device smoke gate. Phase 2 = App Store Connect record + privacy nutrition labels + production EAS build + `eas submit` + internal tester invite + real-device smoke on the TestFlight build.

**Tech Stack:** Expo SDK 54 · React Native 0.81 · `expo-apple-authentication` (already wired in `mobile/src/lib/auth.ts:39`) · `@react-native-google-signin/google-signin` v16 · Supabase (cloud) · EAS Build + EAS Submit · Apple Developer portal · App Store Connect · TestFlight

**Spec reference:** `docs/superpowers/specs/2026-06-03-ios-testflight-internal-launch-design.md`

---

## File Structure

This milestone is mostly configuration in external systems. Only these repo files change:

```
mobile/
└── app.json                      # MODIFY: iosUrlScheme placeholder → real value;
                                  #         add ios.config.usesNonExemptEncryption

docs/
├── privacy-policy.md             # MODIFY: add Apple Sign In + Hide My Email;
│                                 #         update Important callout; bump date
├── privacy-policy.html           # REGENERATE from privacy-policy.md
└── superpowers/
    └── plans/                    # this file lives here
```

No changes to `mobile/src/lib/auth.ts` — Apple sign-in is already implemented at `mobile/src/lib/auth.ts:39` from the M1/M7 era. No changes to `mobile/eas.json` — production profile from the Android launch reuses cleanly for iOS.

External systems (no repo file representation):
- Apple Developer Program — enrollment, App ID, capabilities, APNs key, Team ID
- Google Cloud Console — iOS OAuth client (new; sibling to existing Web + Android clients)
- Supabase cloud project — Apple provider enabled with bundle ID as authorized client
- EAS — distribution certificate, provisioning profile, APNs key upload, project secret `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- App Store Connect — app record, privacy nutrition labels, age rating, review information, TestFlight internal tester group

---

## Runtime decisions

The spec defers six "Open questions" to execution time. This plan flags each at the step where it gets answered so nothing surprises the implementer mid-run:

| # | Decision | Resolved at | Plan default |
|---|---|---|---|
| 1 | Apple ID for enrollment | Task 1 step 1 | Use existing `sabiondo3101@gmail.com` (same as Play Console). |
| 2 | Privacy policy URL exact form | Task 4 step 3 | Carry over the URL from the Android milestone — confirm by opening the GitHub Pages site. |
| 3 | App Store Connect API key vs interactive `eas submit` | Task 17 step 1 | Interactive on first run; generate the API key later before the second build. |
| 4 | Supabase Apple provider — bundle-ID-only or Services-ID fallback | Task 9 + smoke step 2 | Try bundle-ID-only first; fall back to Services ID if smoke step 2 fails. |
| 5 | Voice-journal upload status (App Privacy form) | Task 14 step 4 | Confirm "recorded on device, never uploaded" still holds — grep `mobile/src` for upload paths. |
| 6 | Skip Task 5 (listing copy) and address just-in-time in Task 13? | Task 5 step 1 | Default: do Task 5 — 30 minutes now saves context-switching later. |

---

## Phase 0: Enrollment + parallel prep

Phase 0 exists because Apple Developer Program approval is a 24–48h+ external block. Tasks 1–6 below can run in parallel with Apple's review queue. None of them require an active Apple Developer Program account.

---

## Task 1: Submit Apple Developer Program enrollment

**Files:** none (external system only)

**Why:** Phase 1 cannot start without enrollment approval. Submit this first so the wait runs in parallel with the other Phase 0 tasks.

- [ ] **Step 1: Decide which Apple ID owns the account**

Default: `sabiondo3101@gmail.com` (same as Play Console publisher). Trade-off: easier to manage one identity vs. cleaner separation with a dedicated `homesquad-dev@`. The existing one is the path of least friction and the rest of this plan assumes it.

- [ ] **Step 2: Submit enrollment**

Sign in to <https://developer.apple.com/programs/enroll> with the chosen Apple ID. Enrollment type: **Individual** — $99/year. (Organization needs a D-U-N-S number and weeks of review; not justified for a solo project. Publisher name on App Store will be your legal name.)

- [ ] **Step 3: Note the approval ETA**

Approval typically arrives via email within 24–48h; can occasionally take a week. Phase 1 is fully blocked until this email arrives. Move on to Task 2 immediately — do not wait.

---

## Task 2: Create the Google iOS OAuth client

**Files:** none yet (the value gets used in Task 3)

**Why:** Sign In with Google on iOS uses a separate OAuth client from the Android and Web ones. The iOS client only needs the bundle ID, not Apple Developer Program membership, so it is not blocked by Task 1.

- [ ] **Step 1: Create the iOS OAuth client**

Google Cloud Console → APIs & Services → Credentials → **Create Credentials** → OAuth client ID → **iOS**.
- Name: `HomeSquad iOS`
- Bundle ID: `com.homesquad.app`
- Save.

- [ ] **Step 2: Capture both forms of the client ID**

Save the Client ID — value looks like `1234567890-abcd1234.apps.googleusercontent.com`.

Compute the reversed form: `com.googleusercontent.apps.1234567890-abcd1234`. This is what goes in `mobile/app.json` as `iosUrlScheme`.

- [ ] **Step 3: Set the EAS secret for the client ID**

From `mobile/`:
```
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <forward-client-id>
```
Use the forward (`...apps.googleusercontent.com`) form, not the reversed form. `mobile/src/lib/auth.ts:6` reads this via `process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

If a secret of the same name already exists, run `eas secret:list --scope project` first — replace only if the placeholder is still in there.

---

## Task 3: Update `mobile/app.json` for iOS

**Files:**
- Modify: `mobile/app.json`

**Why:** Two changes need to land in the same edit: (a) replace the `iosUrlScheme` placeholder with the real reversed iOS client ID from Task 2, (b) declare `ios.config.usesNonExemptEncryption: false` so Apple does not prompt about encryption export compliance on every TestFlight upload.

**Spec clarification:** The spec shows the same `ios` block in 0.E and 1.E. They are the same single edit — 1.E in the spec is just a verification, not a second edit.

- [ ] **Step 1: Edit `mobile/app.json` — iosUrlScheme and export-compliance**

Apply this diff:

```diff
     "ios": {
       "supportsTablet": true,
       "bundleIdentifier": "com.homesquad.app",
-      "usesAppleSignIn": true
+      "usesAppleSignIn": true,
+      "config": {
+        "usesNonExemptEncryption": false
+      }
     },
```

And:

```diff
       [
         "@react-native-google-signin/google-signin",
         {
-          "iosUrlScheme": "com.googleusercontent.apps.000000000000-placeholder"
+          "iosUrlScheme": "com.googleusercontent.apps.<your-id-here>"
         }
       ],
```

Use the reversed form from Task 2 step 2.

- [ ] **Step 2: Verify the JSON parses**

From `mobile/`: `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('ok')"`.

HomeSquad uses only standard HTTPS via Supabase, which qualifies for the export-compliance exemption — declaring `usesNonExemptEncryption: false` is accurate.

---

## Task 4: Update the privacy policy for iOS + Apple Sign In

**Files:**
- Modify: `docs/privacy-policy.md`
- Regenerate: `docs/privacy-policy.html`

**Why:** App Store Connect requires a Privacy Policy URL. The current policy (last updated 2026-05-25) was written for the Android Play Store launch — no mention of Apple, no mention of Hide My Email relay, the Important callout only references the Play Store listing.

- [ ] **Step 1: Edit `docs/privacy-policy.md`**

Four small edits:

1. **Bump "Last updated"** from `2026-05-25` to today (or whatever the actual edit date is).
2. **Account identifier paragraph** (currently lines 17–20) — append a sentence:
   > *When you sign in with Apple, you can choose "Hide My Email" — Apple gives us a relay address (`*@privaterelay.appleid.com`) instead of your real email; messages sent to that relay are forwarded by Apple per Apple's policy.*
3. **Important callout** (currently lines 9–11) — change "the Google Play Store listing" to "both the Google Play Store and the Apple App Store listings".
4. **Third parties section** (currently lines 42–48) — add an Apple bullet, parallel to the existing Google bullet:
   > *- **Apple Sign In** — used only when you choose to sign in with Apple. Apple's policy applies to the data Apple itself handles on your behalf, including the Hide My Email relay if you use it.*

- [ ] **Step 2: Regenerate `docs/privacy-policy.html`**

Check how the Android milestone regenerated the HTML — if there is a script or a documented command, reuse it. If it was a manual conversion, run any markdown-to-HTML tool that preserves the existing HTML page's structure (the existing `.html` was committed in the Android launch, so the conversion path is whatever produced that file). Quickest path is usually `pandoc privacy-policy.md -o privacy-policy.html --standalone --metadata title="HomeSquad Privacy Policy"`.

- [ ] **Step 3: Confirm the live URL**

The privacy policy is served at `https://carlosgomez.github.io/Shores/privacy-policy.html` (confirm by opening the URL — the Android milestone established it). This URL will be used in Task 13 (App Privacy / App Store Connect).

- [ ] **Step 4: Commit**

Commit the `.md` + `.html` together. Wait until the GitHub Pages deploy completes before quoting the URL in App Store Connect.

---

## Task 5: Draft App Store Connect listing copy

**Files:** none (text the implementer will paste into App Store Connect in Phase 2)

**Why:** App Store Connect requires a few short text fields even for a TestFlight-internal-only build. Drafting them now means Phase 2 is paste-only.

**Skip option:** If saving 30 minutes matters and you would rather paste these directly into the App Store Connect form in Task 13, skip this task. The plan assumes you do it. Either is fine.

- [ ] **Step 1: Draft the required text**

Capture in a scratch file or paste buffer:

| Field | Value |
|---|---|
| App name | `HomeSquad` |
| Primary language | `English (U.S.)` |
| Bundle ID | `com.homesquad.app` (will be selectable from dropdown after Task 7) |
| SKU | `homesquad-ios-001` |
| What to Test (per build) | *First internal iOS build — Apple + Google sign-in, family setup, chores, rewards, push notifications.* |
| Beta App Feedback Email | `sabiondo3101@gmail.com` |
| Marketing URL / Support URL | The GitHub Pages site URL from Task 4 step 3 (optional) |

Deferred (not required for TestFlight internal): subtitle, beta app description, screenshots, full app description, keywords, app preview videos.

---

## Phase 1: Apple-Dev-blocked config

**Prerequisite:** Apple Developer Program approval email received (Task 1 completed). Do not start Tasks 6–10 until this email is in your inbox.

---

## Task 6: Create the App ID in the Apple Developer portal

**Files:** none

**Why:** Every other Phase 1 task — APNs key, EAS credentials, Supabase Apple provider, and the production build — references this App ID. It must exist first.

- [ ] **Step 1: Create the App ID**

Apple Developer portal → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **App IDs** → **App**.
- Description: `HomeSquad`
- Bundle ID: **Explicit**, `com.homesquad.app`

- [ ] **Step 2: Enable capabilities**

Enable both:
- **Sign In with Apple** — required because we also offer Google sign-in (App Store Review Guideline 4.8)
- **Push Notifications**

Save.

- [ ] **Step 3: If `com.homesquad.app` is already taken**

Bundle IDs are globally unique across Apple's namespace. If the form rejects `com.homesquad.app`, the fallback bundle ID is `app.homesquad.com`. This would require auditing `mobile/app.json`, the Google iOS OAuth client (Task 2), and the Supabase Apple provider (Task 9) and updating each — surface this to the user before continuing. The Android milestone already shipped with `com.homesquad.app`, so this is unlikely but not impossible.

---

## Task 7: Generate the APNs authentication key

**Files:** none (the `.p8` is stored in 1Password and uploaded to EAS)

**Why:** Push notifications on iOS need an APNs auth key (`.p8`). Expo's push relay forwards through APNs — without this key, push tokens generate but no notification ever delivers.

- [ ] **Step 1: Check if the team already has an APNs key**

Apple Developer portal → **Keys**. One APNs key is valid team-wide for all apps under that Team ID. If one already exists and you have the `.p8` archived, skip steps 2–4 and go straight to step 5.

- [ ] **Step 2: Create a new key**

Apple Developer portal → **Keys** → **+**.
- Name: `HomeSquad APNs`
- Enable: **Apple Push Notifications service (APNs)**

Save.

- [ ] **Step 3: Download the `.p8` file IMMEDIATELY**

Apple only lets you download the `.p8` once. Save it to 1Password (or your secrets store) the moment it downloads. Do not commit it.

- [ ] **Step 4: Capture the Key ID and Team ID**

- Key ID is shown on the key detail page after creation
- Team ID is on every page header of the developer portal

Store both alongside the `.p8` in 1Password.

- [ ] **Step 5: Upload to EAS**

```
eas credentials -p ios
```
Navigate: **Push Notifications: Manage your Apple Push Notifications Key** → upload the `.p8`, enter Key ID and Team ID. EAS will then embed it in every iOS production build.

---

## Task 8: EAS credentials — distribution certificate + provisioning profile

**Files:** none (EAS manages)

**Why:** EAS needs a distribution certificate and an App-ID-bound provisioning profile to sign production iOS builds. Letting EAS auto-generate both removes a class of manual cert/profile churn.

- [ ] **Step 1: Generate the distribution credentials**

```
eas credentials -p ios
```
Walk through:
- **Distribution Certificate** → choose **Let EAS manage** (auto-generates)
- **Provisioning Profile** → choose **Let EAS manage** (auto-generates against the App ID from Task 6)

EAS will surface the APNs key uploaded in Task 7 step 5 in the same flow.

After this task: the iOS production EAS profile is self-sufficient — no manual cert/profile juggling.

---

## Task 9: Enable Supabase Apple auth provider

**Files:** none (Supabase Dashboard)

**Why:** `mobile/src/lib/auth.ts:49` calls `supabase.auth.signInWithIdToken({ provider: 'apple', token })`. Supabase rejects this call until the Apple provider is enabled and an authorized client ID is registered.

**Native vs web flow:** HomeSquad uses **native** Sign In with Apple (the iOS sheet, not OAuth in a webview). For the native flow, the identity token's `aud` claim is the bundle ID, so Supabase only needs the bundle ID. The Services ID + Team ID + Key ID + `.p8` fields in the Supabase form are for **web** Sign In with Apple — leave them blank on the first attempt.

- [ ] **Step 1: Enable Apple provider**

Supabase Dashboard → Authentication → Providers → **Apple** → toggle on.

- [ ] **Step 2: Set Authorized Client IDs**

Add `com.homesquad.app`. Save.

- [ ] **Step 3: Note the fallback path**

If smoke step 2 (Task 11) fails with a Supabase error during Apple sign-in, the fallback is:
- Create a Services ID (e.g., `com.homesquad.app.signin`) in the Apple Developer portal → **Identifiers** → **+** → **Services IDs**, enable Sign In with Apple on it
- Provide Services ID + Team ID + Key ID + the `.p8` to the Supabase form

Do not preemptively do this. Try the bundle-ID-only path first.

---

## Task 10: Verify `mobile/app.json` reflects all Phase 1 changes

**Files:**
- Verify: `mobile/app.json`

**Why:** Phase 1 added portal-side state; the only repo-side check is that Task 3's `app.json` edits are still in place and nothing else has drifted.

- [ ] **Step 1: Confirm the final `ios` block**

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

- [ ] **Step 2: Confirm the `iosUrlScheme` is the real value**

In the `@react-native-google-signin/google-signin` plugin entry, the `iosUrlScheme` should be the reversed form from Task 2 step 2 — no `placeholder` string anywhere in the file.

```
grep -n "placeholder" mobile/app.json
```
Expected: no output.

---

## Task 11: Phase 1 → Phase 2 gate — 9-item smoke test

**Files:** none (this is a verification gate, not a code change)

**Why:** Every Phase 2 task is wasted work if Phase 1 has an App-ID-capability, Apple-provider, or APNs misconfiguration. Gate cost is one EAS iOS build (~20 min); skipped-gate cost is a TestFlight build that uploads cleanly but breaks sign-in or push for every tester.

- [ ] **Step 1: Build the preview iOS `.ipa`**

```
eas build --profile preview --platform ios
```
Preview profile is already configured for internal distribution; iOS simulator off. Wait ~20 min for the build.

- [ ] **Step 2: Install the build**

Two paths (real device strongly preferred — only a real device exercises the Apple Sign In, push, and App Store install paths end-to-end):
- **Real iPhone:** EAS-provided install link from the build page (works because preview is internal distribution and the device UDID is registered with EAS), OR plug into a Mac and drag-and-drop the `.ipa` via Apple Configurator 2
- **No iPhone:** rebuild as a simulator build (`eas build --profile development --platform ios` with `ios.simulator = true` temporarily) and drop into a friend's Mac iOS Simulator, OR pay for a MacInCloud session, OR skip this gate and use TestFlight (Phase 2) as the real-device test channel

If skipping to TestFlight: surface this trade-off to the user before continuing. The risk is that a TestFlight build fails for all testers instead of just for you.

- [ ] **Step 3: Run the 9-item smoke checklist — ALL must pass**

1. **Cold launch** — app opens, lands on welcome, no red error box.
2. **Apple sign-up** — tap Apple → native Apple sign-in sheet → choose "Share My Email" or "Hide My Email" → land on `(onboarding)/create-family`. If this fails, return to Task 9 step 3 (Services-ID fallback).
3. **Family creation** — create a family, add one kid profile. Confirm rows in the Supabase cloud dashboard. Confirm the stored email is either the real email or the `*@privaterelay.appleid.com` relay (both valid).
4. **Sign out → Apple sign-in again** — sign out, tap Apple → land on `(app)` home (existing-user path, not re-onboarding).
5. **Google sign-up** — separate fresh account; same end state as item 2.
6. **Email/password fallback** — sign up a third user with email+password.
7. **Push token registration** — after sign-in, confirm `app.settings.*` row in Supabase has a push token. iOS tokens start with `ExponentPushToken[...]` (Expo's relay format; different from Android FCM tokens).
8. **Realtime smoke** — create a chore on parent side → appears on kid side without manual refresh.
9. **Deep link** — trigger a password-reset email → tap link in email → app opens to the reset screen (validates `homesquad://` scheme works on iOS).

- [ ] **Step 4: Failure handling**

If any item fails, fix the underlying portal/code/Supabase config and rebuild from step 1. **Do not proceed to Phase 2 until all 9 pass.**

**What this gate does NOT verify:** behavior on a TestFlight-installed build vs. a sideloaded preview build. The two share the same `.ipa`-level config, but TestFlight adds App Store Connect metadata and the TestFlight install path. The final TestFlight smoke happens in Task 18.

---

## Phase 2: TestFlight internal track

**Prerequisite:** All 9 smoke items in Task 11 passed.

---

## Task 12: Create the App Store Connect app record

**Files:** none (App Store Connect)

**Why:** `eas submit` uploads to App Store Connect, which needs an app record with a bundle ID matching the EAS-built `.ipa`. The bundle ID dropdown in this form is populated from App IDs registered in Phase 1 — Task 6 must be done first.

- [ ] **Step 1: Create the app**

<https://appstoreconnect.apple.com> → My Apps → **+** → **New App**.
- Platforms: iOS
- Name: **HomeSquad**
- Primary language: English (U.S.)
- Bundle ID: select `com.homesquad.app` from the dropdown (populated from Task 6)
- SKU: `homesquad-ios-001`
- User Access: Full Access

Create.

---

## Task 13: Privacy nutrition labels (App Privacy)

**Files:** none (App Store Connect)

**Why:** App Store Connect requires every app to declare data collection categories. The form blocks build submission until completed.

- [ ] **Step 1: Confirm voice journal is still local-only**

Open question from the spec: confirm the voice journal still records on device and never uploads. Grep the mobile codebase for any upload paths involving audio:

```
grep -rn "voice\|journal\|audio" mobile/src --include="*.ts" --include="*.tsx" | grep -iE "upload|storage|insert"
```
Expected: no matches that upload audio to Supabase or any other server. If the implementation has changed since the Android milestone (which made the same claim), update the Audio Data row below from "No" to "Yes" and adjust the rest of the form accordingly.

- [ ] **Step 2: Fill out the App Privacy form**

App Store Connect → your app → **App Privacy** → Get Started.

| Data type | Collected? | Linked? | Tracking? | Purpose |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Device ID (push token) | Yes | Yes | No | App Functionality |
| User-generated content (chore/reward titles, kid names + avatars) | Yes | Yes | No | App Functionality |
| Audio Data (voice journal) | No — recorded on device only, never uploaded | — | — | — |

Encryption in transit: **Yes** (Supabase HTTPS).
Data deletion supported: **Yes** (via email request — same as Play Store data safety).

- [ ] **Step 3: Set the Privacy Policy URL**

Paste the URL confirmed in Task 4 step 3 (`https://carlosgomez.github.io/Shores/privacy-policy.html` or the actual confirmed value).

---

## Task 14: Age rating, content rights, Made for Kids

**Files:** none (App Store Connect)

**Why:** Required before any build can be released, even to internal testers.

- [ ] **Step 1: Age rating questionnaire**

App Store Connect → your app → **Age Rating** → all "No" → app rates **4+**.

- [ ] **Step 2: Content rights**

Declare the app does **not** contain third-party content.

- [ ] **Step 3: Government app + Made for Kids**

- Government app: No
- Made for Kids program: **No** — same reasoning as the Play "not primarily directed at children" declaration. Parents are the primary user; kid mode is parent-mediated.

---

## Task 15: App Review Information (test account)

**Files:** none (App Store Connect)

**Why:** Even though TestFlight internal does not trigger App Review, the App Review Information fields are mandatory up front. A future external TestFlight or App Store submission will trigger review and use these.

- [ ] **Step 1: Choose an existing Supabase test account**

Pick one of the existing Supabase test accounts (email + password). It must be working — Apple may sign in with it during a later review.

- [ ] **Step 2: Fill the App Review Information form**

- Test account email + password
- Notes: *HomeSquad is a family chore-tracker. Sign in with the provided credentials, complete family setup to see the parent dashboard, and use kid mode (PIN: 0000) to see the kid view.*

---

## Task 16: Build production iOS via EAS

**Files:** none (EAS Build)

**Why:** This is the build that gets uploaded to App Store Connect and installed via TestFlight. Reuses the App ID, distribution cert, provisioning profile, and APNs key from Phase 1.

- [ ] **Step 1: Build**

From `mobile/`:
```
eas build --profile production --platform ios
```

- [ ] **Step 2: Verify build metadata**

- `appVersionSource: remote` + `autoIncrement: true` (set in `mobile/eas.json` during the Android milestone) means EAS owns the iOS build number (`CFBundleVersion`). No manual bump needed.
- `version` in `mobile/app.json` (`0.1.1`) becomes the App Store Connect version name (`CFBundleShortVersionString`).
- ~20 min queue + build time.

- [ ] **Step 3: Confirm the build succeeded**

Build page in the EAS dashboard should show "Finished" with the `.ipa` artifact attached.

---

## Task 17: Submit to App Store Connect via `eas submit`

**Files:** none

**Why:** `eas submit` uploads the just-built `.ipa` to App Store Connect via the App Store Connect API. Skips Transporter and Xcode entirely.

- [ ] **Step 1: Decide on auth path**

Default: **interactive** for this first build — `eas submit` will prompt for Apple ID and an app-specific password. Cleaner for the second build onward is to generate an App Store Connect API key (App Store Connect → Users and Access → Keys → App Store Connect API) and add it as an EAS secret. Either works.

- [ ] **Step 2: Submit**

From `mobile/`:
```
eas submit --profile production --platform ios
```
If using interactive, follow the prompts. EAS pulls the last successful build automatically.

- [ ] **Step 3: Wait for Apple processing**

Build appears in App Store Connect → TestFlight tab within ~5–30 minutes. If it stalls past an hour, check the App Store Connect Activity tab for processing errors; if none and still no build after 24h, contact Apple Developer Support.

---

## Task 18: Internal tester group + invite + real-device smoke

**Files:** none

**Why:** This is the milestone-completing step. Internal testers (up to 100, must be members of the App Store Connect team) get the TestFlight invite; you redeem on a real iPhone and run the smoke checklist one more time on the actual TestFlight build.

- [ ] **Step 1: Create the internal tester group**

App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** → group name: `HomeSquad internal`.

- [ ] **Step 2: Add testers**

Add yourself, plus anyone else with an App Store Connect role on the team. Internal testers do not need email verification or invite-link redemption — they get the invite immediately and bypass Beta App Review.

- [ ] **Step 3: Enable the build for the group**

Once Task 17 step 3 shows the build in the TestFlight tab, toggle "Enable" on that build for the `HomeSquad internal` group.

- [ ] **Step 4: Redeem the invite on a real iPhone**

Open the email Apple sent. Open the **TestFlight** app on the iPhone, redeem the code, install HomeSquad.

- [ ] **Step 5: Run the 9-item smoke checklist on the TestFlight-installed build**

Same checklist as Task 11 step 3. Any failure blocks the milestone — fix and rebuild from Task 16. Pay special attention to:
- Push notifications (item 7) — TestFlight uses the production APNs environment, which the preview build also did, but this is the first time the App-Store-Connect-distributed binary runs.
- Deep links (item 9) — same `homesquad://` scheme, but worth a re-verification since TestFlight install paths sometimes interact oddly with custom URL schemes on first install.

---

## Task 19: Tag the commit

**Files:** none (git tag)

**Why:** Mark the release point. The Android internal launch was tagged `m9-android-launch`; pairing iOS as `m9-ios-launch` keeps the M9 release surface consistent.

- [ ] **Step 1: Tag**

```
git tag m9-ios-launch
git push origin m9-ios-launch
```
Alternative tag name is your call at execution time.

---

## Self-Review

Before marking the milestone complete, confirm each of these:

- [ ] All 7 success criteria from the spec are met:
  1. Bundle ID `com.homesquad.app` registered as App ID with Sign In with Apple + Push capabilities (Task 6).
  2. Apple sign-up on real iPhone → `(onboarding)/create-family` (Task 18 step 5 item 2).
  3. Google sign-up on same build → same end state (Task 18 step 5 item 5).
  4. Push notifications deliver on iOS (Task 18 step 5 item 7).
  5. Realtime + `homesquad://` deep link work on iOS (Task 18 step 5 items 8, 9).
  6. TestFlight build appears in TestFlight iOS app for an invited tester and installs cleanly (Task 18 step 4).
  7. Email/password sign-up + sign-in still work (Task 18 step 5 item 6).
- [ ] `mobile/app.json` contains the real iOS Google OAuth reversed client ID — no `placeholder` substring remains.
- [ ] `mobile/app.json` declares `ios.config.usesNonExemptEncryption: false`.
- [ ] `docs/privacy-policy.md` mentions Apple Sign In, the Hide My Email relay, and both store listings in the Important callout. `docs/privacy-policy.html` regenerated and live at the confirmed URL.
- [ ] EAS project secret `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set (forward form).
- [ ] APNs `.p8`, Key ID, and Team ID are stored in 1Password (not in the repo).
- [ ] Supabase Apple provider has `com.homesquad.app` in Authorized Client IDs.
- [ ] App Store Connect record exists, age rating done, App Privacy form complete, App Review Information complete, internal tester group exists with the build enabled.
- [ ] Commit tagged (Task 19).

---

## Follow-ups (NOT part of this milestone)

These are deferred to future milestones — explicit non-goals per the spec's "Out of scope" section. Do not let scope creep pull them in:

- iOS App Store production submission (full App Review, marketing screenshots, app description, keywords, app preview videos)
- External TestFlight + Beta App Review
- Universal Links migration (replace `homesquad://` custom URI scheme — Apple recommends Universal Links for production)
- iPad layout QA (`supportsTablet: true` declared; renders unverified)
- Sentry + crash reporting (still deferred from M7)
- Email verification toggle in cloud Supabase (still deferred from M1)
- Replacing M6 placeholder sound assets
- App Store Connect API key + automated `eas submit` for subsequent builds (interactive on first run is fine)
- Sign In with Apple **server-to-server notifications** endpoint — Apple notifies your server when a user revokes Hide My Email or deletes their Apple ID; only needed once we want to react to revocation
