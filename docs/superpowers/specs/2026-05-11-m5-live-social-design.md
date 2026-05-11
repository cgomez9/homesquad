# M5 — Live + Social (Realtime + Push + Co-parent Invite) — Design Spec

**Date:** 2026-05-11
**Status:** Approved (pending user review of this written doc)
**Predecessor:** `docs/superpowers/specs/2026-05-09-m4-rewards-redemptions-design.md`, `docs/superpowers/specs/2026-05-05-shores-design.md`
**Successor milestone:** M6 — Gamification Polish (achievements, leaderboard, family co-op goals, juicy feedback)

---

## 1. Scope and milestone boundary

### 1.1 In scope

- **Co-parent invite via 6-digit codes**:
  - New `family_invites` table (code + family + expiry + used-by tracking).
  - `create_family_invite()` RPC — parent-only, returns a 6-digit code; expires 24h after creation.
  - `accept_invite(code, display_name, avatar_id)` RPC — receiving parent joins by entering the code in a new join-family onboarding screen.
- **RLS hardening on `profiles`**:
  - DROP the broad `profiles_update_own_family` UPDATE policy. Closes the M1 known-issue parent-mutation hole that becomes exploitable once co-parent ships.
  - Add a partial unique index `profiles(user_id) where type='parent'` — turns the M1 `create_family` race into a constraint violation rather than a silent data corruption.
  - New `set_push_token(token text)` RPC — the only path to write `profiles.push_token`.
- **Realtime via Supabase `postgres_changes`**:
  - Mobile subscribes per family on `chore_instances`, `redemptions`, and `star_ledger`, filtered by `family_id`.
  - Events invalidate the corresponding TanStack Query keys; UI updates without pull-to-refresh.
- **Push notifications** (Android via Expo Push + FCM; iOS deferred until Apple Developer credentials):
  - Triggers on `chore_instances` and `redemptions` AFTER status transitions fire `pg_net.http_post` to a new `send_push` Edge Function.
  - Edge Function resolves recipient parent `push_token`s and posts to the Expo Push API.
  - 7 event types: chore submitted/approved/rejected + redemption requested/approved/denied/fulfilled.
- **Mobile push UX**:
  - First app launch after onboarding requests notification permission.
  - Token saved via `set_push_token`.
  - Foreground notification handler shows banners while the app is open.
  - `signOut` clears the device's push_token before terminating the session.

### 1.2 Out of scope (deferred)

- **M6**: Achievements catalog + unlock logic, leaderboard (this-week + all-time), family co-op goals, streak milestone pushes (7/30/100 days), juicy feedback (confetti / sounds / haptics).
- **M7 polish**: Quiet hours (9pm–7am queueing per overall spec §7.2), per-event mute settings, push retry queue, account-deletion flow (App Store requirement), Sentry, email verification enabled, deep-linking that opens a specific tab from a push.
- **Cloud-prep slot before M8 ship**: M2 dev-infra carry-overs (cron idempotency, RPC nullable type quirks, gen-types stdout pollution, FK alias verification), the remaining M1 issues (`pin_hash` typing — still plain text; `create_family` race in-function check stays as a friendlier error before the unique index would fire), real cloud Supabase project, iOS push (APNs cert), Sign In with Apple + Google (M1 Tasks 22–23).
- **Magic-link / email-based invite** — code-only for M5. Magic-link is a future polish if beta families complain about typing 6 digits.
- **Revoke / list-active invites** — no UI in M5. Inviter waits 24h for an unwanted code to expire.

### 1.3 Exit criteria

Two-parent + single-kid family can:
1. Parent A signs up, onboards, adds a kid.
2. Parent A → Settings → "Invite a co-parent" → generates and copies a 6-digit code.
3. Parent B signs up with a fresh email, lands on create-family, taps "Have an invite code?" → enters code + display name + avatar → joins the family.
4. Both parents see the same Chores, Rewards, Approvals tabs.
5. Kid completes a chore — BOTH parent devices receive an Android push within ~2s ("Sara submitted Make bed 📸").
6. Parent A approves on their device — Parent B's Approvals tab updates in realtime (no pull-to-refresh).
7. Kid requests a reward — both parent devices push; Parent A denies — Parent B sees the row leave the Approvals tab in realtime.

After acceptance, tag `m5-live-social`.

---

## 2. Data model

### 2.1 New table

```text
family_invites
  id          uuid pk default gen_random_uuid()
  family_id   uuid not null fk → families on delete cascade
  code        text not null unique check (code ~ '^[0-9]{6}$')
  created_by  uuid not null fk → profiles
  created_at  timestamptz not null default now()
  expires_at  timestamptz not null default (now() + interval '24 hours')
  used_by     uuid fk → profiles
  used_at     timestamptz

  index (family_id)
```

The `code ~ '^[0-9]{6}$'` check keeps junk out of the column. `code` has the unique constraint that the `accept_invite` lookup relies on.

### 2.2 New index on existing `profiles` table

```sql
create unique index profiles_one_parent_per_user_idx
  on public.profiles(user_id)
  where type = 'parent';
```

Two effects:
- Makes the M1 `create_family` race non-exploitable. The in-function `EXISTS` check in `create_family` stays as a friendlier error before the index would fire.
- Blocks a user who is already a parent in family A from accepting an invite into family B. (Switching families isn't supported in v1 — sign out and sign up fresh if needed.)

### 2.3 No new columns

`profiles.push_token` already exists from M1. M5 just populates it via `set_push_token`.

### 2.4 Schema design choices

- **6-digit code as the natural lookup key** with a unique index. `accept_invite` queries by code directly.
- **`expires_at` defaults to 24h** at insert time; not configurable in M5.
- **Soft-consumed via `used_by` + `used_at`** rather than deleting the row. Future polish could show "Bob accepted on May 12" in a settings audit view.
- **No `revoke_invite` RPC** — inviter waits 24h or generates a new one (each generation creates a fresh row with its own code).

### 2.5 Migration order

1. `family_invites` table + RLS
2. Partial unique index on `profiles(user_id) where type='parent'`
3. `create_family_invite` RPC
4. `accept_invite` RPC
5. `set_push_token` RPC
6. DROP the `profiles_update_own_family` UPDATE policy
7. `notify_push_chore` trigger function + trigger on `chore_instances`
8. `notify_push_redemption` trigger function + trigger on `redemptions`

Edge Function `send_push` is deployed separately under `supabase/functions/send_push/`.

---

## 3. Server-side logic

### 3.1 `create_family_invite() → text`

`security definer`, parent-only.

```text
1. Resolve caller's parent profile + family. Raise if not a parent.
2. Loop up to 5 times generating a candidate code:
     lpad((floor(random() * 1000000))::text, 6, '0')
   Attempt INSERT INTO family_invites(family_id, code, created_by) values (...).
   On unique-violation on `code`, retry.
3. Return the generated code.
```

No expiry parameter — always 24h.

### 3.2 `accept_invite(code text, display_name text, avatar_id smallint) → uuid`

`security definer`. Caller is the receiving parent who just signed up.

```text
1. caller_user_id := auth.uid(). Raise 'must be authenticated' if null.
2. If caller already has a parent profile anywhere → raise 'already a parent in another family'.
3. SELECT * FROM family_invites WHERE code = $1 FOR UPDATE.
   - Raise 'invite not found' if no row.
   - Raise 'invite expired' if now() > expires_at.
   - Raise 'invite already used' if used_by IS NOT NULL.
4. INSERT INTO profiles(family_id, type, display_name, avatar_id, user_id)
     VALUES (invite.family_id, 'parent', display_name, avatar_id, caller_user_id)
   RETURNING id INTO new_profile_id.
5. UPDATE family_invites SET used_by = new_profile_id, used_at = now() WHERE id = invite.id.
6. Return new_profile_id.
```

`display_name` and `avatar_id` are passed by the receiving parent on the join-family screen.

### 3.3 `set_push_token(token text) → void`

`security definer`. Updates the caller's own profile's `push_token`.

```text
1. caller_profile := profile id of auth.uid(). Raise 'no profile for caller' if null.
2. UPDATE profiles SET push_token = $1 WHERE id = caller_profile.
```

Empty string is a valid input — it clears the token (called from `signOut`).

### 3.4 RLS changes

```sql
-- family_invites
alter table public.family_invites enable row level security;
create policy family_invites_select_own_family on public.family_invites
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = family_invites.family_id)
  );
-- No INSERT/UPDATE/DELETE policies. All writes via SD RPCs.

-- profiles: revoke the broad UPDATE policy
drop policy if exists profiles_update_own_family on public.profiles;
-- SELECT and INSERT policies stay. UPDATEs flow only through set_push_token in M5.
```

### 3.5 Push triggers + `send_push` Edge Function

**Chore trigger** — single `AFTER UPDATE` on `chore_instances` that fires on the three relevant transitions:

```sql
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

**Redemption trigger** — parallel `notify_push_redemption` handles:
- `AFTER INSERT` with `status='pending'` → `redemption_requested`
- `AFTER UPDATE` to `status='approved'` → `redemption_approved`
- `AFTER UPDATE` to `status='denied'` → `redemption_denied`
- `AFTER UPDATE` to `status='fulfilled'` → `redemption_fulfilled`

Payload includes `redemption_id`, `family_id`, `reward_id`, `kid_profile_id`.

**Edge Function** `supabase/functions/send_push/index.ts` (Deno):

```text
1. Verify service-role auth header.
2. Parse event payload.
3. Resolve recipient parent push_tokens:
   SELECT push_token FROM profiles
   WHERE family_id = $1 AND type = 'parent' AND push_token IS NOT NULL AND push_token <> ''.
4. Resolve auxiliary data (kid display_name, chore.title OR reward.title) via Supabase JS client.
5. Build per-event message body:
   - chore_submitted       → "<kid> submitted '<chore>' 📸"
   - chore_approved        → "+<star_value>⭐! Great job on '<chore>' 🎉"
   - chore_rejected        → "'<chore>' needs another look"
   - redemption_requested  → "<kid> wants <reward> (<cost>⭐)"
   - redemption_approved   → "<reward> approved! 🍦"
   - redemption_denied     → "Request for <reward> was denied"
   - redemption_fulfilled  → "🎁 <kid> got their <reward>"
6. POST batch to https://exp.host/--/api/v2/push/send.
7. Return 200 regardless of Expo Push's response (don't block trigger on push failure).
```

The function is best-effort: a network blip is silently absorbed. v1 doesn't ship a retry queue (deferred to M7).

### 3.6 Validation paths that raise

| RPC | Condition | Error |
|---|---|---|
| `create_family_invite` | caller not a parent | `caller is not a parent` |
| `create_family_invite` | 5 retries on code collision | `could not generate unique code` (extremely unlikely; 999,994 codes available) |
| `accept_invite` | unauthenticated | `must be authenticated` |
| `accept_invite` | caller already has parent profile | `already a parent in another family` |
| `accept_invite` | invite code not found | `invite not found` |
| `accept_invite` | invite expired (`now() > expires_at`) | `invite expired` |
| `accept_invite` | invite already consumed | `invite already used` |
| `set_push_token` | caller has no profile | `no profile for caller` |

### 3.7 Deploy-time config

Same `app.settings.functions_base_url` and `app.settings.service_role_key` that the M2 `chore_generator_cron` already requires — `send_push` inherits.

### 3.8 Why this architecture

- **Triggers + pg_net + Edge Function**: matches the Supabase-recommended pattern for outbound webhooks. The RPC stays atomic (the push call is fire-and-forget from the trigger context).
- **No retry queue in v1**: Expo Push API has high availability; the rare failure manifests as a missed notification rather than a corrupted database. v1 doesn't need bulletproofing here.
- **Single trigger per table** with internal branching on status — cleaner than 4 separate triggers per table.

---

## 4. Mobile UI

### 4.1 Onboarding: new join-family screen

`mobile/app/(onboarding)/join-family.tsx`:
- TextField: 6-digit code (numeric input, `maxLength={6}`)
- TextField: display name
- `AvatarPicker` (existing component)
- Submit → `supabase.rpc('accept_invite', { code, display_name, avatar_id })`.
- On success → `refetchFamily()` → root layout redirects to `/(app)` (avatar lock).
- Errors rendered inline ("invite not found", "invite expired", "invite already used", "already a parent in another family").
- Cancel link → `router.back()`.

Plus on `mobile/app/(onboarding)/create-family.tsx`, add a link below the Create button:

```typescript
<Pressable onPress={() => router.push('/(onboarding)/join-family')}>
  <Text style={styles.linkText}>Have an invite code? Join an existing family</Text>
</Pressable>
```

### 4.2 Settings: Invite a co-parent

`mobile/app/(app)/parent/settings.tsx` — replace the existing "Co-parents — coming soon" stub with:

- A row labeled "Invite a co-parent" with a button "Generate code".
- Tap → `create_family_invite()` RPC → success opens a modal with:
  - The 6-digit code, large and centered.
  - Subtitle: "Code expires in 24 hours. Share it with your co-parent."
  - "Copy code" button (uses `Clipboard.setStringAsync` from `expo-clipboard`).
  - "Done" button to dismiss.

Generating again creates a new code each time. No list of past codes in M5.

### 4.3 Push notification permission + token registration

`mobile/src/lib/pushNotifications.ts`:

```text
- registerForPushNotifications(): Promise<string | null>
  1. const perm = await Notifications.getPermissionsAsync()
  2. if (perm.status === 'undetermined') perm = await Notifications.requestPermissionsAsync()
  3. if (perm.status !== 'granted') return null
  4. const token = await Notifications.getExpoPushTokenAsync()
  5. return token.data
- syncPushToken(): Promise<void>
  1. const token = await registerForPushNotifications()
  2. if (token === null) return
  3. await supabase.rpc('set_push_token', { token })
```

Called from `mobile/app/(app)/_layout.tsx` inside a `useEffect` that depends on `auth.status === 'authenticated'`. Runs once per app launch (guarded by a ref). Silent no-op if permission denied — don't pester.

**Global notification handler** in `mobile/app/_layout.tsx`:

```typescript
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

This is set once at module scope, not inside the component.

### 4.4 Realtime subscription

`mobile/src/lib/realtime.ts`:

```text
- subscribeToFamily(familyId: string, queryClient: QueryClient): RealtimeChannel
  - Creates channel `family-${familyId}`
  - Three postgres_changes listeners (filtered by family_id=eq.<familyId>):
    * chore_instances → invalidate ['kid-today'], ['approvals-chores'], ['activity-chores']
    * redemptions      → invalidate ['approvals-redemptions-pending'],
                                    ['approvals-redemptions-approved'],
                                    ['kid-rewards'], ['kid-open-redemptions'],
                                    ['activity-redemptions']
    * star_ledger      → invalidate ['balance'], ['streak']
  - Returns the channel for cleanup
```

Called from `mobile/app/_layout.tsx` inside a `useEffect` that depends on `family.status === 'has-family' && family.familyId`:

```typescript
useEffect(() => {
  if (family.status !== 'has-family') return;
  const channel = subscribeToFamily(family.familyId, queryClient);
  return () => { supabase.removeChannel(channel); };
}, [family]);
```

### 4.5 Sign-out cleanup

`mobile/src/lib/auth.ts` — extend `signOut`:

```typescript
export async function signOut() {
  try {
    await supabase.rpc('set_push_token', { token: '' });
  } catch { /* best-effort */ }
  await supabase.auth.signOut();
}
```

### 4.6 Files touched

| File | Status |
|---|---|
| `mobile/app/(onboarding)/join-family.tsx` | New |
| `mobile/app/(onboarding)/create-family.tsx` | Modified (link to join) |
| `mobile/app/(app)/parent/settings.tsx` | Modified (invite section + modal) |
| `mobile/app/_layout.tsx` | Modified (notification handler + realtime subscribe) |
| `mobile/app/(app)/_layout.tsx` | Modified (push token registration on authed mount) |
| `mobile/src/lib/pushNotifications.ts` | New |
| `mobile/src/lib/realtime.ts` | New |
| `mobile/src/lib/auth.ts` | Modified (clear push_token on signOut) |
| `mobile/src/types/database.ts` | Regenerated |
| `mobile/package.json` | Modified (new deps: `expo-notifications`, `expo-clipboard`, `expo-device`) |

---

## 5. Testing strategy

### 5.1 pgTAP

- **`family_invites` RLS** — cross-family isolation; Alice can't see Bob's invites.
- **`create_family_invite`** — happy path returns 6-digit code matching `^[0-9]{6}$`; caller must be a parent; row inserted with 24h expiry.
- **`accept_invite`** — happy path inserts profile + marks used; expired raises; already-used raises; already-a-parent raises (partial index); code-not-found raises.
- **`set_push_token`** — happy path updates own profile; empty string clears; no-profile caller raises.
- **Profile UPDATE policy revocation** — direct UPDATE on `profiles` from `authenticated` role affects 0 rows (RLS-silent), `type` value unchanged.
- **Partial unique index** — second INSERT of a parent profile for the same `user_id` raises a unique-violation.

Approximate net-new test count: ~15 across 6 new test files.

### 5.2 Jest

Two new tests for `mobile/src/lib/pushNotifications.ts`:
- `registerForPushNotifications` returns null on denied permission.
- `syncPushToken` calls `set_push_token` RPC with the returned token.

Realtime subscription module not unit-tested in M5 — too much `RealtimeChannel` mocking. Covered by manual acceptance.

Jest total: ~22 (M4's 20 + 2 new).

### 5.3 Edge Function

`send_push` smoke-tested manually:

```bash
npx supabase functions serve send_push --no-verify-jwt
curl -X POST http://127.0.0.1:54321/functions/v1/send_push \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event":"chore_submitted","family_id":"<uuid>","instance_id":"<uuid>"}'
```

Verifies the function logs an Expo Push API call. No automated test in M5 (would require mocking `fetch`).

### 5.4 Manual M5 acceptance

1. **Co-parent invite end-to-end** — Parent A creates family + kid; Parent A → Settings → "Invite a co-parent" → copies code; sign out; Parent B signs up fresh → onboarding "Have an invite code?" → enters code → joins; sign back in as Parent A — both see the same chores/rewards/approvals.

2. **Realtime in-app updates** — Parent A on Approvals tab; switch to kid via avatar lock → kid taps Done on a chore; switch back to parent → Approvals shows the submission without pull-to-refresh (within ~2s).

3. **Push notifications (Android, with Google Play Services)** — Background Parent B's app on a Pixel emulator. Drive a chore submission from Parent A's device. Within ~2s, Parent B's emulator receives a push: "Sara submitted Make bed 📸". Tap → app opens (deep-link to Approvals tab is M7 polish).

4. **RLS hardening verification** — In psql, simulate Parent B trying to UPDATE Parent A's profile to flip type → 0 rows affected (silent RLS). `\d public.profiles` confirms `profiles_update_own_family` is gone. Second parent-profile INSERT for the same user_id raises a unique-violation.

5. **Sign-out push cleanup** — Parent A signs out. In psql, confirm `profiles.push_token` is empty/null for that profile.

### 5.5 M5 exit criteria

- All migrations apply cleanly to a fresh DB and to a DB at the `m4-rewards-redemptions` tag.
- pgTAP green (M4's 108 + ~15 new = ~123 tests).
- Jest 20 + 2 = ~22 green; `tsc --noEmit` clean.
- Manual flow above passes on Android emulator with Google Play Services.
- Tag `m5-live-social` after acceptance.

---

## 6. Open questions / known deferrals

- **iOS push** — deferred until you have Apple Developer Program credentials. The trigger + Edge Function pipeline is platform-agnostic; Expo Push API handles both iOS and Android. Only the device-side token registration + APNs cert config differs. Pairs naturally with the still-pending M1 Sign In with Apple (Task 22).
- **Magic-link / email invite** — code-only for M5. Beta feedback will tell us whether 6-digit-code UX is good enough.
- **Revoke / list invites** — no UI; 24h expiry is the safety net.
- **Quiet hours + per-event mute** — overall spec §7.2 defines them; M7 polish.
- **Push retry queue** — M7 polish. Today, a failed push is silently lost.
- **Streak-milestone, achievement, family-goal pushes** — M6 (alongside the underlying feature work).
- **Account-deletion flow** — App Store requirement; M7 with the rest of the cloud-prep slot.
- **Two M2 dev-infra carry-overs + remaining M1 issues** — still tracked for the cloud-prep slot before M8 ship: cron idempotency on cloud re-deploy, RPC nullable-param type casts, gen-types stdout pollution, FK alias verification, `pin_hash` typing, `create_family` in-function race check (the partial index covers most of it; the in-function check is just a friendlier error).

---

**End of M5 spec.**
