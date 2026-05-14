# M8 — Engagement: Leaderboard + Co-op Goals + Push Polish — Design Spec

**Date:** 2026-05-14
**Status:** Approved (pending user review of this written doc)
**Predecessor:** `docs/superpowers/specs/2026-05-11-m6-gamification-design.md`, `docs/superpowers/specs/2026-05-11-m7-prelaunch-design.md`, `docs/superpowers/specs/2026-05-13-m7.5-ux-polish-design.md`
**Successor milestone:** Cleanup bundle — M1 `pin_hash` typing, M2 dev-infra carry-overs (cron idempotency, RPC nullable type quirks, gen-types stdout pollution, FK alias verification), M6 placeholder audio replacement, plus any beta-tester surfaced issues.

---

## 1. Scope and milestone boundary

### 1.1 In scope

Six engagement features carved off from M5 and M6 (recorded as "Out of scope" in both prior specs). All ride on the existing M3 star ledger, M4 redemption, M5 realtime + push, and M6 achievement infrastructure.

**Push pipeline polish — four features sharing one subsystem:**

- **Quiet hours** — per-family configurable window (default 21:00–07:00, family timezone). Pushes that fire inside the window are queued and sent as one collapsed summary at window end.
- **Per-event mute settings** — per-parent `jsonb` on `profiles.push_prefs`, opt-out model (missing/true = deliver). Applied at enqueue time, so muted events never enter the queue.
- **Push retry queue** — same `push_outbox` table also handles delivery failures via exponential backoff (30s · 2^attempts, max_attempts=3). On `DeviceNotRegistered` we null out the recipient's `profiles.push_token`.
- **Streak milestone pushes** — new trigger on `streaks` UPDATE fires `send_push` when `current_streak` crosses 7, 30, or 100. New event_type `streak_milestone`.

**Leaderboard:**

- This-week + all-time star rankings per kid within a family.
- "Earned not net" scoring — only positive `star_ledger.delta` rows count. Redemptions don't drop your rank.
- Week boundary: Monday 00:00 in family timezone.
- Tone: numbers + 🥇🥈🥉 medals only. No "you're behind" framing, no inter-kid progress bars.
- Single-kid families: solo row only, no rank, no medal.

**Family co-op goals:**

- One active shared goal per family (e.g., "Pizza Night at 500⭐").
- Parent-created via RPC; partial unique index enforces the single-active constraint.
- Progress = sum of positive `star_ledger.delta` since `goal.created_at` (no baseline column needed).
- Auto-complete via `star_ledger` trigger; fires `goal_completed` push + realtime broadcast for the kid celebration banner.
- Symbolic reward only — title and description describe the family's social-contract reward. No integration with the M4 redemption pipeline in v1.

### 1.2 Out of scope (deferred)

- **M1 `pin_hash` typing** — still plain text in `profiles`. Should become `bytea` + bcrypt before public launch. Tracked for the next cleanup milestone.
- **M2 dev-infra carry-overs** — cron idempotency, RPC nullable type quirks, gen-types stdout pollution, FK alias verification.
- **M6 placeholder audio replacement** — `mobile/assets/sounds/click.mp3` and `chime.mp3` are silent MPEG-1 Layer 3 frames awaiting real CC0 audio.
- **Cross-family leaderboards** — out of scope permanently (privacy + spam vectors). Leaderboard is intra-family only.
- **Goal-tied automatic redemptions** — co-op goals stay symbolic in v1. Integration with M4 rewards (auto-creating a free redemption on goal completion) is a future polish if beta feedback asks for it.
- **Per-event mute grouped categories** — single flat list of 10 toggles. Categorization is a v2 cleanup if the list feels cluttered.
- **Multiple concurrent goals** — single-active enforces focus.
- **Animated rank-change ticks on leaderboard** — read on tab focus + invalidation on `star_ledger` realtime is enough. Live "rank just changed" animation is post-v1.
- **Expo receipt polling** — v1 trusts ticket status; receipts are not polled. Add later if async delivery failures surface.
- **Localized push copy** — server-side push messages ship English-only in v1 (matches existing M5/M6 behavior). Add `profiles.language_pref` if Spanish-speaking parents complain.
- **Per-parent quiet-hours override** — per-family wins. Divorced-co-parent edge case revisited if beta surfaces it.

### 1.3 Exit criteria

A two-parent + two-kid family can:

1. **Quiet hours.** Both parents enabled, family quiet hours set to 22:00–07:00. Kid earns a chore approval at 23:00 → `push_outbox` row queued, no push fires. At 07:00 next morning, one collapsed push arrives per parent: "3 updates in your family. Tap to review."
2. **Per-event mute.** Parent A mutes `redemption_requested`. Kid requests a reward → Parent B receives push, Parent A does not. `push_outbox` reflects only Parent B's row.
3. **Push retry.** Simulate Expo Push API 503 → row stays pending with `attempts=1`, `scheduled_for=now()+30s`. Restore Expo → next drain pass marks `sent`.
4. **Streak milestone.** Manually backdate `streaks.last_completion_date` so the kid's `current_streak` is 6. Approve a chore → `current_streak=7` → both parents get push "Sara hit a 7-day streak! 🔥".
5. **Leaderboard.** Both kids visible on `parent/leaderboard.tsx` and on each kid's leaderboard tab. Top kid has 🥇. Switching to All Time tab shows cumulative-earned ranking. Single-kid family (manually delete one) shows solo row, no rank, no medal.
6. **Family co-op goals.** Parent creates "Pizza Night at 100⭐" with `target_stars=100`. Both kids see the active goal card with progress bar. Kids earn stars → progress updates via realtime. At 100⭐ reached: `family_goals.status='completed'`, both parents get push, both kids see the celebration banner.

After acceptance, tag `m8-engagement`.

---

## 2. Data model

### 2.1 New columns on existing tables

**`families`:**

```sql
alter table families
  add column timezone           text    not null default 'UTC',
  add column quiet_hours_enabled boolean not null default true,
  add column quiet_hours_start  time    not null default '21:00',
  add column quiet_hours_end    time    not null default '07:00';
```

`timezone` is an IANA name (e.g., `America/Bogota`). Shared between quiet hours and the leaderboard's Monday-reset. Onboarding (`create-family.tsx`) auto-populates via `Intl.DateTimeFormat().resolvedOptions().timeZone` from the device that creates the family — same `Intl` pattern M7.5 introduced for locale detection (commit `00c434e`). Editable in Settings.

**`profiles`:**

```sql
alter table profiles
  add column push_prefs jsonb not null default '{}';
```

Keys are event_types, values are booleans. Missing key is treated as `true` (opt-out model). Defaults to `{}` so existing M5-era rows stay opted-in. New RLS policy lets the owning user UPDATE only their own `push_prefs` (no broad cross-family write).

### 2.2 New table — `push_outbox`

```text
push_outbox
  id            uuid pk default gen_random_uuid()
  family_id     uuid not null fk → families on delete cascade
  recipient_id  uuid not null fk → profiles on delete cascade
  event_type    text not null
  payload       jsonb not null
  enqueued_at   timestamptz not null default now()
  scheduled_for timestamptz not null
  attempts      int not null default 0
  max_attempts  int not null default 3
  status        text not null default 'pending'
                check (status in ('pending','sent','failed','canceled'))
  last_error    text
  sent_at       timestamptz

  index on (status, scheduled_for) where status = 'pending'
  index on (recipient_id, scheduled_for) where status = 'pending'
```

- Partial index on the pending-slice keeps `drain_push_outbox` lookups O(pending).
- `family_id` is denormalized for RLS predicate parity with the rest of the schema.
- `payload` carries everything the formatter needs (kid_name, chore_title, etc.) at the moment of enqueue. We do **not** store the formatted message; formatting happens at drain time using `event_type + payload`, which keeps the table free of copy/i18n coupling.

RLS: parents can read their own family's rows for debugging via the parent settings (a future "Notification log" screen — out of scope in v1, but the policy supports it). Service role does all writes.

### 2.3 New table — `family_goals`

```text
family_goals
  id            uuid pk default gen_random_uuid()
  family_id     uuid not null fk → families on delete cascade
  title         text not null
  description   text
  target_stars  int  not null check (target_stars > 0)
  status        text not null default 'active'
                check (status in ('active','completed','canceled'))
  created_by    uuid not null fk → profiles
  created_at    timestamptz not null default now()
  completed_at  timestamptz

  unique index on (family_id) where status = 'active'
  index on (family_id, status)
```

The partial unique index is the canonical "one active goal per family" enforcement. `create_family_goal` does **not** pre-check; a second concurrent insert errors at the constraint level and the RPC translates it to `error_code='already_active'`. Same defensive shape we use for `family_invites.code` uniqueness in M5.

### 2.4 No new tables for leaderboard

Leaderboard is computed on demand by `get_leaderboard(family_id)` against existing `star_ledger`. No materialization — at most 4–5 rows per family per call. Cache lifetime is "until next `star_ledger` realtime fires", same as the approval queue and balance card.

---

## 3. RPCs and database functions

### 3.1 Settings RPCs

**`set_quiet_hours(p_enabled bool, p_start time, p_end time, p_timezone text) returns void`**

- Parent-only (asserts `profiles.type='parent' AND profiles.family_id = current family`)
- Validates `p_timezone` against `pg_timezone_names` (raises `invalid_timezone` if absent)
- UPDATEs the caller's family row

**`set_push_pref(p_event_type text, p_enabled boolean) returns jsonb`**

- Updates `profiles.push_prefs` for `auth.uid()`'s parent profile via `jsonb_set`
- Returns the full updated prefs blob so the mobile client can re-render without a separate read

### 3.2 Co-op goal RPCs

**`create_family_goal(p_title text, p_target_stars int, p_description text default null) returns family_goals`**

- Parent-only
- INSERTs into `family_goals` with `status='active'`, `created_by` = caller's profile
- Catches `unique_violation` on the partial index and re-raises as `already_active`

**`cancel_family_goal(p_goal_id uuid) returns void`**

- Parent-only, must own the family
- `UPDATE family_goals SET status='canceled' WHERE id = p_goal_id AND status='active'`
- Returns silently (no error) if the goal is already terminal — idempotent

**`get_active_goal(p_family_id uuid) returns table(goal_cols..., progress_stars int)`**

- RLS-checked (caller must belong to the family)
- LEFT JOIN to `star_ledger` filtered on `delta > 0 AND created_at >= goal.created_at`
- Returns zero rows if no active goal exists

### 3.3 Leaderboard RPC

**`get_leaderboard(p_family_id uuid) returns table(profile_id uuid, display_name text, avatar_id int, week_stars int, all_time_stars int, week_rank int, all_time_rank int)`**

- RLS-checked
- CTE that aggregates per-kid positive `star_ledger.delta`. Week-bucket filter uses `families.timezone` to compute the Monday-00:00 cutoff:

  ```sql
  date_trunc('week', (now() at time zone families.timezone))
    at time zone families.timezone
  ```

- Window functions provide `week_rank` and `all_time_rank` (using `rank()` so ties share a rank).
- Tie-break ordering for display: `week_stars desc → all_time_stars desc → display_name asc`.

### 3.4 Push subsystem internals

**`send_push(p_recipients uuid[], p_event_type text, p_payload jsonb) returns int` — refactored from M5**

For each recipient in `p_recipients`:

1. Skip if `profiles.push_prefs ->> p_event_type = 'false'`.
2. Skip if `profiles.push_token IS NULL`.
3. Compute `v_scheduled_for`:
   - If `families.quiet_hours_enabled = false` → `now()`.
   - Else compute `current_time_in_family_tz = (now() at time zone families.timezone)::time` and `current_date_in_family_tz = (now() at time zone families.timezone)::date`. Determine if currently in quiet hours:
     - If `start <= end` (same-day window, e.g., 13:00–14:00): `in_quiet = (current_time >= start AND current_time < end)`.
     - If `start > end` (wraparound, the common 21:00–07:00 case): `in_quiet = (current_time >= start OR current_time < end)`.
   - In quiet hours → next occurrence of `quiet_hours_end` in family TZ:
     - If `start > end AND current_time >= start` → end is tomorrow's `quiet_hours_end` in family TZ.
     - Otherwise → today's `quiet_hours_end` in family TZ.
     - Result converted back to UTC `timestamptz`.
   - Outside quiet hours → `now()`.
4. INSERT into `push_outbox` with `status='pending'`.

Returns the number of rows inserted (useful for trigger debug).

**`drain_push_outbox()` — called by pg_cron every minute**

1. `SELECT id, recipient_id, event_type, payload FROM push_outbox WHERE status='pending' AND scheduled_for <= now() ORDER BY recipient_id, enqueued_at`
2. Group by `recipient_id`. If a recipient has ≥2 ready rows: build a collapsed summary message (`"{count} updates in your family. Tap to review."`) and pass the IDs as one batch. Else build the per-event message from the event_type template.
3. Call `pg_net.http_post` to the `send_push_drain` Edge Function with the batch payload.
4. The Edge Function POSTs to Expo Push API, parses tickets, and writes per-row results via `apply_drain_result(p_row_id uuid, p_outcome text, p_error text default null)`. `attempts` counts tries-made-so-far; it is incremented **after** each send. Logic:
   - `ok` → `status='sent', sent_at=now()`.
   - `DeviceNotRegistered` → `UPDATE profiles SET push_token = NULL` AND `status='failed'` (no point retrying a dead token).
   - Transient error → `attempts = attempts + 1`. Then: if `attempts >= max_attempts` → `status='failed', last_error=<message>`. Else → status stays `pending`, `scheduled_for = now() + (30 seconds * power(2, attempts))`.

With `max_attempts=3` the row is tried at most 3 times: initial attempt at enqueue, then up to two retries (60s and 120s after their respective failures) before being marked failed.

**Streak milestone trigger** (new):

```sql
create function notify_streak_milestone() returns trigger
  language plpgsql security definer as $$
declare
  v_kid_name text;
  v_parents uuid[];
begin
  if new.current_streak in (7,30,100)
     and new.current_streak <> coalesce(old.current_streak, 0)
  then
    select display_name into v_kid_name from profiles where id = new.profile_id;
    select array_agg(id) into v_parents
      from profiles where family_id = new.family_id and type = 'parent';
    perform send_push(v_parents, 'streak_milestone',
      jsonb_build_object('kid_name', v_kid_name, 'streak_days', new.current_streak));
  end if;
  return new;
exception when others then
  raise warning 'notify_streak_milestone failed: %', sqlerrm;
  return new;
end$$;

create trigger streaks_milestone_push
  after update of current_streak on streaks
  for each row execute function notify_streak_milestone();
```

Exception wrapping matches the M5/M6 trigger pattern — a push failure must never abort the underlying streak update.

**Co-op goal auto-complete trigger** (new):

```sql
create trigger star_ledger_goal_check
  after insert on star_ledger
  for each row when (new.delta > 0)
  execute function check_active_goal();
```

`check_active_goal()` looks up the family's active goal, computes progress, and if `progress >= target_stars` flips status to `completed` and calls `send_push` for both parents with `event_type='goal_completed'`. Same exception-wrap.

---

## 4. Mobile architecture

### 4.1 New files

- `mobile/app/(app)/parent/leaderboard.tsx`
- `mobile/app/(app)/parent/goals/index.tsx`
- `mobile/app/(app)/parent/goals/create.tsx`
- `mobile/app/(app)/kid/[profileId]/leaderboard.tsx`
- `mobile/src/components/LeaderboardList.tsx` — shared rendering for kid + parent
- `mobile/src/components/GoalCard.tsx` — active-goal progress on home
- `mobile/src/components/QuietHoursPicker.tsx` — enable toggle + start/end time pickers + TZ picker
- `mobile/src/components/PushPrefsList.tsx` — 10 event-type toggles
- `mobile/src/hooks/useLeaderboard.ts`
- `mobile/src/hooks/useActiveGoal.ts`

### 4.2 Modified files

- `mobile/app/(app)/parent/settings.tsx` — add Notifications subsection + links to Leaderboard / Family Goals
- `mobile/app/(app)/parent/_layout.tsx` — register the new goals + leaderboard routes (Stack, not tabs)
- `mobile/app/(app)/parent/index.tsx` — render `<GoalCard />` above chore list when active
- `mobile/app/(app)/kid/[profileId]/index.tsx` — render `<GoalCard />` at top + add Leaderboard header link
- `mobile/src/lib/realtime.ts` — extend `subscribeToFamily` with `family_goals` listener
- `mobile/src/components/AchievementBanner.tsx` — accept new variant for `goal_completed`
- `mobile/src/i18n/locales/en.json` + `es.json` — new keys (see §4.5)

### 4.3 Navigation choices

- **Leaderboard and Goals are NOT bottom tabs.** Parent bottom tabs stay at 4 (Chores, Rewards, Approvals, Settings). Both new screens are reachable via Settings links to keep the primary navigation stable.
- **Kid home gets a "Leaderboard" header link** next to the existing Rewards + Badges. Header links are the kid app's secondary nav convention (M6 established this).
- **`<GoalCard />` renders inline** on both kid home and parent Chores tab when an active goal exists. Tapping opens a details modal showing description + per-kid contribution breakdown.

### 4.4 Realtime extensions

`subscribeToFamily` gains:

- 5th `postgres_changes` listener on `family_goals` (INSERT/UPDATE filtered by `family_id`) → emits `goal_completed` event on the M6 event bus when `status` flips to `completed`; emits `goal_progress` event on `star_ledger` INSERT to invalidate `useActiveGoal`.
- The existing `star_ledger` listener (M5) gets an extra invalidation target: `['leaderboard', familyId]` query key.

Add `family_goals` to the `supabase_realtime` publication via migration (per M6 late fix `7583eb4` — known gotcha for any new broadcasting table). `push_outbox` does **not** broadcast; only the drain worker reads it.

`AchievementBanner` (introduced in M6) is extended to render a `goal_completed` variant with the goal title + confetti. Banner-gating to kid surface (per M6 late fix `df44d09`) still applies — parents get a push, not a banner.

### 4.5 i18n keys

New keys added to `en.json` and `es.json`. Translation parity test (M7.5 Task 9) catches missing keys at CI time.

- `leaderboard.tabThisWeek`, `leaderboard.tabAllTime`, `leaderboard.medalAltGold/Silver/Bronze`, `leaderboard.soloFallback`, `leaderboard.starsThisWeek`, `leaderboard.starsAllTime`
- `goals.createTitle`, `goals.targetLabel`, `goals.descriptionLabel`, `goals.activeAlready`, `goals.cancelConfirm`, `goals.completedBanner`, `goals.progressRemaining`, `goals.archiveTitle`
- `notifications.sectionTitle`, `notifications.quietHoursLabel`, `notifications.startLabel`, `notifications.endLabel`, `notifications.timezoneLabel`, `notifications.muteSectionTitle`, plus one label per event_type for the mute list

---

## 5. Edge Function changes

### 5.1 `send_push` → split into two

The existing `send_push` Edge Function from M5 was the direct POSTer. In M8 it splits:

- **`send_push` (DB function)** — enqueues into `push_outbox` (replaces the prior direct-POST path). Triggers continue to call this name with the same signature; the implementation changes.
- **`send_push_drain` (Edge Function)** — new. Called by `drain_push_outbox()` via `pg_net.http_post` with a batch payload. Calls Expo Push API, parses tickets, writes results back via `apply_drain_result`. Per-event message templates live here (was inlined in the M5 + M6 send_push).

### 5.2 New event templates (English)

- `streak_milestone` — `"{kid_name} hit a {streak_days}-day streak! 🔥"`
- `goal_completed` — `"Family goal reached: {goal_title} 🎉"`
- `collapsed_summary` — `"{count} updates in your family. Tap to review."`

Existing M5 + M6 templates (`chore_submitted`, `chore_approved`, `chore_rejected`, `redemption_requested`, `redemption_approved`, `redemption_denied`, `redemption_fulfilled`, `achievement_unlocked`) move into `send_push_drain` unchanged.

### 5.3 No receipt polling in v1

Expo's two-stage flow (ticket → receipt) means async delivery failures are possible. v1 trusts ticket status. If reliability complaints surface, add a receipt-polling cron + Edge Function in a follow-up. Schema is forward-compatible — `push_outbox.status='sent'` could later split into `'sent'` vs `'delivered'`.

---

## 6. Testing strategy

### 6.1 pgTAP

Following the M5/M6 numbering convention:

- `supabase/tests/40_quiet_hours_rpc.sql` — `set_quiet_hours` validation, RLS (parent-only), timezone validation.
- `supabase/tests/41_push_prefs_rpc.sql` — `set_push_pref` jsonb merge correctness, RLS.
- `supabase/tests/42_push_outbox_enqueue.sql` — `send_push` enqueues into `push_outbox`, respects mute, skips null `push_token`, computes `scheduled_for` in family TZ.
- `supabase/tests/43_drain_outbox.sql` — collapse threshold (1 row = individual, 2+ = summary), attempts/backoff math, `DeviceNotRegistered` nulls the token.
- `supabase/tests/44_streak_milestone.sql` — trigger fires at 7/30/100, no-op outside thresholds, no-op when streak doesn't increase.
- `supabase/tests/45_family_goals_rpc.sql` — `create_family_goal` partial-unique handling, `cancel_family_goal` idempotence, `get_active_goal` progress math.
- `supabase/tests/46_goal_completion_trigger.sql` — auto-complete fires exactly once at threshold; push enqueued; subsequent star_ledger inserts don't re-fire.
- `supabase/tests/47_leaderboard_rpc.sql` — week math (Monday cutoff in family TZ), all-time math, tie-breaking, single-kid family solo result, redemption-deducted kid still ranks by earned-not-net.

### 6.2 Jest

- `mobile/tests/leaderboardScreen.test.tsx` — list rendering, medal placement, single-kid solo fallback.
- `mobile/tests/goalCard.test.tsx` — progress bar correctness, "X to go" copy.
- `mobile/tests/createGoalScreen.test.tsx` — submit calls RPC, error handling for `already_active`.
- `mobile/tests/quietHoursPicker.test.tsx` — value mapping, time-picker integration, timezone picker default = device TZ.
- `mobile/tests/pushPrefsList.test.tsx` — toggles map to RPC calls, optimistic update on flip.

### 6.3 Manual acceptance

End-to-end manual walks through the §1.3 exit criteria. `cron.job` table should show the `drain_push_outbox` entry after migration apply. Test the collapse path by enabling quiet hours that include "now", firing 3 chore approvals, advancing wall-clock past `quiet_hours_end`, and verifying one collapsed push.

---

## 7. Migrations

In timestamp order (filenames finalized by the implementation plan):

1. `20260514000001_families_timezone_and_quiet_hours.sql` — ALTER families columns.
2. `20260514000002_profiles_push_prefs.sql` — ALTER profiles + self-update RLS policy.
3. `20260514000003_push_outbox.sql` — table + RLS + indexes.
4. `20260514000004_family_goals.sql` — table + RLS + partial unique index.
5. `20260514000005_send_push_refactor.sql` — replace `send_push` body with enqueue logic.
6. `20260514000006_drain_push_outbox.sql` — `drain_push_outbox()` + `apply_drain_result()` + pg_cron schedule.
7. `20260514000007_streak_milestone_trigger.sql`
8. `20260514000008_goal_completion_trigger.sql`
9. `20260514000009_leaderboard_rpc.sql`
10. `20260514000010_realtime_publication_m8.sql` — add `family_goals` to `supabase_realtime`.
11. `20260514000011_settings_rpcs.sql` — `set_quiet_hours` + `set_push_pref`.
12. `20260514000012_family_goals_rpcs.sql` — `create_family_goal` + `cancel_family_goal` + `get_active_goal`.

---

## 8. Known issues / forward-flags

1. **Family timezone vs co-parent device timezone.** Per-family TZ wins. Co-parents in different TZs experience quiet hours and leaderboard week-boundary based on the family's stored TZ. Acceptable v1; revisit if divorced-co-parent feedback surfaces.
2. **Server-side push copy is English-only.** Server doesn't know the recipient's app-side language pref. v1 ships EN templates. Add `profiles.language_pref text` if Spanish-speaking parents complain.
3. **Expo receipt polling is skipped.** Tickets are trusted. Async delivery failures aren't surfaced. Add a receipt-polling Edge Function if reliability issues arise.
4. **Collapse threshold is fixed at ≥2.** Hardcoded in `drain_push_outbox`. v2 could add `families.collapse_threshold int default 2` if some families want only-collapse-on-3+.
5. **Goal completion is one-shot.** Goal is marked completed and archived; no re-arm. Parent creates a new goal for the next round.
6. **`push_outbox` cleanup.** Rows accumulate forever in v1. Add a nightly pg_cron job to DELETE rows with `status IN ('sent','failed','canceled') AND sent_at < now() - interval '30 days'` in a follow-up.
7. **No backfill of `families.timezone` for existing families.** They start at the default `'UTC'`. The migration is forward-only; user can update via Settings. Document this in the migration comment.

---

## 9. Boundary with launch

M8 ships independently of the M7 Apple Dev / APNs / Google OAuth / cloud Supabase work. While Apple Dev enrollment is in flight, M8 can be developed and tested on the Android-only push path (existing Expo Push + FCM via M5). All schema changes are forward-compatible with iOS push when APNs lands. M8 does not block M7 and vice versa.

---

## 10. Estimate

Comparable to M5+M6 in surface area:

- 12 migrations
- 8 pgTAP test files (~25–30 new scenarios)
- 9 new mobile files (4 screens, 4 components, 2 hooks — one screen overlaps a hook)
- 5 new Jest suites
- 1 Edge Function (`send_push_drain`)

Rough budget: 4–5 dev days of focused work, comparable to M5.
