# Timed Chores — 2026-05-22

A chore can declare specific times of day at which it must be done (e.g., "Brush teeth" at 08:00 and 20:00). When a chore has times:

- The materializer creates one `chore_instance` per (day × time), in family-local timezone.
- A push reminder fires 10 minutes before each instance's `due_at`.
- The kid home card shows the scheduled time, and flips to an "Overdue" visual the moment `now > due_at` while still `pending`.

Chores without times keep their existing behavior — one instance per day at midnight UTC, no reminder, no overdue indicator. **Zero data backfill, zero behavior change for existing chores.**

## Scope

In scope:
- Extend `Recurrence` type with optional `times: string[]` (HH:MM, family-local).
- Update `next_occurrence` SQL + materializer to produce wall-clock instances when `times` is non-empty.
- Schedule `push_outbox` reminder rows at `due_at - 10 min`, recipient = kid (if push_token present) or parents (fallback).
- Cancellation triggers when a chore is completed or archived.
- Parent chore form: add "Add specific times" toggle + time chip list, including the deferred Tide Pool theme migration of `RecurrencePicker`.
- Kid home card: time label + overdue badge.
- Settings: new `chore_reminder` push-prefs toggle.
- pgTAP + Jest test coverage.

Out of scope (explicit):
- Kid-specific push token registration UI. The fallback to parents always fires today.
- Snooze / "remind me in 5 min" actions on the push.
- Per-weekday different times. The `times` array applies on every day the chore runs.
- Configurable lead time. Hardcoded 10 minutes.
- Verification-mode-specific copy. One push template covers all three modes.

## Non-goals

- No new tables. The `chores.recurrence` JSONB column already supports the new fields.
- No change to chore-instance unique constraint, RLS policies, or status state machine.
- No change to the daily 00:05 UTC materializer cron schedule. Same job, smarter inner loop.

## Schema

### `Recurrence` type (TypeScript, `mobile/src/lib/recurrence.ts`)

```ts
export type Recurrence =
  | { type: 'once'; due: string; time?: string }
  | { type: 'daily'; times?: string[] }
  | { type: 'weekly'; days: number[]; times?: string[] };
```

`times` is an array of "HH:MM" strings (24h, leading zeros, `00:00` through `23:59`), sorted ascending, deduplicated, max 6 entries.

Empty array or undefined = legacy behavior. The validator at the form layer prevents `times: []` from being saved (toggle off clears the field entirely).

### `formatRecurrence`

Extends to include times when present. Examples (English):

- `Daily · 8 AM, 8 PM`
- `Mon · Wed · Fri · 7 AM`
- `Once on May 23 · 6 PM`

Times use `toLocaleTimeString` with `{ hour: 'numeric', minute: '2-digit' }`. Minutes are omitted only when both hour and minute are clean (formatter handles automatically). Spanish locale produces 24h format.

### SQL — `next_occurrence(rec, after, family_tz)`

Signature gains a third parameter:

```sql
create or replace function public.next_occurrence(
  rec jsonb,
  after timestamptz,
  family_tz text default 'UTC'
) returns timestamptz
```

When `rec ? 'times'` is true and the array is non-empty:

- For `daily`: starting from `(after at time zone family_tz)::date`, iterate forward day by day. For each day, iterate through sorted `times[]`. Convert each `(date, time)` to UTC via `(date::timestamp + time::time) at time zone family_tz`. Return the first that is `> after`.
- For `weekly`: same loop, but skip days whose `dow` is not in `days[]`.
- For `once`: combine `due::date` with `time` (default `00:00:00`); return that timestamp if `> after`, else null.

When `times` is missing/empty: existing behavior preserved (midnight-of-next-date, family_tz ignored — caller still passes it but the function returns the same value it always did).

`next_occurrence` stays `immutable`.

### Materializer (`supabase/functions/generate_chore_instances`)

The Edge Function loop body changes:

```ts
const { data: chores } = await supabase
  .from('chores')
  .select('id, family_id, assignee_profile_id, recurrence, next_due_at, family:families(timezone)')
  .eq('active', true)
  .not('next_due_at', 'is', null)
  .lte('next_due_at', cutoff);

for (const chore of chores ?? []) {
  const tz = chore.family?.timezone ?? 'UTC';
  let nextDue = chore.next_due_at;
  let iter = 0;
  while (nextDue && new Date(nextDue) <= new Date(cutoff) && iter < MAX_BACKFILL_PER_CHORE) {
    // Insert instance (idempotent via unique constraint).
    await supabase.from('chore_instances').insert({ ... due_at: nextDue });
    // Enqueue reminder if this chore has scheduled times.
    if (Array.isArray(chore.recurrence?.times) && chore.recurrence.times.length > 0) {
      await enqueueReminder(chore.family_id, chore.assignee_profile_id, nextDue, chore.id);
    }
    // Advance with timezone-aware next_occurrence.
    const { data: nextRpc } = await supabase.rpc('next_occurrence', {
      rec: chore.recurrence,
      after: nextDue,
      family_tz: tz,
    });
    nextDue = nextRpc;
    iter++;
  }
  await supabase.from('chores').update({ next_due_at: nextDue }).eq('id', chore.id);
}
```

`MAX_BACKFILL_PER_CHORE = 14` stays. A daily chore with 2 times produces up to 14 × 2 = 28 instances on a long-overdue catch-up; acceptable.

The `enqueueReminder` helper resolves the recipient and writes the push_outbox row directly (no `send_push` RPC call, since send_push fans out to parents only and we need kid-first logic):

```ts
async function enqueueReminder(familyId, kidProfileId, dueAt, choreId) {
  const reminderAt = new Date(new Date(dueAt).getTime() - 10 * 60 * 1000).toISOString();
  // Resolve kid token or fall back to parents.
  const { data: kid } = await supabase
    .from('profiles')
    .select('push_token, push_prefs')
    .eq('id', kidProfileId)
    .single();
  const recipients = [];
  if (kid?.push_token && (kid.push_prefs?.chore_reminder ?? true)) {
    recipients.push({ recipient_id: kidProfileId });
  } else {
    const { data: parents } = await supabase
      .from('profiles')
      .select('id, push_token, push_prefs')
      .eq('family_id', familyId)
      .eq('type', 'parent');
    for (const p of parents ?? []) {
      if (p.push_token && (p.push_prefs?.chore_reminder ?? true)) {
        recipients.push({ recipient_id: p.id });
      }
    }
  }
  if (recipients.length === 0) return;
  await supabase.from('push_outbox').insert(
    recipients.map((r) => ({
      family_id: familyId,
      recipient_id: r.recipient_id,
      event_type: 'chore_reminder',
      payload: { chore_id: choreId, kid_profile_id: kidProfileId, due_at: dueAt },
      scheduled_for: reminderAt,
    })),
  );
}
```

The drain worker (already running every minute) picks up these rows when `scheduled_for <= now()` and dispatches via the existing Edge Function.

### Push payload + copy

`payload = { chore_id, kid_profile_id, due_at }`. The `send_push_drain` Edge Function already maps `event_type → title/body` via a switch. Add a `chore_reminder` branch that looks up the chore title and kid name, producing:

- en: title `⏰ Reminder`, body `{kidName} — time for {choreTitle} in 10 min`
- es: title `⏰ Recordatorio`, body `{kidName} — toca {choreTitle} en 10 min`

Tap deep-link target: `/(app)/kid/{kid_profile_id}` (the kid's home).

### Quiet hours

The reminder bypasses quiet hours: `scheduled_for = due_at - 10 min` exactly, no quiet-hours shift. Documented as a deliberate exception in `send_push_function` and reiterated in the new migration's comment. Rationale: a reminder must fire ON TIME or it loses its purpose.

### Cancellation triggers

Two new triggers, in a single migration file `20260522000001_chore_reminder_cancellation.sql`:

```sql
-- When a chore_instance moves out of 'pending', cancel its pending reminder.
create function public.cancel_reminders_on_instance_status_change()
  returns trigger language plpgsql security definer
  set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.chore_id
       and (payload->>'due_at')::timestamptz = new.due_at;
  end if;
  return new;
end;
$$;

create trigger chore_instance_cancel_reminder
  after update of status on public.chore_instances
  for each row execute function public.cancel_reminders_on_instance_status_change();

-- When a chore is archived, cancel reminders for all its still-pending instances.
create function public.cancel_reminders_on_chore_archive()
  returns trigger language plpgsql security definer
  set search_path = public
as $$
begin
  if old.active = true and new.active = false then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.id;
  end if;
  return new;
end;
$$;

create trigger chore_cancel_reminders_on_archive
  after update of active on public.chores
  for each row execute function public.cancel_reminders_on_chore_archive();
```

The triggers are `security definer` so they can write to `push_outbox` even under restrictive RLS. `payload` is indexed via the existing `push_outbox_pending_idx`; the cancellation queries are O(small) per fired trigger.

## UI — parent chore form

### `RecurrencePicker`

Add an "At specific times" section, visible when `daily` or `weekly` is selected. Adopt `useTheme` + `makeStyles(colors)` (same migration as the previous batch's `VerificationModePicker`) — drops the hardcoded `#3b82f6`, `#d1d5db`, `#374151` literals.

Layout when toggle is on:

```
[ Daily | Weekly ]   (existing segmented control)
[ M T W T F S S ]    (existing weekday chips, only when Weekly)

Specific times    [○ off / ● on]
┌──────────────────────────────────────┐
│ ⏰ 08:00 ×    20:00 ×    + Add time  │
└──────────────────────────────────────┘
```

Time chips:
- Tap a chip to edit (opens the time picker pre-filled).
- Tap × to remove (animated chip collapse, reuses the `useFlashAnimation` pattern from approvals).
- "Add time" opens the native time picker. Result is rounded to the minute, dedup-merged into `times[]`, re-sorted.
- Max 6 chips; the add button disables at 6.

### Time picker

Use `@react-native-community/datetimepicker` if it is already a transitive dep (Expo SDK 54 ships it). The implementation plan verifies during Task 1 and either uses it directly or vendors a small modal time picker (two `Picker`s for hour/minute) — no new top-level dependency.

### i18n

New keys under `forms.recurrence` and `forms.recurrence.times`:

- en `forms.recurrence.timesLabel`: "At specific times"
- en `forms.recurrence.addTime`: "+ Add time"
- en `forms.recurrence.timesEmpty`: "No times set"
- es `forms.recurrence.timesLabel`: "A horas específicas"
- es `forms.recurrence.addTime`: "+ Añadir hora"
- es `forms.recurrence.timesEmpty`: "Sin horas"

## UI — kid home

### Chore card additions

Two new pieces of state on the card render:

**Scheduled time label.** When the parent chore declares `recurrence.times` (non-empty), render under the title:

```
🕗 8:00 AM
```

The formatter is `new Date(due_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })`. Detection is driven by the chore's recurrence shape (not the timestamp value), so a deliberate `times: ['00:00']` would still render correctly. The kid-home query already joins `chore:chores(...)`; extend the selection to include `recurrence` so the card can read `chore.recurrence?.times?.length > 0`.

**Overdue badge.** When `now > due_at && status === 'pending'`:

- The card's border tints to `colors.warning` (orange).
- The time label gets a red `●` dot prefix and an "Overdue" suffix: `● 🕗 8:00 AM · Overdue`
- The done button stays enabled and styled normally.

A `setInterval(() => setTick((n) => n + 1), 60_000)` inside the card hook fires a re-render every minute so the overdue flip happens without a re-fetch. The interval cleans up on unmount.

### Sort order

Chores already sort by `due_at ascending` server-side. Timed chores naturally interleave with legacy chores. The legacy chore's midnight-UTC `due_at` typically lands before family-local morning times, so unscheduled chores sit at the top.

If that ordering feels wrong in practice (e.g., a legacy chore appears above the timed 8am brush-teeth), a follow-up sort can demote times-less chores to the bottom of the list. Out of scope for this spec.

## Settings — push prefs

Add `chore_reminder` to the catalog of event types (defined in `mobile/src/components/PushPrefsList.tsx` as a TypeScript union). The settings UI auto-surfaces a new row.

i18n:
- en `settings.push.chore_reminder`: "Chore reminders"
- es `settings.push.chore_reminder`: "Recordatorios de tareas"

Default `true`. Stored in `profiles.push_prefs` as `{ chore_reminder: true }` (or false to mute).

## Risk + rollout

- **Backfill: none.** Existing chores have no `times`. Their materialization is unchanged.
- **Idempotency of materializer:** the chore_instances unique constraint `(chore_id, due_at)` protects against double-insert if the cron re-runs. Reminder enqueue is NOT idempotent — a second materializer pass would enqueue duplicate reminders. The implementation must guard via a "skip enqueue if a pending reminder already exists for this (chore_id, due_at)" check before inserting.
- **Timezone changes mid-flight:** if a family changes timezone after a chore is created, future materializations use the new timezone; existing chore_instances are not retroactively shifted. Trade-off accepted.
- **DST transitions:** `at time zone` handles DST correctly. The reminder for 08:00 fires at the wall-clock 08:00 on both sides of a DST boundary.
- **Long-overdue catch-up:** `MAX_BACKFILL_PER_CHORE = 14` × N times = bounded. Worst-case for a daily-3-times chore unused for 2 weeks: 42 instances + 42 reminders.

## Verification

**Migrations:**
- `20260522000001_next_occurrence_v2.sql` — new signature with `family_tz`, times-aware loop.
- `20260522000002_chore_reminder_cancellation.sql` — two triggers as above.

**pgTAP tests (new `supabase/tests/48_next_occurrence_times.sql`, `49_chore_reminder_cancellation.sql`):**
- Daily with `times: ['08:00', '20:00']` returns next 08:00 family-local → UTC, then next 20:00 → UTC.
- Weekly with days `[1,3,5]` and `times: ['07:00']`: only Mon/Wed/Fri at 07:00 fire.
- DST boundary (e.g., America/New_York 2026-11-01): 07:00 wall-clock is honored across the fall-back hour.
- Completing a chore_instance flips its pending reminder to `canceled`; non-pending status transitions never re-cancel.
- Archiving a chore cancels all pending reminders for that chore's instances.
- Re-activating a chore does NOT resurrect canceled reminders (trigger only fires active true → false).

**Mobile tests:**
- `formatRecurrence` round-trip with `times` in en + es.
- `RecurrencePicker` time-chip add/remove/dedup/sort behavior.
- Kid card overdue branch — instance with `due_at` 1 minute in the past + `status: 'pending'` renders the overdue badge.
- Reminder push-prefs toggle correctly disables enqueue (mock the materializer at the function-call level).

**Manual emulator walkthrough:**
- Create "Brush teeth" daily with times `['08:00', '20:00']`.
- Kid home shows two cards with time labels.
- Set device clock just after 08:00 → 8am instance shows the overdue badge.
- Set device clock just before 19:50 → reminder push arrives at 19:50 (or immediately, via cron tick simulation).
- Mark 8pm chore as done → confirm the push_outbox row for that instance flips to `canceled` (DB inspection).
- Archive the chore → confirm all future pending reminders flip to `canceled`.

## Open follow-ups (not blocking, recorded for memory)

- Kid push token registration. Currently `set_push_token` requires `auth.uid()`; kids have none. A future "kid device" feature would register tokens out-of-band (parent enters kid's device's token, or a new RPC variant accepts a profile_id).
- Configurable lead time. Currently 10 min. Could become a `families.reminder_lead_minutes` setting if requested.
- Snooze action on the push. Tapping "Snooze 5 min" would re-enqueue a follow-up reminder. Needs an action button on the push payload + a new RPC.
- Per-weekday different times. Today `times[]` applies on every selected day. A future schema could carry `times_by_day: Record<dow, string[]>`.
