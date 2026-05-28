# Kid device pairing — Design

**Date:** 2026-05-28
**Owner:** Carlos Gomez
**Status:** Draft (awaiting user review)

## Goal

Let kids aged 8-16 use HomeSquad on their own personal devices without ever requiring a parent's authentication (Google, email/password, or Apple) to be entered on the kid's device. The parent retains full control: they initiate pairing, and they can revoke a paired device at any time.

At milestone end:

- A parent can generate a one-time pairing code from their phone and a kid's device can redeem it to become a permanently paired kid device.
- The kid's device runs HomeSquad in kid-only mode. No parent picker, no profile picker, no exit-kid-mode button.
- The parent's Google/email session never touches the kid's device.
- The parent can list, name, and revoke paired devices per kid from their phone.
- Existing PIN-gated kid mode on the parent's device continues to work unchanged. The two access paths coexist.

## Success criteria

Each is a binary gate.

1. Parent on phone A and kid's phone B (two emulators or two physical devices) can complete the full pairing ceremony in under 30 seconds, with no parent credential entered on phone B at any point.
2. After pairing, phone B can: view the kid's chore list, submit a chore for approval, browse rewards, redeem a reward. All RLS policies allow only the bound kid's data.
3. Sibling impersonation is impossible: a device paired to kid Luna cannot read or write any data belonging to kid Theo, even via direct RPC calls.
4. Parent on phone A can see phone B in `Settings → Kids → Luna → Devices` and revoke it. Within 5 seconds of revoke, phone B's next action fails with an auth error and the app routes to a re-pair screen.
5. Every existing RLS policy continues to pass for parent sessions — no regressions in `families`, `profiles`, `chores`, `chore_instances`, `chore_submissions`, `approvals`, `rewards`, `redemptions`, `achievements`, `app.settings`.
6. Push notifications for the kid (chore reminders, approval pings) deliver to the paired kid device in addition to any existing recipients.

## Out of scope (explicit deferrals)

- Kid-side Google or Apple sign-in for older teens (additive later)
- Remote pairing — parent and kid not co-located (different threat model)
- Multi-kid on one device or kid switcher on a kid device
- Cross-family kids (joint custody, shared parenting)
- Moving a paired device to another kid without revoke + re-pair
- Self-service unpair on the kid device (parent revokes only)
- Voice-journal cross-device sync
- Web parent console for revoke-when-parent-loses-phone
- Migration of an existing kid profile's PIN-mode usage data — pairing a device is a new authorization, not a migration

## Architecture overview

```
Parent's phone (parent mode)              Kid's phone (first launch)
────────────────────────────              ─────────────────────────
Settings → Kids → Luna                    "Pair this device"
  → "Pair a device"                          [QR scanner viewfinder]
                                             [— or — enter 6-digit code]

  start_device_pairing(kid_id)
       ↓                       (5 min, single-use)
  shows 6-digit code + QR  ─────────────────►  scan / type code
                                                   ↓
                                          (anonymous Supabase sign-in
                                           if no session yet)
                                                   ↓
                                          redeem_device_pairing(code,
                                                                device_name)
                                                   ↓
                              ◄────  inserts kid_devices row linking
                                       auth.uid() → kid_id
                                                   ↓
                                          Land on Luna's kid-mode home
                                          (existing /(app)/kid/[id])
```

### Auth mechanism: Supabase Anonymous Auth

The kid's device gets a real Supabase session. The underlying `auth.users` row has no email, password, or identifying data — it is a UUID acting as a device credential. We link that UUID to a `kid_id` in a new `kid_devices` table.

Why anonymous auth instead of a custom JWT:

- Supabase handles refresh, expiry, and revoke for us. No JWT signing infrastructure to build.
- Revoke is `auth.admin.deleteUser(user_id)` — instant, no waiting for token TTL.
- It is a real Supabase session, so existing client code (realtime, RPCs, storage uploads) works unchanged.
- "Anonymous user" is misleading shorthand: these are first-class authenticated users without an identifier. The kid's *identity* still lives in `profiles` (unchanged). The anon user is purely a session credential bound to the device.

### Coexistence with today's PIN model

Nothing about the existing parent-device kid mode changes. A kid profile can be reached two ways:

- PIN-gated on a parent device (today, via `mobile/app/(app)/index.tsx`).
- A paired kid device (new).

The two share zero auth state. A kid may have either, both, or neither.

### Threat model addressed

- Parent's Google / email / Apple credential never enters the kid's device → no leakage of Gmail, Family Link, Play Store, parental-control apps, or any other parent OS-level account.
- Kid session can read and write only rows for its bound `kid_id`, enforced server-side by RLS.
- Lost device → parent revokes from their phone → kid session refresh fails immediately.
- Sibling impersonation impossible: device is bound to exactly one `kid_id` via a `unique` constraint on `kid_devices.user_id`.

## Data model

### New tables

```sql
-- 1) Outstanding pairing codes. Short-lived, single-use.
create table public.kid_pairing_codes (
  code         char(6)     primary key,         -- numeric, zero-padded
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  issued_by    uuid        not null references auth.users(id),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index on public.kid_pairing_codes (expires_at)
  where used_at is null;

-- 2) Active kid devices. One row per paired device.
create table public.kid_devices (
  id           uuid        primary key default gen_random_uuid(),
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  device_name  text        not null,
  push_token   text,
  paired_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

create index on public.kid_devices (kid_id) where revoked_at is null;

-- 3) Rate-limit counter for the brute-force surface (see Rate limiting below).
create table public.pairing_redeem_attempts (
  ip            inet        not null,
  attempted_at  timestamptz not null default now()
);

create index on public.pairing_redeem_attempts (ip, attempted_at);
```

`family_id` is denormalized on both domain tables so RLS lookups are one hop, not two. `kid_devices.user_id` is `unique` so one anon auth row = exactly one kid device. `on delete cascade` on `user_id` means that deleting the auth user (the revoke path) also drops the `kid_devices` row.

### RLS extensions

```sql
-- Modified: resolves to a family for parent OR kid sessions.
create or replace function public.current_family_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select family_id from public.profiles
    where user_id = auth.uid() and type = 'parent'
  union all
  select family_id from public.kid_devices
    where user_id = auth.uid() and revoked_at is null
  limit 1
$$;

-- New: returns kid_id for kid sessions, NULL for parent sessions.
create or replace function public.current_kid_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select kid_id from public.kid_devices
    where user_id = auth.uid() and revoked_at is null
    limit 1
$$;
```

Existing SELECT policies (all keyed on `current_family_id()`) start working for kid sessions automatically. Write policies on kid-actionable tables (chore_submissions, redemption_requests, celebration cursors) get an additional `actor_kid_id = current_kid_id()` check so a kid session can only act *as itself*, not as a sibling. The exact list of policies to extend is enumerated in the implementation plan.

## Server RPCs

| RPC | Caller | Returns |
|---|---|---|
| `start_device_pairing(kid_id uuid)` | parent session | `(code text, expires_at timestamptz)`. Validates `kid_id` belongs to caller's family; generates a 6-digit code with retry-on-collision; inserts `kid_pairing_codes` with 5-minute expiry. |
| `redeem_device_pairing(code text, device_name text)` | anonymous session | `kid_id uuid` on success. Validates code (not expired, not used), marks `used_at`, inserts `kid_devices` row linking `auth.uid()` → `kid_id`. Single error message `"Invalid or expired code"` on any failure path to prevent enumeration. Idempotent: re-submitting the same code from the same `auth.uid()` returns success if a `kid_devices` row already exists. |
| `revoke_kid_device(device_id uuid)` | parent session | void. Validates the device belongs to caller's family; calls `auth.admin.deleteUser(user_id)` — the `on delete cascade` removes the `kid_devices` row. |

`redeem_device_pairing` is `security definer` so it can run from an anonymous session without needing to be authenticated as the family owner. It still enforces every check server-side; the anon session is never trusted for authorization, only for identity.

### Rate limiting and brute-force resistance

`redeem_device_pairing` is the brute-force surface. With 6 digits there are 1M possible codes; with N outstanding codes the chance of hitting one in a random guess is N/1M. In practice N is 1-3 at most.

Mitigations:

- Per-IP edge rate limit (Supabase project setting): 5 attempts per minute per IP.
- RPC-level attempt counter table (`pairing_redeem_attempts(ip, attempted_at)`); after 10 failures within 10 minutes from one IP, all subsequent redeems from that IP return the same generic error without checking the code.
- Codes expire in 5 minutes and are single-use, so the brute-force window per code is very short.

## Client UX

### Parent side

In `Settings → Kids → [Luna]`, add a **Devices** section:

```
DEVICES
─────────────────────────
📱 Luna's iPad        ⋯
   Last seen 2 min ago

+ Pair a new device
```

Tapping "+ Pair a new device" opens a modal:

```
┌────────────────────────┐
│   PAIR LUNA'S DEVICE   │
│                        │
│    ┌──────────┐        │
│    │ QR code  │        │
│    │ image    │        │
│    └──────────┘        │
│                        │
│      4 8 2  6 1 9      │
│                        │
│   Code expires in 4:23 │
│      [   Cancel   ]    │
└────────────────────────┘
```

Parent's app subscribes via Supabase realtime to `kid_devices` inserts filtered by the kid's id. On the matching insert, the modal flips to `"✓ Paired to {device_name}"` and auto-dismisses after 2 seconds. Each existing device row has a `⋯` menu → "Revoke" with a confirm dialog ("Luna won't be able to use the app on this device until it's paired again.").

### Kid side

First launch with no session, or session for a deleted anon user → **Pair this device** screen:

```
┌────────────────────────┐
│   PAIR THIS DEVICE     │
│                        │
│   [camera viewfinder]  │
│                        │
│   Point at the QR code │
│    on a parent's phone │
│                        │
│  ── or type the code ──│
│      [ _ _ _ _ _ _ ]   │
│                        │
└────────────────────────┘
```

On success → existing `/(app)/kid/[kid_id]` flow, no changes. On failure → "Invalid or expired code. Ask a parent for a new one." (single error message; never reveals which validation failed).

A paired kid device has **no** profile picker, **no** parent-mode picker entry, **no** exit-kid-mode button. The device is permanently a kid device until the parent revokes it. The kid Settings screen shows a passive "This device is paired" indicator but no unpair control.

### Camera permission

The QR scanner needs `expo-camera`. Permission is requested on first opening the pair screen. If the user denies, the "type the code" path remains available — the camera is a UX accelerator, not the only path.

## Edge cases

| Situation | Behavior |
|---|---|
| Parent revokes while kid is mid-action | Next RPC returns auth error → app routes to "This device was unpaired" → "Pair again" button |
| Code expires while kid is typing | Standard invalid-code error; parent regenerates from their phone |
| Used code re-scanned | Same single error message; no enumeration leak |
| Network drop during redeem | Retry; the idempotency check (matching `used_at` + `kid_devices.user_id`) returns success instead of re-failing |
| Kid uninstalls and reinstalls | SecureStore is wiped → re-pair required (intended — reinstall should require parent action) |
| Sibling steals the device and acts as Luna | Possible — device = access. Same physical-trust model as Luna's phone today |
| Parent kills the pair modal before kid scans | Code remains valid until expiry; kid can still redeem within the 5-minute window |
| Kid scans an unrelated QR code | RPC returns `"Invalid or expired code"`; no crash |
| Kid device clock skew | Server-side `expires_at` is authoritative; client clock doesn't matter |

## Push notifications

`kid_devices` includes a nullable `push_token` column. The kid app's existing post-sign-in push registration (today: `set_push_token` writes to `app.settings`) is extended for kid sessions to write the token onto the paired `kid_devices` row instead.

Existing fan-out triggers (chore reminders, approval pings) extend their recipient query to a union: the kid's `app.settings` token (today's parent-device PIN-mode path) plus every paired `kid_devices.push_token` for that kid. No new trigger logic — just an extra UNION inside the recipient CTE. The exact triggers to extend are enumerated in the implementation plan.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Modifying `current_family_id()` breaks existing RLS in subtle ways | Medium | High | RLS regression matrix covering every policy × (parent / kid / no session) — codified as Postgres tests, must pass before merging |
| Orphaned anon `auth.users` (kid_devices row deleted but user row left) appears "logged in but broken" | Low | Medium | `revoke_kid_device` deletes the auth user; `on delete cascade` on `kid_devices.user_id` removes the row. Single atomic operation. |
| Anon auth users count toward Supabase MAU pricing | Low (early stage) | Low | Monitor; revisit if MAU becomes a material cost line |
| 6-digit code brute force at the redeem endpoint | Low | High if successful | Per-IP rate limit + per-IP attempt counter; 5-min single-use codes |
| Parent loses their phone, can't revoke a kid device | Low | Medium | Acceptable scope-wise — kid device still only sees own family data. Future web parent console solves long-term |
| Camera permission denied on kid device → no QR scan | High (some kids will deny) | Low | "Type the code" fallback is always available; not blocking |
| Realtime notification of pair-completion fails on parent phone (e.g., poor connection) | Medium | Low | Modal countdown still works; parent can dismiss and check device list to confirm |

## Testing

### Postgres unit tests (pgTAP or plain SQL)

- `start_device_pairing` — parent caller succeeds; non-parent caller (anon or kid) fails; foreign kid_id fails; returns code in 6-digit range; expires_at is ~5 min out
- `redeem_device_pairing` — valid code succeeds; expired code returns generic error; already-used code returns generic error; non-anon caller fails; idempotent re-submission from same user returns success
- `revoke_kid_device` — parent caller succeeds and removes auth user; non-parent caller fails; foreign device_id fails

### RLS regression matrix

For each existing policy on (families, profiles, chores, chore_instances, chore_submissions, approvals, rewards, redemptions, achievements, app.settings):

- Parent session in family A: expected access to family A rows, denied for family B
- Kid session bound to kid X in family A: expected access matrix (read all family A, write only as X)
- Kid session bound to kid Y in family A: cannot act as X
- Anonymous session not in `kid_devices`: denied on everything
- No session: denied on everything

Codified as a single test file that runs all combinations.

### Mobile integration test

End-to-end on two emulators:

1. Parent emulator: sign in, navigate to Settings → Kids → Luna, tap "Pair a new device", observe code modal.
2. Kid emulator: open app fresh install, observe Pair screen, type the 6-digit code.
3. Parent emulator: observe modal flips to "✓ Paired".
4. Kid emulator: observe Luna's kid-mode home.
5. Kid emulator: complete a chore, observe approval queued.
6. Parent emulator: navigate to Approvals, observe the submission.
7. Parent emulator: revoke the kid device.
8. Kid emulator: tap any action, observe "This device was unpaired" routing.

### Manual gate before milestone close

- Two Pixel-7-API-34 emulators side by side, run the full ceremony.
- Confirm no Google account is added to the kid emulator's OS account list at any point.
- Confirm `pm list packages` on the kid emulator does not include any HomeSquad parent session storage.

## Open questions (resolved at execution time, not blocking spec approval)

1. **Pairing code format** — 6 digits is the spec choice. Considered alternatives: word triplets (correct-horse-battery — easier to remember but harder to type for an 8yo) and 8-digit (more brute-force margin but more typing). Numeric six wins on the youngest-user case.
2. **Camera library** — `expo-camera` (already in the Expo ecosystem) is the default. If a smaller library exists that bundles only the QR scanner, prefer it.
3. **`device_name` source** — `Device.deviceName` from `expo-device` (e.g., "Luna's iPad"). Falls back to "Kid device" if null. Parent can rename later (deferred to v2).
4. **MAU cost monitoring** — at what user count do we want to revisit the anonymous-auth choice? Probably not until 1k+ paired devices; flag for review at that point.

## Follow-ups deferred to future milestones

- Kid-side Google sign-in for older teens (additive)
- Web parent console for revoke-without-phone
- Kid-device renaming from the parent app
- Multi-kid switcher on a single device (sibling sharing one tablet)
- Cross-family / joint-custody kid model
- Self-service unpair on kid device with parent confirmation
