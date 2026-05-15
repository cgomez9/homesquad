# Celebration Replay — Design Spec

**Date:** 2026-05-15
**Branch target:** `m7-prelaunch` (M8 already integrated here via fast-forward)
**Status:** Approved design — pending implementation plan

## 1. Problem

In-app celebrations are live-only and ephemeral. Confetti (chore approval), the achievement banner (badge unlock), and the goal-completion banner all fire **only** if the kid screen is mounted and subscribed at the exact moment the backing row changes:

- Chore-approval confetti: `kid/[profileId]/index.tsx` realtime subscription → `fireBigFeedback()`.
- Achievement / goal banners: `subscribeToFamily` → `emit('achievement_unlocked' | 'goal_completed')` → `AchievementBanner`, additionally gated to `inKidMode`.

A parent approving chores (or an achievement/goal landing) while the kid is not on their screen produces **no celebration ever** — the event passes with nothing queued or replayed. The kid-home query even excludes `approved` rows, so there is no implicit catch-up. This is a pre-existing design gap surfaced during M8 acceptance testing (issues ⑤ and ⑥).

⑥ additionally asks for a richer **animated** badge reveal; today a badge unlock is a static 4-second modal card.

## 2. Goals & Approved Decisions

1. **Replay each missed win** in sequence the next time the kid opens their profile.
2. **Cap + summary tail:** play the **5 most recent** missed wins in full, chronologically; collapse any older remainder into one summary card.
3. **Exactly-once, cross-device:** tracked by a server-side per-kid cursor.
4. **Badge reveal animation = "Confetti Burst"** (companion option D): the badge medallion pops in with a bouncy scale while colored confetti sprays radially outward.
5. **Architecture = derived watermark** (no new outbox table).

### 2.1 Exit criteria (manual acceptance)

A two-parent + two-kid family can:

1. **Missed chore approval.** Kid screen closed. Parent approves 2 chores for Sara. Open Sara's profile → 2 confetti celebrations play in sequence, then the cursor advances; reopening the profile replays nothing.
2. **Missed badge.** Trigger an achievement unlock for Leo while not on his screen. Open Leo's profile → the **Confetti-Burst badge reveal** plays for that achievement.
3. **Missed goal.** Complete a family goal while neither kid screen is open. Open each kid's profile → each sees the goal-completion banner exactly once (independent per-kid cursors).
4. **Cap + summary.** Backdate/approve 8 missed wins for one kid. Open the profile → the 5 most recent play in full, followed by one summary card "Plus 3 more while you were away — +N ⭐!". Reopen → nothing replays.
5. **First open after ship.** An existing kid with historical achievements opens their profile after this feature ships → **no** historical dump; baseline cursor is set, future wins replay normally.
6. **Cross-device / reinstall.** Celebrate wins on device A; open the same kid on device B (or after reinstall) → already-celebrated wins do **not** replay.

## 3. Architecture

A per-kid watermark column `profiles.celebrations_seen_at timestamptz`. On kid-home mount a single hook:

1. Reads the profile's cursor.
2. If cursor IS NULL → set baseline (see §6.1), celebrate nothing, stop.
3. Queries the three sources for rows newer than the cursor.
4. Merges + sorts chronologically; applies cap + summary.
5. Plays the sequence through the existing celebration UI.
6. Advances the cursor to the **max timestamp actually processed**.

The existing live realtime path is retained. Both the live path and the catch-up path advance the cursor (monotonically) whenever they celebrate a win, so a win is never celebrated twice.

No new RLS: `chore_instances`, `achievements`, and `family_goals` already expose a parent-scoped SELECT policy, and kid-home runs under the signed-in parent's auth session.

## 4. Data Sources (verified schema)

| Win type | Query | Display source |
|----------|-------|----------------|
| Chore approved | `chore_instances` where `completed_by = :profileId` AND `status='approved'` AND `approved_at > :cursor`, join `chores(title, star_value)` | confetti + small card; timestamp = `approved_at` |
| Badge unlocked | `achievements` where `profile_id = :profileId` AND `unlocked_at > :cursor` | `ACHIEVEMENTS[achievement_key]` client constant (emoji/title/desc); timestamp = `unlocked_at` |
| Goal completed | `family_goals` where `family_id = :familyId` AND `status='completed'` AND `completed_at > :cursor` | existing goal banner; timestamp = `completed_at` |

`star_ledger` is queried over the missed window (sum of `delta`) only to compute the summary card's "+M ⭐".

## 5. Server (one migration)

- **Migration:** `alter table public.profiles add column celebrations_seen_at timestamptz;` (nullable, no default).
- **RPC `mark_celebrations_seen(p_profile_id uuid, p_seen_at timestamptz)`** — `SECURITY DEFINER`, `set search_path = public`. Validates the caller is a `parent` whose `family_id` matches `p_profile_id`'s family (same authorization shape as M8 `set_push_pref` / `set_quiet_hours`). Updates monotonically:
  `set celebrations_seen_at = greatest(coalesce(celebrations_seen_at, 'epoch'::timestamptz), p_seen_at)`.
  Grant `execute` to `authenticated`.

No realtime publication change is required (queries are pull-on-mount; the existing realtime subscriptions are unchanged).

## 6. Replay Engine & UI

### 6.1 `useCelebrationCatchup(profileId, familyId)`

New hook, invoked from `kid/[profileId]/index.tsx` on mount and when `profileId` changes.

- Reads `celebrations_seen_at` for `profileId`.
- **Null cursor → baseline:** call `mark_celebrations_seen(profileId, now())` and return without celebrating. Prevents dumping pre-existing history on the first open after ship.
- Otherwise run the three queries (§4), tag each row with `{ kind, at }`, merge, sort ascending by `at`.
- **Cap + summary:** if `count ≤ 5` → play all. If `count > 5` → take the 5 with the most recent `at` (kept in ascending order for playback); the remaining `count − 5` older items are not played individually. Append one `summary` item: `{ kind:'summary', moreCount: count − 5, extraStars: Σ star_ledger.delta in (cursor, maxAt] }`.
- Enqueue the resulting list into `AchievementBanner`'s queue via a new programmatic batch API.
- After the queue fully drains, call `mark_celebrations_seen(profileId, maxAt)` where `maxAt` = max timestamp of the items actually queried (not `now()`), so a win that arrived mid-replay still replays next time.

### 6.2 `AchievementBanner` extensions

Currently handles realtime-driven `achievement` and `goal` items with a 4s drain. Add:

- **Programmatic batch enqueue** — an exported function (or context method) to push an ordered batch of celebration items, independent of the realtime `on(...)` listeners. Existing live listeners remain.
- **`chore_approved` variant** — small card ("⭐ Chore approved! +N") plus `fireBigFeedback()` (existing full-screen confetti via `ConfettiHost`).
- **`achievement` variant → Confetti-Burst reveal** — replace the static card with: medallion scale-pop (RN `Animated`, bouncy spring) layered with a radial confetti spray. Reuse `react-native-confetti-cannon` (already a dependency via `ConfettiHost`) for the spray; no new dependency.
- **`summary` variant** — single card: "🌟 Plus {moreCount} more while you were away — +{extraStars} ⭐!".
- Goal completion keeps its current banner.

### 6.3 Double-play prevention

The cursor is the single guard. Rule: **whenever a win is celebrated (catch-up OR live), the cursor is advanced (monotonically) to at least that win's timestamp.** Catch-up advances once after drain to `maxAt`. There are **two** live entry points, both of which gain a per-win cursor-advance call (new behavior — today neither touches any cursor): (a) the chore-approval realtime subscription in `kid/[profileId]/index.tsx`, and (b) the `achievement_unlocked` / `goal_completed` path via `subscribeToFamily` → `AchievementBanner`. `greatest()` in the RPC makes concurrent/out-of-order advances safe.

## 7. Scope

**In scope:** chore approval, badge/achievement unlock, goal completion.

**Out of scope:** streak milestones (M8 delivers these via push notification; not an in-app celebration), and any change to the push/quiet-hours pipeline.

## 8. Testing

- **pgTAP** (`supabase/tests/46_mark_celebrations_seen.sql`): RPC authorization (non-parent rejected, cross-family rejected), monotonic behavior (older `p_seen_at` does not move the cursor backward), null → set.
- **Jest** — replay engine: chronological merge across the three sources; cap selects the 5 most recent and produces correct `moreCount`/`extraStars`; null-cursor baseline path celebrates nothing; `maxAt` (not `now()`) is used to advance.
- **Jest** — `AchievementBanner`: each variant renders (`chore_approved`, `achievement` Confetti-Burst, `goal`, `summary`); batch enqueue drains in order.
- **Manual:** the §2.1 exit criteria on the Android emulator.

## 9. Out-of-band notes

- Implemented on `m7-prelaunch` (M8 already fast-forward-integrated). Independent of the M8 Task 33 acceptance and the M7 Apple-Dev / APNs track.
- `database.types.ts` lags M8; new RPC will be called via the existing `(supabase as any).rpc(...)` escape until types are regenerated in the cleanup bundle.
