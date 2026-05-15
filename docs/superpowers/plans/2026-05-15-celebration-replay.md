# Celebration Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay missed kid celebrations (chore approval, badge unlock, goal completion) on next kid-profile open, exactly-once cross-device, with a Confetti-Burst badge reveal.

**Architecture:** A server-side per-kid watermark column (`profiles.celebrations_seen_at`) advanced by a `SECURITY DEFINER` RPC. On kid-home mount a hook queries the three source tables for wins newer than the cursor, builds a capped+summary queue via a pure function, plays it through the existing `AchievementBanner` queue + confetti, then advances the cursor to the newest win seen. A lightweight live realtime subscription advances the cursor while the screen is open so nothing double-replays.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Expo React Native, TanStack Query, `react-native-confetti-cannon` (existing dep), Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-05-15-celebration-replay-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260515000001_celebrations_seen_cursor.sql` | Add cursor column + `mark_celebrations_seen` RPC (create) |
| `supabase/tests/46_mark_celebrations_seen.sql` | pgTAP: RPC auth + monotonicity (create) |
| `mobile/src/lib/celebrationQueue.ts` | Pure queue builder + shared types (create) |
| `mobile/tests/celebrationQueue.test.ts` | Unit tests for the pure builder (create) |
| `mobile/src/lib/celebrations.ts` | Module-level enqueue bus, mirrors `feedback.ts` `setConfettiFire` (create) |
| `mobile/src/components/AchievementBanner.tsx` | Add programmatic batch enqueue + `chore_approved`/`summary` variants + Confetti-Burst badge pop (modify) |
| `mobile/tests/achievementBanner.test.tsx` | Variant render + batch drain tests (create) |
| `mobile/src/hooks/useCelebrationCatchup.ts` | On-mount catch-up + live cursor advance (create) |
| `mobile/app/(app)/kid/[profileId]/index.tsx` | Invoke the hook (modify) |

**Live behavior is intentionally left untouched** (the existing kid-index `fireBigFeedback` chore subscription and `AchievementBanner`'s `on('achievement_unlocked'|'goal_completed')` listeners keep working for in-session wins). The hook's live subscription only advances the cursor, realizing spec §6.3 with minimal blast radius.

---

## Task 1: Cursor column + `mark_celebrations_seen` RPC

**Files:**
- Create: `supabase/migrations/20260515000001_celebrations_seen_cursor.sql`
- Test: `supabase/tests/46_mark_celebrations_seen.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/46_mark_celebrations_seen.sql`:

```sql
-- supabase/tests/46_mark_celebrations_seen.sql
begin;
select plan(5);

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'p@t.local'),
         ('22222222-2222-2222-2222-222222222222', 'other@t.local');
insert into public.families (id, name, timezone) values
  ('faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F', 'UTC'),
  ('fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'G', 'UTC');

insert into public.profiles (id, user_id, family_id, type, display_name, avatar_id)
values
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'P', 1),
  ('55555555-5555-5555-5555-555555555555',
   null, 'faaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid', 'Sara', 2),
  ('99999999-9999-9999-9999-999999999999',
   '22222222-2222-2222-2222-222222222222',
   'fbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent', 'Q', 1);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 1. From null, cursor is set.
select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                              '2026-05-15T10:00:00Z');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T10:00:00Z'::timestamptz,
  'null cursor gets set');

-- 2. Forward advance moves it.
select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                              '2026-05-15T12:00:00Z');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T12:00:00Z'::timestamptz,
  'forward advance moves cursor');

-- 3. Older timestamp does NOT move it backward (monotonic).
select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                              '2026-05-15T09:00:00Z');
select is(
  (select celebrations_seen_at from public.profiles
   where id='55555555-5555-5555-5555-555555555555'),
  '2026-05-15T12:00:00Z'::timestamptz,
  'older timestamp is ignored (monotonic)');

-- 4. A parent from a DIFFERENT family is rejected.
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T20:00:00Z') $$,
  NULL, NULL,
  'cross-family parent rejected');

-- 5. Anonymous rejected.
reset role;
set local "request.jwt.claims" to '{}';
select throws_ok(
  $$ select mark_celebrations_seen('55555555-5555-5555-5555-555555555555',
                                   '2026-05-15T20:00:00Z') $$,
  NULL, NULL,
  'anonymous rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it, verify it fails**

Run: `supabase test db` (from repo root, local Supabase running)
Expected: FAIL — `function mark_celebrations_seen(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260515000001_celebrations_seen_cursor.sql`:

```sql
-- supabase/migrations/20260515000001_celebrations_seen_cursor.sql
-- Per-kid watermark for in-app celebration replay. NULL = "never opened
-- since this feature shipped" — the client sets a baseline on first open
-- so historical wins are not dumped retroactively (see design §6.1).

alter table public.profiles
  add column celebrations_seen_at timestamptz;

-- Advance a kid profile's celebration cursor. Caller must be a parent in
-- the same family as p_profile_id. Monotonic: never moves backward, so
-- concurrent / out-of-order calls are safe.
create or replace function public.mark_celebrations_seen(
  p_profile_id uuid,
  p_seen_at    timestamptz
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_caller_family uuid;
  v_target_family uuid;
begin
  select family_id into v_caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';

  if v_caller_family is null then
    raise exception 'not_a_parent';
  end if;

  select family_id into v_target_family
  from public.profiles
  where id = p_profile_id;

  if v_target_family is null or v_target_family <> v_caller_family then
    raise exception 'profile_not_in_family';
  end if;

  update public.profiles
     set celebrations_seen_at =
           greatest(coalesce(celebrations_seen_at, 'epoch'::timestamptz), p_seen_at)
   where id = p_profile_id;
end;
$$;

revoke all on function public.mark_celebrations_seen(uuid, timestamptz) from public;
grant execute on function public.mark_celebrations_seen(uuid, timestamptz) to authenticated;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `supabase test db`
Expected: `46_mark_celebrations_seen.sql .. ok` — all 5 assertions pass; full suite still green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260515000001_celebrations_seen_cursor.sql supabase/tests/46_mark_celebrations_seen.sql
git commit -m "feat(db): celebrations_seen_at cursor + mark_celebrations_seen RPC"
```

---

## Task 2: Pure celebration-queue builder

**Files:**
- Create: `mobile/src/lib/celebrationQueue.ts`
- Test: `mobile/tests/celebrationQueue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/celebrationQueue.test.ts`:

```ts
import { buildCelebrationQueue, CELEBRATION_CAP } from '../src/lib/celebrationQueue';

const approval = (id: string, at: string, title = 'Dishes', stars = 3) =>
  ({ id, approved_at: at, title, stars });
const ach = (id: string, at: string, key = 'first_star') =>
  ({ id, unlocked_at: at, achievement_key: key });
const goal = (id: string, at: string, title = 'Pizza Night') =>
  ({ id, completed_at: at, title });

describe('buildCelebrationQueue', () => {
  it('returns empty + null maxAt when there are no wins', () => {
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals: [], achievements: [], goals: [], windowStarTotal: 0,
    });
    expect(r.items).toEqual([]);
    expect(r.maxAt).toBeNull();
  });

  it('merges all three sources sorted ascending by timestamp', () => {
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z',
      approvals: [approval('a1', '2026-05-02T10:00:00Z')],
      achievements: [ach('b1', '2026-05-02T09:00:00Z')],
      goals: [goal('g1', '2026-05-02T11:00:00Z')],
      windowStarTotal: 9,
    });
    expect(r.items.map((i) => i.kind)).toEqual(['achievement', 'chore_approved', 'goal']);
    expect(r.maxAt).toBe('2026-05-02T11:00:00Z');
  });

  it('plays the CAP most-recent items and appends a summary when over cap', () => {
    const approvals = Array.from({ length: CELEBRATION_CAP + 3 }, (_, i) =>
      approval(`a${i}`, `2026-05-1${i}T10:00:00Z`, 'Chore', 2));
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals, achievements: [], goals: [], windowStarTotal: 42,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP + 1);
    expect(r.items.slice(0, CELEBRATION_CAP).every((i) => i.kind === 'chore_approved')).toBe(true);
    const summary = r.items[CELEBRATION_CAP];
    expect(summary).toEqual({ kind: 'summary', moreCount: 3, extraStars: 42 });
    // The CAP played items are the most recent ones, still ascending.
    expect((r.items[0] as any).id).toBe('a3');
    expect((r.items[CELEBRATION_CAP - 1] as any).id).toBe(`a${CELEBRATION_CAP + 2}`);
  });

  it('does not append a summary at exactly the cap', () => {
    const approvals = Array.from({ length: CELEBRATION_CAP }, (_, i) =>
      approval(`a${i}`, `2026-05-0${i + 1}T10:00:00Z`));
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals, achievements: [], goals: [], windowStarTotal: 0,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP);
    expect(r.items.some((i) => i.kind === 'summary')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd mobile && npx jest celebrationQueue --ci`
Expected: FAIL — `Cannot find module '../src/lib/celebrationQueue'`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/lib/celebrationQueue.ts`:

```ts
// Pure, dependency-free celebration-queue builder. All scheduling/cap/
// summary logic lives here so it is fully unit-testable. The hook
// (useCelebrationCatchup) supplies already-fetched rows.

export type CelebrationItem =
  | { kind: 'chore_approved'; id: string; at: string; title: string; stars: number }
  | { kind: 'achievement'; id: string; at: string; achievementKey: string }
  | { kind: 'goal'; id: string; at: string; title: string }
  | { kind: 'summary'; moreCount: number; extraStars: number };

export type RawApproval = { id: string; approved_at: string; title: string; stars: number };
export type RawAchievement = { id: string; unlocked_at: string; achievement_key: string };
export type RawGoal = { id: string; completed_at: string; title: string };

export type BuildInput = {
  cursor: string | null;
  approvals: RawApproval[];
  achievements: RawAchievement[];
  goals: RawGoal[];
  windowStarTotal: number;
};

export type BuildResult = { items: CelebrationItem[]; maxAt: string | null };

export const CELEBRATION_CAP = 5;

const ts = (s: string) => new Date(s).getTime();

export function buildCelebrationQueue(input: BuildInput): BuildResult {
  const merged: Exclude<CelebrationItem, { kind: 'summary' }>[] = [
    ...input.approvals.map((a) => ({
      kind: 'chore_approved' as const, id: a.id, at: a.approved_at, title: a.title, stars: a.stars,
    })),
    ...input.achievements.map((a) => ({
      kind: 'achievement' as const, id: a.id, at: a.unlocked_at, achievementKey: a.achievement_key,
    })),
    ...input.goals.map((g) => ({
      kind: 'goal' as const, id: g.id, at: g.completed_at, title: g.title,
    })),
  ];

  if (merged.length === 0) return { items: [], maxAt: null };

  merged.sort((x, y) => ts(x.at) - ts(y.at));
  const maxAt = merged[merged.length - 1].at;

  if (merged.length <= CELEBRATION_CAP) {
    return { items: merged, maxAt };
  }

  const played = merged.slice(merged.length - CELEBRATION_CAP); // most recent CAP, still ascending
  const moreCount = merged.length - CELEBRATION_CAP;
  const items: CelebrationItem[] = [
    ...played,
    { kind: 'summary', moreCount, extraStars: input.windowStarTotal },
  ];
  return { items, maxAt };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd mobile && npx jest celebrationQueue --ci`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/celebrationQueue.ts mobile/tests/celebrationQueue.test.ts
git commit -m "feat(mobile): pure celebration-queue builder (cap + summary)"
```

---

## Task 3: Celebration enqueue bus

**Files:**
- Create: `mobile/src/lib/celebrations.ts`

Mirrors the established `feedback.ts` `setConfettiFire` pattern (module-level setter + caller; a host component registers the real implementation).

- [ ] **Step 1: Write the implementation**

Create `mobile/src/lib/celebrations.ts`:

```ts
// Module-level bridge so the kid-screen hook can push a batch of
// celebrations into the app-global AchievementBanner without prop
// drilling. Mirrors feedback.ts setConfettiFire (Task 13 pattern).
import type { CelebrationItem } from './celebrationQueue';

let enqueueFn: ((items: CelebrationItem[]) => void) | null = null;

export function setCelebrationEnqueue(fn: (items: CelebrationItem[]) => void) {
  enqueueFn = fn;
}

export function enqueueCelebrations(items: CelebrationItem[]): void {
  if (items.length === 0) return;
  try { enqueueFn?.(items); } catch {}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (the pre-existing `settings.tsx:247` goals-route error may still appear — unrelated; see spec §9).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/celebrations.ts
git commit -m "feat(mobile): celebration enqueue bus"
```

---

## Task 4: Extend AchievementBanner (variants + batch + Confetti-Burst)

**Files:**
- Modify: `mobile/src/components/AchievementBanner.tsx`
- Test: `mobile/tests/achievementBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/tests/achievementBanner.test.tsx`:

```tsx
import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AchievementBanner } from '../src/components/AchievementBanner';
import { enqueueCelebrations } from '../src/lib/celebrations';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, o?: any) => o?.title ?? k }) }));
jest.mock('expo-router', () => ({ useSegments: () => ['(app)', 'kid', '[profileId]'] }));
jest.mock('../src/lib/feedback', () => ({ fireAchievementFeedback: jest.fn() }));

describe('AchievementBanner programmatic queue', () => {
  it('renders a chore_approved card then an achievement card in order', async () => {
    const { getByText, queryByText } = render(<AchievementBanner />);
    act(() => {
      enqueueCelebrations([
        { kind: 'chore_approved', id: 'a1', at: 'x', title: 'Dishes', stars: 3 },
        { kind: 'achievement', id: 'b1', at: 'y', achievementKey: 'first_star' },
      ]);
    });
    await waitFor(() => expect(getByText(/Dishes/)).toBeTruthy());
    expect(queryByText('First Star')).toBeNull(); // queued, not yet shown
  });

  it('renders a summary card', async () => {
    const { getByText } = render(<AchievementBanner />);
    act(() => {
      enqueueCelebrations([{ kind: 'summary', moreCount: 3, extraStars: 12 }]);
    });
    await waitFor(() => expect(getByText(/3/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd mobile && npx jest achievementBanner --ci`
Expected: FAIL — `enqueueCelebrations` has no registered host (no card renders); `chore_approved`/`summary` not handled.

- [ ] **Step 3: Rewrite `AchievementBanner.tsx`**

Replace the entire contents of `mobile/src/components/AchievementBanner.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { on } from '../lib/events';
import { setCelebrationEnqueue } from '../lib/celebrations';
import type { CelebrationItem } from '../lib/celebrationQueue';
import { ACHIEVEMENTS, type AchievementKey } from '../constants/achievements';
import { fireAchievementFeedback } from '../lib/feedback';

type Queued = (CelebrationItem & { _id: number });

const DISPLAY_MS = 4000;

export function AchievementBanner() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<Queued | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const counter = useRef(0);

  // Live realtime path is still gated to kid mode (parent who approved
  // does not get a banner). Programmatic batches come from the kid
  // screen hook and are already kid-context, so they bypass the gate.
  const segments = useSegments();
  const inKidMode = segments.some((s) => s === 'kid');
  const inKidModeRef = useRef(inKidMode);
  inKidModeRef.current = inKidMode;

  const push = (items: CelebrationItem[]) => {
    setQueue((q) => [
      ...q,
      ...items.map((it) => ({ ...it, _id: (counter.current += 1) })),
    ]);
  };

  // Programmatic batch enqueue (catch-up replay).
  useEffect(() => {
    setCelebrationEnqueue(push);
    return () => setCelebrationEnqueue(() => {});
  }, []);

  // Live realtime listeners (in-session wins) — unchanged behavior.
  useEffect(() => {
    const unsubA = on('achievement_unlocked', (p) => {
      if (!inKidModeRef.current) return;
      push([{ kind: 'achievement', id: String(counter.current), at: '', achievementKey: p.key }]);
    });
    const unsubG = on('goal_completed', (p) => {
      if (!inKidModeRef.current) return;
      push([{ kind: 'goal', id: String(counter.current), at: '', title: p.title }]);
    });
    return () => { unsubA(); unsubG(); };
  }, []);

  // Drain.
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    fireAchievementFeedback();
    const timer = setTimeout(() => setCurrent(null), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable onPress={() => setCurrent(null)} style={styles.card}>
        {renderBody(current, t)}
      </Pressable>
    </View>
  );
}

function renderBody(item: Queued, t: (k: string, o?: any) => string) {
  if (item.kind === 'chore_approved') {
    return (
      <>
        <Text style={styles.heading}>⭐ Chore approved!</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>+{item.stars} ⭐</Text>
      </>
    );
  }
  if (item.kind === 'goal') {
    return (
      <>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>{t('goals.completedBanner', { title: item.title })}</Text>
      </>
    );
  }
  if (item.kind === 'summary') {
    return (
      <>
        <Text style={styles.emoji}>🌟</Text>
        <Text style={styles.title}>Plus {item.moreCount} more while you were away!</Text>
        <Text style={styles.description}>+{item.extraStars} ⭐</Text>
      </>
    );
  }
  // achievement → Confetti-Burst reveal (medallion pop; confetti already
  // fired by fireAchievementFeedback in the drain effect).
  const a = ACHIEVEMENTS[item.achievementKey as AchievementKey];
  if (!a) return null;
  return <BadgeReveal emoji={a.emoji} title={a.title} description={a.description} />;
}

function BadgeReveal({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.18, useNativeDriver: true, friction: 4, tension: 120 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  }, [scale]);
  return (
    <>
      <Text style={styles.heading}>🏅 New Achievement!</Text>
      <Animated.Text style={[styles.emoji, { transform: [{ scale }] }]}>{emoji}</Animated.Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 999,
  },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', minWidth: 280, gap: 8 },
  heading: { fontSize: 14, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 },
  emoji: { fontSize: 64, marginVertical: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  description: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd mobile && npx jest achievementBanner --ci`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full mobile suite (no regressions)**

Run: `cd mobile && npm test -- --ci --watchman=false`
Expected: all suites pass (was 20/20, 82/82 before this feature; now higher with the new suites).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/AchievementBanner.tsx mobile/tests/achievementBanner.test.tsx
git commit -m "feat(mobile): AchievementBanner — chore/summary variants + Confetti-Burst badge reveal + batch enqueue"
```

---

## Task 5: `useCelebrationCatchup` hook

**Files:**
- Create: `mobile/src/hooks/useCelebrationCatchup.ts`

- [ ] **Step 1: Write the implementation**

Create `mobile/src/hooks/useCelebrationCatchup.ts`:

```ts
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { buildCelebrationQueue } from '../lib/celebrationQueue';
import type { RawApproval, RawAchievement, RawGoal } from '../lib/celebrationQueue';
import { enqueueCelebrations } from '../lib/celebrations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

async function advanceCursor(profileId: string, seenAt: string) {
  await rpc('mark_celebrations_seen', { p_profile_id: profileId, p_seen_at: seenAt });
}

export function useCelebrationCatchup(
  profileId: string | undefined,
  familyId: string | undefined,
) {
  // On-mount catch-up.
  useEffect(() => {
    if (!profileId || !familyId) return;
    let cancelled = false;

    (async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('celebrations_seen_at')
        .eq('id', profileId)
        .maybeSingle();

      const cursor = (prof as { celebrations_seen_at: string | null } | null)?.celebrations_seen_at ?? null;

      // First open since ship → set baseline, replay nothing (design §6.1).
      if (cursor === null) {
        await advanceCursor(profileId, new Date().toISOString());
        return;
      }

      const [appr, achs, gls] = await Promise.all([
        supabase
          .from('chore_instances')
          .select('id, approved_at, chore:chores(title, star_value)')
          .eq('completed_by', profileId)
          .eq('status', 'approved')
          .gt('approved_at', cursor),
        supabase
          .from('achievements')
          .select('id, unlocked_at, achievement_key')
          .eq('profile_id', profileId)
          .gt('unlocked_at', cursor),
        supabase
          .from('family_goals')
          .select('id, completed_at, title')
          .eq('family_id', familyId)
          .eq('status', 'completed')
          .gt('completed_at', cursor),
      ]);

      const approvals: RawApproval[] = (appr.data ?? []).map((r: any) => ({
        id: r.id, approved_at: r.approved_at,
        title: r.chore?.title ?? 'Chore', stars: r.chore?.star_value ?? 0,
      }));
      const achievements = (achs.data ?? []) as RawAchievement[];
      const goals = (gls.data ?? []) as RawGoal[];

      const provisional = buildCelebrationQueue({
        approvals, achievements, goals, windowStarTotal: 0,
      });
      if (!provisional.maxAt) return;

      // Star total in (cursor, maxAt] for the summary card.
      const { data: ledger } = await supabase
        .from('star_ledger')
        .select('delta')
        .eq('profile_id', profileId)
        .gt('created_at', cursor)
        .lte('created_at', provisional.maxAt);
      const windowStarTotal = (ledger ?? []).reduce(
        (s, r) => s + (r as { delta: number }).delta, 0);

      const { items, maxAt } = buildCelebrationQueue({
        approvals, achievements, goals, windowStarTotal,
      });
      if (cancelled || !maxAt) return;

      enqueueCelebrations(items);
      await advanceCursor(profileId, maxAt);
    })();

    return () => { cancelled = true; };
  }, [profileId, familyId]);

  // Live: keep the cursor moving while the screen is open so the next
  // mount's catch-up does not re-replay in-session wins. Display of
  // in-session wins is still handled by the existing live paths.
  useEffect(() => {
    if (!profileId || !familyId) return;
    const ch = supabase
      .channel(`celebration-cursor-${profileId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chore_instances',
        filter: `completed_by=eq.${profileId}`,
      }, (p) => {
        const n = p.new as { status?: string; approved_at?: string };
        if (n?.status === 'approved' && n.approved_at) advanceCursor(profileId, n.approved_at);
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'achievements',
        filter: `profile_id=eq.${profileId}`,
      }, (p) => {
        const n = p.new as { unlocked_at?: string };
        if (n?.unlocked_at) advanceCursor(profileId, n.unlocked_at);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'family_goals',
        filter: `family_id=eq.${familyId}`,
      }, (p) => {
        const o = p.old as { status?: string };
        const n = p.new as { status?: string; completed_at?: string };
        if (o?.status === 'active' && n?.status === 'completed' && n.completed_at) {
          advanceCursor(profileId, n.completed_at);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profileId, familyId]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (pre-existing `settings.tsx:247` only).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/hooks/useCelebrationCatchup.ts
git commit -m "feat(mobile): useCelebrationCatchup — on-mount replay + live cursor advance"
```

---

## Task 6: Wire the hook into kid-home

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx`

The screen already resolves `profileId` (route param) and `familyId` (existing query). Add the hook call; leave the existing live `fireBigFeedback` chore subscription in place (in-session confetti).

- [ ] **Step 1: Add the import**

In `mobile/app/(app)/kid/[profileId]/index.tsx`, add after the `useActiveGoal` import line (`import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';`):

```ts
import { useCelebrationCatchup } from '../../../../src/hooks/useCelebrationCatchup';
```

- [ ] **Step 2: Call the hook**

Immediately after the existing line `const activeGoal = useActiveGoal(familyId ?? undefined);` add:

```ts
  useCelebrationCatchup(profileId, familyId ?? undefined);
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/kid/[profileId]/index.tsx"
git commit -m "feat(mobile): wire celebration catch-up into kid-home"
```

---

## Task 7: Full verification

- [ ] **Step 1: pgTAP**

Run: `supabase test db`
Expected: all suites green including `46_mark_celebrations_seen.sql` (5/5).

- [ ] **Step 2: Typecheck + Jest**

Run: `cd mobile && npx tsc --noEmit && npm test -- --ci --watchman=false`
Expected: zero new tsc errors (pre-existing `settings.tsx:247` only); all Jest suites pass including `celebrationQueue` and `achievementBanner`.

- [ ] **Step 3: Manual acceptance (emulator)**

Walk the six exit criteria in spec §2.1. Key checks:
1. Approve 2 chores with kid screen closed → open kid → 2 confetti+card celebrations in sequence; reopen → nothing.
2. Trigger an achievement off-screen → open kid → Confetti-Burst badge reveal (medallion pops).
3. Complete a goal off-screen → each kid sees the goal banner once.
4. 8 missed wins → 5 recent play + "Plus 3 more … +N ⭐" summary; reopen → nothing.
5. Existing kid, first open after ship → no historical dump.
6. Celebrate on one device/profile, reopen elsewhere → no re-replay.

- [ ] **Step 4: Final commit (if any acceptance fixups)**

```bash
git add -A
git commit -m "fix(mobile): celebration replay acceptance fixups"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §2 decisions → Tasks 1–6; §2.1 exit criteria → Task 7 Step 3; §5 server → Task 1; §6.1 hook + null baseline → Task 5; §6.2 variants/Confetti-Burst/batch → Task 4; §6.3 double-play (cursor advance, live subscription) → Task 5; §8 testing → Tasks 1/2/4/7. No gaps.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO.
- **Type consistency:** `CelebrationItem`, `RawApproval/RawAchievement/RawGoal`, `buildCelebrationQueue`, `CELEBRATION_CAP`, `setCelebrationEnqueue`/`enqueueCelebrations`, `mark_celebrations_seen(p_profile_id, p_seen_at)` used identically across Tasks 1–6.
- **Scope:** single coherent subsystem; one plan.
- **Known accepted edge:** if the app is killed after a live celebration displays but before its cursor-advance RPC returns, that win may replay once on next open (rare; bounded by monotonic `greatest()`). Documented in spec §6.3 intent.
