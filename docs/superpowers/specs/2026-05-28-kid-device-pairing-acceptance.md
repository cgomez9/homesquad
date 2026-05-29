# Kid device pairing — manual acceptance gate

**Status:** TODO — to be run by Carlos before merging m10 to main

The full backend + mobile implementation is complete (commits on branch `m10-kid-device-pairing`). The remaining gate is a two-emulator (or one emulator + one device) walkthrough that the subagent flow cannot run.

## Pre-flight

Before starting the walkthrough, complete the cloud-side toggle:

- [ ] **Supabase cloud dashboard** → Authentication → Providers → Anonymous Sign-Ins → enable
- [ ] **EAS** → verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set on the build profile (already done as part of m9; no change expected)

## Build

- [ ] `cd mobile && eas build --profile preview --platform android` — produces a signed APK
- [ ] Wait for the build to complete (~15 min); download the APK

## Emulator setup

- [ ] Boot two Pixel-7-API-34 emulators side by side. If you only have one AVD, clone it via `avdmanager create avd -n Pixel_7_API_34_2 -k '...'` or use one emulator + one physical Android device.
- [ ] Install the APK on both via drag-and-drop.

## Walkthrough — 16-item gate

| # | Step | Pass? |
|---|------|---|
| 1 | Cold-launch on Emulator A → land on welcome → sign in as parent | [ ] |
| 2 | Navigate Settings → Devices section per kid → tap "+ Pair a new device" for Luna → 6-digit code + QR visible | [ ] |
| 3 | Cold-launch on Emulator B → land on Pair This Device screen | [ ] |
| 4 | Type the 6-digit code from Emulator A into Emulator B | [ ] |
| 5 | Emulator B routes to Luna's kid-mode home within 3 seconds | [ ] |
| 6 | Emulator A modal flips to "Paired" (via realtime subscription) and dismisses | [ ] |
| 7 | Emulator B chore list shows Luna's chores (data exists from parent setup) | [ ] |
| 8 | Emulator B: tap an auto-verified chore → status flips to approved; star count updates | [ ] |
| 9 | Emulator A: refresh Approvals tab → no submission for auto chore (correct) | [ ] |
| 10 | Emulator B: tap an approval-mode chore → status submitted | [ ] |
| 11 | Emulator A: Approvals tab shows the submission | [ ] |
| 12 | Emulator A: approve the submission → Emulator B sees star count update (realtime) | [ ] |
| 13 | Emulator A: Settings → Devices → tap Unpair on Luna's device → confirm | [ ] |
| 14 | Emulator B: tap any chore → routed to re-pair screen | [ ] |
| 15 | **OS check:** Emulator B → Settings → Accounts → confirm NO Google account associated with HomeSquad parent | [ ] |
| 16 | **DB check:** `psql ... -c "select count(*) from profiles where user_id = '<emulator B anon uid>'"` returns 0 (no profile row created for the anon kid session) | [ ] |

## Final actions when all 16 pass

- [ ] Tag the branch: `git tag m10-kid-device-pairing`
- [ ] Merge to main (fast-forward or merge commit — your call)
- [ ] Push the tag + main to origin

## If any step fails

Document the failure inline (which step + observed vs expected), do NOT tag, return to the relevant task on the branch, fix, re-run.

## Implementation summary (for the merge commit body)

- 8 backend migrations (kid_devices schema, kid_pairing_codes, rate-limit table, current_family_id extension, current_kid_id helper, start/redeem/revoke RPCs, complete_chore + set_push_token kid-session acceptance, request_redemption kid-session acceptance, 8 RLS policy extensions for kid SELECT access)
- RLS regression matrix at supabase/tests/54_rls_regression_matrix.sql (40/40)
- Anonymous Auth enabled in supabase/config.toml (cloud dashboard step pending — see Pre-flight above)
- Mobile: pairing.ts library, PairCodeInput, PairThisDevice screen, root routing for kid sessions, KidDevicesList, PairDeviceModal with realtime, Devices subsection in parent Settings
- expo-camera + react-native-qrcode-svg + react-native-svg added
- Backend test suite: 335/335 passing
- Mobile test suite: 122/122 passing
