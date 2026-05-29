# Chore claim + started/finished states — Design

**Date:** 2026-05-29
**Owner:** Carlos Gomez
**Status:** Draft (awaiting user review)

## Goal

Add an explicit claim-then-start-then-finish flow to chores so that any family member (parent or kid) can pick up an unassigned chore, signal that they are working on it, and mark it done. Race-protect claim and start so two devices cannot both succeed. Show every family member their own chores first, then unassigned chores, then chores held by others.

At milestone end:

- Any unassigned `chore_instance` is claimable by any family member via `claim_chore`. A second claim within the same race window returns a generic error.
- A claimed chore can be released back to the unassigned pool (`release_chore`), but only while `status = 'pending'`.
- A claimed chore can be started (`start_chore`) and finished (`finish_chore`). Auto-verification chores collapse `Finish` straight to `approved`. Parent-actor `Finish` also collapses to `approved` regardless of mode.
- Parent contributions credit the active family goal directly (no individual star ledger entry, no individual leaderboard impact).
- The kid home view and the new parent "My Chores" tab both sort: mine → unassigned → others'.
- `complete_chore` is removed. `submitted` is renamed to `finished` everywhere (data migration + RLS update + push templates + UI labels).

## Success criteria

Each is a binary gate.

1. Two devices tapping `Claim` on the same unassigned instance within 1 second produce exactly one paired `kid_devices`-style win + one explicit failure with message `'chore not claimable'`. The losing UI refreshes via realtime to show the winner's avatar.
2. A kid card cycles `pending → started → finished` via two taps (Start, Finish). An auto-verification chore collapses Finish to `approved` and writes a `star_ledger` row in the same transaction.
3. A parent card cycles `pending → started → approved` via two taps (Start, Finish) regardless of the chore's `verification_mode`. The active family goal's `current_progress` increments by `chore.star_value`. No `star_ledger` row is written for the parent.
4. The kid home query returns chores in the order: mine, then unassigned, then others', within each section sorted by `due_at` ascending. Approved chores are excluded from the active list (consistent with today).
5. Every existing RLS policy continues to pass. The RLS regression matrix at `supabase/tests/54_rls_regression_matrix.sql` is extended to include the new states and parent-as-actor scenarios.
6. `complete_chore` no longer exists in the database. Every previous caller has been migrated to `start_chore` + `finish_chore`.

## Out of scope (explicit deferrals)

- A persistent `family_pool_ledger` table for auditing parent contributions over time (only the live goal's `current_progress` is mutated; if no active goal exists at finish time, the credit is silently dropped).
- A "force release" or "re-assign" action for a `started` chore — parents already have direct UPDATE access via existing RLS and can intervene manually.
- Automatic timeout on `started` rows (a chore left in `started` indefinitely simply stays there; no cron purge).
- A parent toggle to disable chore equity (the "My Chores" tab is always available; families that don't want it just don't use it).
- Achievements or leaderboard slots for parents.
- Mid-flight migration UI — old clients displaying `submitted`-state rows during the rollout window will see "Submitted" as a label until next refresh; we accept the visual lag rather than ship a compatibility shim.
- Multi-actor chores (two siblings doing one chore together). Each chore_instance has exactly one assignee.

## Architecture overview

### State machine

```
                        Claim                 Start
   ┌──────────────┐  ─────────────────────►  ┌────────┐  ─────────►  ┌──────────┐
   │  pending     │       assignee = me      │ pending│              │ started  │
   │  unassigned  │  ◄─────────────────────  │ mine   │              │          │
   └──────────────┘        Release           └────────┘              └──────────┘
                                                                        │  Finish
                                                                        ▼
                                  ┌───────────┐    Approve    ┌──────────┐
                                  │ finished  │  ───────────► │ approved │  (terminal)
                                  │           │               │          │
                                  └───────────┘    Reject     └──────────┘
                                        │      ───────────► ┌──────────┐
                                        │                   │ rejected │
                                        │                   └────┬─────┘
                                        │                        │  Start (re-attempt)
                                        ▼                        ▼
                                  (auto-mode Finish               started
                                   collapses straight             ...
                                   to approved.
                                   Parent-actor Finish
                                   also collapses to
                                   approved regardless
                                   of mode.)
```

### Threat / contract model

- Race protection is the database's atomic `UPDATE ... WHERE <state guard>` semantics. No application locks, no version columns, no SELECT-FOR-UPDATE in normal paths. The `WHERE` clause is the contract; `if not FOUND then raise` is the enforcement.
- Actor authorization: a single helper `resolve_actor_profile_id` is the gate for every new RPC. It rejects (a) callers outside the actor's family, (b) kid sessions trying to act as a different profile.
- Parents writing chore_instances directly via PostgREST is already RLS-permitted (UPDATE policy from `20260508000002_chore_instances_table.sql`). The new RPCs are the *intended* path; the direct write path is an emergency override that this design does not remove.

### Coexistence with the m10 kid-device flow

Nothing about kid sessions, `current_family_id()`, or `current_kid_id()` changes. The new RPCs use those helpers exactly as the m10 RPCs do. The parent-actor extension is additive — parent sessions resolve their actor via `profiles where user_id = auth.uid() and type = 'parent'`, kid sessions via `current_kid_id()`.

## Data model

### Schema migration

```sql
-- 1) Old check, off
alter table public.chore_instances drop constraint chore_instances_status_check;

-- 2) Rename existing data
update public.chore_instances set status = 'finished' where status = 'submitted';

-- 3) New check
alter table public.chore_instances add constraint chore_instances_status_check
  check (status in ('pending','started','finished','approved','rejected'));

-- 4) Audit timestamps
alter table public.chore_instances
  add column started_at  timestamptz,
  add column finished_at timestamptz;

-- 5) Indexes referencing old status set
drop index if exists chore_instances_open_assignee_idx;
create index chore_instances_open_assignee_idx
  on public.chore_instances(assignee_profile_id, due_at)
  where status in ('pending','started','finished','rejected');
```

`completed_at` retains its existing meaning ("when the actor said they were done with it"). It is written at finish time in every mode: for auto/parent it equals `finished_at` which equals `approved_at`; for photo/approval it equals `finished_at` and `approved_at` is filled in later when a parent reviews. For clarity in the data migration:

- Existing `submitted` rows already have `completed_at` set; we copy that into `finished_at` so the audit trail is preserved:
  ```sql
  update public.chore_instances set finished_at = completed_at where status = 'finished' and finished_at is null;
  ```

No new tables.

### Helper functions

```sql
create or replace function public.resolve_actor_profile_id(p_actor_profile_id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare v_family uuid; v_kid uuid; v_actor_family uuid; v_actor_type text;
begin
  v_family := public.current_family_id();
  if v_family is null then raise exception 'caller not in a family'; end if;

  v_kid := public.current_kid_id();
  if v_kid is not null and v_kid <> p_actor_profile_id then
    raise exception 'kid session may only act as itself';
  end if;

  select family_id, type into v_actor_family, v_actor_type
    from public.profiles where id = p_actor_profile_id;
  if v_actor_family is null or v_actor_family <> v_family then
    raise exception 'actor not in caller family';
  end if;

  return p_actor_profile_id;
end $$;
```

```sql
create or replace function public.credit_family_pool(p_family_id uuid, p_amount int)
returns void language sql security definer set search_path = public
as $$
  update public.family_goals
     set current_progress = least(target_progress, current_progress + p_amount)
   where family_id = p_family_id and status = 'active'
$$;
```

`credit_family_pool` is a no-op when there is no active goal (the UPDATE affects zero rows). The existing `goal_completion_trigger` (from m8) fires once the new `current_progress` reaches `target_progress`; the `least(...)` clamp prevents overshoot.

## RPCs

Four new RPCs replace `complete_chore`. Each begins with `perform public.resolve_actor_profile_id(actor_profile_id)` for shared validation.

### `claim_chore(instance_id uuid, actor_profile_id uuid) returns void`

```sql
update public.chore_instances
   set assignee_profile_id = actor_profile_id
 where id = instance_id
   and family_id = public.current_family_id()
   and assignee_profile_id is null
   and status = 'pending';
if not found then raise exception 'chore not claimable'; end if;
```

The combined `assignee_profile_id is null AND status = 'pending'` clause is the race-protection gate. Realtime subscribers on `chore_instances` see the UPDATE and refresh their UI. The losing client receives the exception, surfaces a toast, and its realtime subscription delivers the winner's identity.

### `release_chore(instance_id uuid, actor_profile_id uuid) returns void`

```sql
update public.chore_instances
   set assignee_profile_id = null
 where id = instance_id
   and family_id = public.current_family_id()
   and assignee_profile_id = actor_profile_id
   and status = 'pending';
if not found then raise exception 'chore not releasable'; end if;
```

Allowed only when the caller is the current assignee AND the chore is still in `pending`. A `started` chore cannot be released; only a parent's direct UPDATE can rescue it.

### `start_chore(instance_id uuid, actor_profile_id uuid) returns void`

```sql
update public.chore_instances
   set status = 'started', started_at = now(),
       rejection_reason = null, approved_by = null, approved_at = null
 where id = instance_id
   and family_id = public.current_family_id()
   and assignee_profile_id = actor_profile_id
   and status in ('pending', 'rejected');
if not found then raise exception 'chore not startable'; end if;
```

Accepts `pending` for first-time starts and `rejected` for re-attempts (mirrors the 2026-05-18 redefinition of `complete_chore`).

### `finish_chore(instance_id uuid, actor_profile_id uuid, photo_url text default null) returns void`

The most complex of the four. Reads `verification_mode` from the joined chore and `type` from the actor profile, then dispatches:

```sql
declare
  v_mode text;
  v_actor_type text;
  v_chore_id uuid;
  v_star_value int;
  v_family uuid;
begin
  perform public.resolve_actor_profile_id(actor_profile_id);

  select c.verification_mode, c.star_value, ci.chore_id, ci.family_id, p.type
    into v_mode, v_star_value, v_chore_id, v_family, v_actor_type
    from public.chore_instances ci
    join public.chores c on c.id = ci.chore_id
    join public.profiles p on p.id = actor_profile_id
   where ci.id = instance_id
     and ci.assignee_profile_id = actor_profile_id
     and ci.status = 'started'
   for update;
  if not found then raise exception 'chore not finishable'; end if;

  if v_actor_type = 'parent' then
    update public.chore_instances
       set status = 'approved', finished_at = now(),
           approved_at = now(), approved_by = actor_profile_id,
           completed_at = now(), completed_by = actor_profile_id
     where id = instance_id;
    perform public.credit_family_pool(v_family, v_star_value);
    return;
  end if;

  if v_mode = 'auto' then
    update public.chore_instances
       set status = 'approved', finished_at = now(),
           approved_at = now(), approved_by = actor_profile_id,
           completed_at = now(), completed_by = actor_profile_id
     where id = instance_id;
    -- star_ledger trigger fires on status flip to 'approved' (existing m8 trigger)
    return;
  end if;

  if v_mode = 'photo' then
    if photo_url is null or length(photo_url) = 0 then
      raise exception 'photo_url required for photo verification mode';
    end if;
    update public.chore_instances
       set status = 'finished', finished_at = now(),
           completed_at = now(), completed_by = actor_profile_id,
           photo_url = finish_chore.photo_url
     where id = instance_id;
    return;
  end if;

  -- approval mode
  update public.chore_instances
     set status = 'finished', finished_at = now(),
         completed_at = now(), completed_by = actor_profile_id
   where id = instance_id;
end;
```

### Modified RPCs

`approve_chore` and `reject_chore` change input state filter from `'submitted'` to `'finished'`. No signature change. One-line edit each.

### Removed RPCs

`complete_chore` is dropped. Migration ensures every caller in `mobile/` and `supabase/functions/` is updated to `start_chore` + `finish_chore` first.

## Client UX

### List ordering query

The kid home query at `mobile/app/(app)/kid/[profileId]/index.tsx:87-105` is replaced with:

```sql
select id, status, assignee_profile_id, due_at, rejection_reason,
       chore:chores(id, title, star_value, verification_mode, recurrence),
       assignee:profiles!chore_instances_assignee_profile_id_fkey(id, display_name, avatar_id)
  from public.chore_instances
 where family_id = public.current_family_id()
   and status in ('pending', 'started', 'finished', 'rejected')
   and due_at >= <start_of_day> and due_at < <end_of_day>
 order by
   case
     when assignee_profile_id = $1 then 0
     when assignee_profile_id is null then 1
     else 2
   end,
   due_at asc;
```

`$1` is the caller's actor id (`profileId` for kids, the parent's own `profiles.id` for the parent My Chores tab). The same query template serves both views.

### Card variants

```
MINE                   AVAILABLE             OTHERS'
┌───────────────────┐  ┌───────────────────┐ ┌───────────────────┐
│ Brush teeth       │  │ Vacuum living rm  │ │ Walk the dog      │
│ ★ 5  · 8:00 AM    │  │ ★ 10 · today      │ │ ★ 8  · 5:00 PM    │
│ [Start] [Release] │  │ [Claim]           │ │ 🐻 Theo · started │
└───────────────────┘  └───────────────────┘ └───────────────────┘
```

Action button matrix:

| State | Mine | Unassigned | Others' |
|---|---|---|---|
| `pending` | `[Start]` `[Release]` | `[Claim]` | "Claimed by {name}" |
| `started` | `[Finish]` | n/a | "{name} · in progress" |
| `finished` | (waiting parent review) | n/a | "{name} · awaiting review" |
| `rejected` | `[Start]` (re-attempt) | n/a | "{name} · rejected" |

`Finish` in photo-verification mode opens the existing photo capture screen at `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx` instead of submitting directly.

Cards in the "Others'" section render the assignee's avatar + first name. Cards in "Available" render no assignee.

### Parent My Chores tab

A new top-level tab on parent navigation, parallel to "Approvals". Same query, same card grid. Hidden when the parent has zero chores in any of the three sections (the My Chores tab disappears for families that never assign anything to parents).

The parent home dashboard adds a small "you have {N} chores today" badge on the parent's own avatar in the picker — same affordance as the existing kid picker.

### Approvals label

`mobile/app/(app)/parent/approvals.tsx` queries `status = 'finished'` instead of `'submitted'`. All visible labels referring to "Submitted" change to "Finished" or "Ready for review" depending on context.

### Realtime

The existing `subscribeToFamily` realtime channel at `mobile/src/lib/realtime.ts` already streams `chore_instances` UPDATEs. No new subscription required. The card re-renders automatically when the row's status or `assignee_profile_id` changes — covering both the win path (your own claim succeeds) and the loss path (someone else's claim arrives, your "Claim" button replaced with a read-only "Claimed by X" badge).

## Migration order

One PR on a single feature branch. Sequencing:

1. Schema migration: status enum + audit columns + index.
2. Helper functions: `resolve_actor_profile_id`, `credit_family_pool`.
3. New RPCs: `claim_chore`, `release_chore`, `start_chore`, `finish_chore`.
4. Update `approve_chore` / `reject_chore` input-state filter.
5. Drop `complete_chore`.
6. Update push notification triggers / templates that reference `'submitted'`. Enumeration step: `grep -rn "'submitted'" supabase/migrations/`.
7. Mobile: replace `complete_chore` calls; introduce new card component; rewrite kid-home query; build parent My Chores tab; update approvals labels.
8. RLS regression matrix extension.
9. Manual two-device race test before merge.

## Testing

### pgTAP per RPC (one test file each, in `supabase/tests/`)

- `claim_chore` — happy path (parent acts as self, parent acts as kid, kid acts as self), race (second concurrent attempt raises), foreign-family rejection, wrong-state rejection (`started`, `finished`).
- `release_chore` — happy path; raises when chore is `started`; raises when caller is not the current assignee.
- `start_chore` — happy from `pending`, happy from `rejected` (re-attempt); raises if assignee is someone else; raises if status is `started`/`finished`/`approved`.
- `finish_chore` — six-cell matrix: (auto | photo | approval) × (kid | parent). Kid-auto inserts star_ledger row + goal trigger fires. Kid-photo requires photo_url. Parent-anything calls `credit_family_pool` and does NOT touch star_ledger.

### pgTAP for helpers

- `resolve_actor_profile_id` — returns the actor id on success; raises on (no family, kid acting as non-self, actor in different family).
- `credit_family_pool` — no-op when no active goal; correct clamp at `target_progress`; idempotent at goal completion.

### RLS regression matrix update

`supabase/tests/54_rls_regression_matrix.sql` gets new assertions:
- A parent's own SELECT against `chore_instances` returns mine + unassigned + others'.
- A kid's SELECT returns the same set (kid sessions and parent sessions see identical family-scoped data per the m10 policy extension).
- An orphan anon session returns zero rows.

### Mobile tests

- Card component snapshots: 4 states × 3 ownership shapes = 12 cells.
- Kid-home query integration: insert fixture instances spanning the four states, verify ordering.
- Parent My Chores: smoke render with one of each section.
- Approvals label: snapshot updated.

### Manual two-emulator gate

Boot two emulators (parent on A, kid on B with paired m10 device). Parent creates an unassigned chore. Both A's parent-side and B's kid-side see it in their "Available" section.

1. A taps Claim. B sees the row jump to "Others'" with parent's avatar within 1 second (realtime).
2. A reverses: A taps Release. B sees it return to "Available".
3. Race: both A and B tap Claim within 200ms. Exactly one wins. The loser sees the error toast and the card refreshes to show the winner.
4. A starts and finishes (parent-actor): row disappears from active list, family goal progress increments.
5. B starts and finishes a photo-mode chore: row moves to A's approvals tab with status `finished`. A approves; B sees stars credited.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `submitted → finished` rename breaks code paths we missed | Medium | High | `grep -rn "'submitted'"` enumeration in step 6 of migration order, plus the RLS regression matrix as a backstop |
| `complete_chore` removal breaks a caller we didn't find | Low | High | `grep -rn "complete_chore"` across `mobile/`, `supabase/functions/`, edge functions; replace before drop |
| Parent-doer pool credit dropped when no active family goal | Medium | Low | Spec accepts. Follow-up: optional ledger table |
| `started` rows accumulate forever | Medium | Low | Parent UPDATE override path exists; document as known operational concern |
| Race-protected `UPDATE ... WHERE assignee IS NULL` raises but the realtime UI update lags, so the user briefly sees "claimable" again | Low | Low | Realtime delivery is typically <500ms; the toast on raise explains; refetch on focus closes the gap |
| Active production rows in `submitted` visible to old clients during deploy window | High during deploy | Low | Single-line client-side fallback OR accept the visual lag; rows behave correctly server-side |
| Goal `current_progress` reaches `target_progress` simultaneously from kid star_ledger trigger AND parent pool credit | Low | Low | `goal_completion_trigger` is idempotent (checks status before flipping); `least(...)` clamp prevents overshoot |
| Adding parent-actor changes invalidate the m10 RLS regression matrix that assumed kid-only actor model | Medium | Medium | Extend the matrix in step 8; explicit assertions for parent-as-actor in each new RPC test |

## Open questions (resolved at execution time)

1. **Should `started_at` ever reset?** A `rejected → started` re-attempt — does `started_at` overwrite to the new start time, or preserve the original? Default to overwrite (the new attempt is what matters); flag if the audit team wants the history.
2. **Push notifications when a chore is claimed.** Today there's no notification for claim/release. Should the other family members get a passive "Theo claimed Vacuum" notification, or is the realtime UI update enough? Default to "no push" — UI update is sufficient and respects quiet hours implicitly.
3. **Parent "My Chores" tab visibility for single-parent families.** The tab is always visible. Is that OK, or should it be hidden when no parent-doable chores exist? Default to always-visible; trivial to change later.
4. **Migration of in-flight `submitted` rows during deploy.** Accept the visual lag, or ship a 1-week client-side fallback that displays unknown status values as "Submitted"? Default: accept the lag.

## Follow-ups deferred

- `family_pool_ledger` table for permanent audit of parent contributions.
- Force-release / re-assign action on a `started` chore for parents (use direct UPDATE for now).
- Cron to flag chores stuck in `started` for >24h.
- Parent achievements + leaderboard slots.
- Multi-actor (multiple siblings on one chore) — would require a different schema entirely.
- Family-setting toggle to disable chore equity (hide the parent My Chores tab).
- Push notifications on claim / release.
- Re-attempt history (preserving the original `started_at` across rejected → started transitions).
