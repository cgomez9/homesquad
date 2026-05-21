# UI Fixes Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the eleven UI fixes specified in `docs/superpowers/specs/2026-05-21-ui-fixes-batch-design.md` — chores-form verification picker, family-goal discoverability + description, kid-home dark-mode contrast, badges ribbon + locked legibility, approval-banner grouping, and the `first_star` → `stargazer` achievement dedup.

**Architecture:** Mostly theme-token refactors and contrast fixes confined to one file each, plus three behavioral changes: a new `approval_group` celebration item that collapses 2+ chore approvals into one banner, a soft empty-state tile on the parent home that links to the goal-create flow, and a new `stargazer` achievement (10-star threshold) that replaces the `>= 1` `first_star` candidate in the SQL `check_achievements` function with a backfill of existing rows.

**Tech Stack:** Expo React Native (existing tooling), Supabase Postgres + pgTAP, Jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-21-ui-fixes-batch-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `mobile/src/components/VerificationModePicker.tsx` | Theme-token refactor, i18n, fix alignment (modify) |
| `mobile/src/i18n/locales/en.json` | New keys: `forms.verification.*`, `parent.setGoalCta.*`, `goals.purposeBlurb`, `celebration.choresApproved`, `achievements.stargazer`; remove `achievements.first_star`, `badges.earned` if unused (modify) |
| `mobile/src/i18n/locales/es.json` | Spanish equivalents (modify) |
| `mobile/app/(app)/parent/index.tsx` | Add empty-state goal tile (modify) |
| `mobile/app/(app)/parent/goals/index.tsx` | Add purpose blurb on no-goal empty state (modify) |
| `mobile/app/(app)/parent/goals/create.tsx` | Add purpose blurb under screen title (modify) |
| `mobile/src/components/GoalCard.tsx` | Render `goal.description` when present (modify) |
| `mobile/app/(app)/kid/[profileId]/index.tsx` | Switch-arrow color + hero text always-dark (modify) |
| `mobile/app/(app)/kid/[profileId]/badges.tsx` | Replace ribbon with medallion ✓ seal; locked-card dark-mode tokens (modify) |
| `mobile/src/lib/celebrationQueue.ts` | New `approval_group` kind + grouping logic (modify) |
| `mobile/tests/celebrationQueue.test.ts` | New cases for grouping (modify) |
| `mobile/src/components/AchievementBanner.tsx` | Render `approval_group` (modify) |
| `mobile/src/constants/achievements.ts` | `first_star` → `stargazer` (modify) |
| `supabase/migrations/20260521000001_first_star_to_stargazer.sql` | Update `check_achievements` + rename rows (create) |
| `supabase/tests/34_check_achievements.sql` | Update test 3 + test 5 + test 12 + test 8 for new threshold (modify) |
| `supabase/tests/35_approve_chore_achievement_integration.sql` | Star value 1→10 + assertion key (modify) |
| `supabase/tests/33_achievements_rls.sql` | Rename string literals (modify) |
| `supabase/functions/send_push_drain/index.ts` | `first_star` entry → `stargazer` (modify) |
| `mobile/tests/achievementBanner.test.tsx`, `mobile/tests/celebrationQueue.test.ts`, `mobile/tests/events.test.ts` | Rename `first_star` → `stargazer` literals (modify) |

---

## Task 1: VerificationModePicker — theme tokens, i18n, alignment (issues 1+2)

**Files:**
- Modify: `mobile/src/components/VerificationModePicker.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add new i18n keys (en)**

Open `mobile/src/i18n/locales/en.json` and add a `verification` block inside the existing `forms` block (after `couldNotUpdateReward` if present, otherwise just before `forms`'s closing `}`):

```json
"verification": {
  "label": "Verification",
  "auto": { "label": "Auto", "hint": "Tap done = done" },
  "photo": { "label": "Photo", "hint": "Kid sends a photo" },
  "approval": { "label": "Approval", "hint": "Parent confirms" }
}
```

- [ ] **Step 2: Add new i18n keys (es)**

Open `mobile/src/i18n/locales/es.json` and add the same block (matching the same nesting level) inside `forms`:

```json
"verification": {
  "label": "Verificación",
  "auto": { "label": "Auto", "hint": "Tocar listo = listo" },
  "photo": { "label": "Foto", "hint": "El niño envía una foto" },
  "approval": { "label": "Aprobación", "hint": "Un adulto confirma" }
}
```

- [ ] **Step 3: Rewrite `VerificationModePicker.tsx` to use theme + i18n**

Replace the entire contents of `mobile/src/components/VerificationModePicker.tsx` with:

```tsx
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

export type VerificationMode = 'auto' | 'photo' | 'approval';

const MODES: VerificationMode[] = ['auto', 'photo', 'approval'];

export function VerificationModePicker({
  value,
  onChange,
}: {
  value: VerificationMode;
  onChange: (v: VerificationMode) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.label}>{t('forms.verification.label')}</Text>
      <View style={styles.row}>
        {MODES.map((m) => {
          const sel = m === value;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              style={[styles.btn, sel && styles.btnSel]}
            >
              <Text style={[styles.btnLabel, sel && styles.btnLabelSel]}>
                {t(`forms.verification.${m}.label`)}
              </Text>
              <Text
                style={[styles.btnHint, sel && styles.btnHintSel]}
                numberOfLines={2}
              >
                {t(`forms.verification.${m}.hint`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: {
      fontSize: typography.small,
      fontFamily: typography.fontFamilyBold,
      color: colors.textMuted,
      marginBottom: spacing.xs + 2,
    },
    row: { flexDirection: 'row', gap: spacing.sm },
    btn: {
      flex: 1,
      minHeight: 64,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    btnSel: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    btnLabel: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.text,
    },
    btnLabelSel: { color: '#fff' },
    btnHint: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.tiny,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 14,
    },
    btnHintSel: { color: 'rgba(255,255,255,0.88)' },
  });
```

- [ ] **Step 4: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (any pre-existing errors remain unchanged).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/VerificationModePicker.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "fix(mobile): VerificationModePicker — theme tokens + i18n + aligned tiles"
```

---

## Task 2: Parent home — empty-state goal tile (issue 3)

**Files:**
- Modify: `mobile/app/(app)/parent/index.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, add inside the `parent` block (alongside `choresEmpty`, etc.):

```json
"setGoalCta": {
  "title": "Set a family goal",
  "blurb": "Rally everyone toward a shared treat — pizza, a movie, anything."
}
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, add inside the `parent` block:

```json
"setGoalCta": {
  "title": "Crea una meta familiar",
  "blurb": "Reúnan a todos por un premio compartido — pizza, una peli, lo que sea."
}
```

- [ ] **Step 3: Add the empty-state tile to the parent home**

Open `mobile/app/(app)/parent/index.tsx`. In the `header` JSX block, find the `activeGoal.data` check (around line 98-105 in the spec snapshot). Replace it with:

```tsx
{activeGoal.data ? (
  <Pressable
    onPress={() => router.push('/(app)/parent/goals' as never)}
    style={styles.goalWrap}
  >
    <GoalCard goal={activeGoal.data} />
  </Pressable>
) : familyId && !activeGoal.isLoading ? (
  <Pressable
    onPress={() => router.push('/(app)/parent/goals/create' as never)}
    accessibilityRole="button"
    accessibilityLabel={t('parent.setGoalCta.title')}
    style={styles.goalCta}
  >
    <Text style={styles.goalCtaEmoji}>🎯</Text>
    <View style={styles.goalCtaText}>
      <Text style={styles.goalCtaTitle}>{t('parent.setGoalCta.title')}</Text>
      <Text style={styles.goalCtaBlurb}>{t('parent.setGoalCta.blurb')}</Text>
    </View>
    <Text style={styles.goalCtaChevron}>›</Text>
  </Pressable>
) : null}
```

- [ ] **Step 4: Add the new styles**

In the same file, inside `makeStyles(colors)`, add (just after `goalWrap`):

```ts
goalCta: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.md,
  backgroundColor: colors.surface,
  borderRadius: 18,
  paddingVertical: spacing.md + 2,
  paddingHorizontal: spacing.lg,
  marginBottom: spacing.sm,
  borderWidth: 1.5,
  borderColor: colors.border,
  borderStyle: 'dashed',
},
goalCtaEmoji: { fontSize: 26 },
goalCtaText: { flex: 1, minWidth: 0 },
goalCtaTitle: {
  fontFamily: typography.fontFamilyBold,
  fontSize: typography.body,
  color: colors.text,
},
goalCtaBlurb: {
  fontFamily: typography.fontFamilySemi,
  fontSize: typography.small,
  color: colors.textMuted,
  marginTop: 2,
},
goalCtaChevron: {
  fontSize: 22,
  color: colors.textMuted,
  fontFamily: typography.fontFamilyBold,
},
```

- [ ] **Step 5: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/(app)/parent/index.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): parent home — soft empty-state tile for family goal"
```

---

## Task 3: Goal screens — purpose explainer (issue 4)

**Files:**
- Modify: `mobile/app/(app)/parent/goals/index.tsx`
- Modify: `mobile/app/(app)/parent/goals/create.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add the explainer i18n key (en)**

In `mobile/src/i18n/locales/en.json`, add inside the `goals` block:

```json
"purposeBlurb": "A family goal rallies everyone toward a shared treat. Set a target — every kid's stars roll up together until you reach it."
```

- [ ] **Step 2: Add the explainer i18n key (es)**

In `mobile/src/i18n/locales/es.json`, add inside the `goals` block:

```json
"purposeBlurb": "Una meta familiar reúne a todos hacia un premio compartido. Define un objetivo — las estrellas de los niños se suman juntas hasta llegar."
```

- [ ] **Step 3: Show the blurb on the no-goal empty state**

In `mobile/app/(app)/parent/goals/index.tsx`, find the `else` branch where the empty card is rendered (looks like `<View style={styles.empty}>...<Text style={styles.emptyEmoji}>🎯</Text>...`). Replace the contents of `styles.empty` view with:

```tsx
<View style={styles.empty}>
  <Text style={styles.emptyEmoji}>🎯</Text>
  <Text style={styles.emptyText}>{i18n.t('goals.noActive')}</Text>
  <Text style={styles.emptyBlurb}>{i18n.t('goals.purposeBlurb')}</Text>
  <CreateButton onPress={() => router.push('/(app)/parent/goals/create')} />
</View>
```

Then add a new style in the same file's `makeStyles`:

```ts
emptyBlurb: {
  fontFamily: typography.fontFamilySemi,
  fontSize: typography.small,
  color: colors.textMuted,
  textAlign: 'center',
  marginTop: spacing.xs,
  marginHorizontal: spacing.md,
  lineHeight: 18,
},
```

- [ ] **Step 4: Show the blurb on the create screen**

In `mobile/app/(app)/parent/goals/create.tsx`, locate the `topbar` block. Directly **after** the closing `</View>` of the topbar and **before** the `<View style={styles.card}>`, insert:

```tsx
<Text style={styles.blurb}>{i18n.t('goals.purposeBlurb')}</Text>
```

Then in the same file's `makeStyles`, add:

```ts
blurb: {
  fontFamily: typography.fontFamilySemi,
  fontSize: typography.small,
  color: colors.textMuted,
  marginBottom: spacing.lg,
  lineHeight: 18,
},
```

- [ ] **Step 5: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/(app)/parent/goals/index.tsx mobile/app/(app)/parent/goals/create.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): family goals — purpose blurb on empty + create"
```

---

## Task 4: GoalCard renders description (issue 5)

**Files:**
- Modify: `mobile/src/components/GoalCard.tsx`

- [ ] **Step 1: Render description below the title**

In `mobile/src/components/GoalCard.tsx`, in the JSX returned from `body`, insert a conditional description line right after the `<Text style={styles.title}>{goal.title}</Text>`:

```tsx
<Text style={styles.title}>{goal.title}</Text>
{goal.description ? (
  <Text style={styles.description}>{goal.description}</Text>
) : null}
```

- [ ] **Step 2: Add the description style**

In the same file, inside `makeStyles(colors)`, add (after `title`):

```ts
description: {
  fontSize: typography.small,
  fontFamily: typography.fontFamilySemi,
  fontStyle: 'italic',
  color: colors.textMuted,
  lineHeight: 18,
},
```

- [ ] **Step 3: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/GoalCard.tsx
git commit -m "feat(mobile): GoalCard — render goal description under title"
```

---

## Task 5: Kid home — switch arrow color + hero text always-dark (issues 6+8)

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx`

- [ ] **Step 1: Give the nav icon an explicit color**

In `mobile/app/(app)/kid/[profileId]/index.tsx`, inside `makeStyles(colors)`, find the `navIcon` style:

```ts
navIcon: { fontSize: 17 },
```

Replace with:

```ts
navIcon: { fontSize: 17, color: colors.text },
```

- [ ] **Step 2: Pin hero text to dark colors**

In the same `makeStyles(colors)` block, find `heroBig` and `heroLbl`:

```ts
heroBig: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text },
heroLbl: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
```

Replace with (literal hex — explicitly not tracking theme so the warm hero tiles stay readable in dark mode too):

```ts
heroBig: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: '#134E4A' },
heroLbl: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#5C7A78' },
```

- [ ] **Step 3: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/(app)/kid/[profileId]/index.tsx
git commit -m "fix(mobile): kid home — switch arrow color + hero text readable in dark"
```

---

## Task 6: Badges — medallion ✓ seal replaces overlapping ribbon (issue 7)

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/badges.tsx`

- [ ] **Step 1: Replace the ribbon with a medallion seal in JSX**

In `mobile/app/(app)/kid/[profileId]/badges.tsx`, find the `BadgeCard` component's returned JSX. Replace the entire `<Animated.View style={[styles.card, ...]}>` body with:

```tsx
<Animated.View style={[styles.card, !unlocked && styles.cardLocked, animStyle]}>
  <View style={[styles.med, !unlocked && styles.medLocked]}>
    <Text style={[styles.emoji, !unlocked && styles.emojiLocked]}>{achievement.emoji}</Text>
    {unlocked && (
      <View style={styles.medSeal} accessibilityLabel={t('badges.earned')}>
        <Text style={styles.medSealText}>✓</Text>
      </View>
    )}
  </View>
  <Text style={[styles.cardTitle, !unlocked && styles.cardTitleLocked]}>
    {achievement.title}
  </Text>
  {unlocked ? (
    <Text style={styles.cardDate}>{new Date(unlockedAt!).toLocaleDateString()}</Text>
  ) : (
    <Text style={styles.cardDesc}>{achievement.description}</Text>
  )}
</Animated.View>
```

(The `t` import is already present in the component; no new import needed. The accessibilityLabel preserves the "EARNED" screen-reader cue.)

- [ ] **Step 2: Delete the old ribbon styles and add the seal styles**

In the same file, inside `makeStyles(colors)`, **delete** the `ribbon` and `ribbonText` styles. Then add right after the `med` style:

```ts
medSeal: {
  position: 'absolute',
  bottom: -4,
  right: -4,
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: colors.success,
  borderWidth: 2,
  borderColor: colors.surface,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#0F766E',
  shadowOpacity: 0.2,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
},
medSealText: {
  color: '#fff',
  fontFamily: typography.fontFamilyBold,
  fontSize: 14,
  lineHeight: 14,
},
```

The `med` view needs `position: 'relative'` for the absolute seal to anchor correctly. The existing `med` style doesn't set position; it defaults to relative in RN, so no change needed — but if you see the seal floating off, add `position: 'relative'` to `med`.

- [ ] **Step 3: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/(app)/kid/[profileId]/badges.tsx
git commit -m "fix(mobile): badges — medallion ✓ seal replaces overlapping EARNED ribbon"
```

---

## Task 7: Badges — locked card readability in dark mode (issue 9)

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/badges.tsx`

- [ ] **Step 1: Bring `effective` mode into all three components in the file**

`useTheme()` returns `effective: 'light' | 'dark'` — the resolved mode after `'system'` is collapsed. Use it as a boolean.

In `mobile/app/(app)/kid/[profileId]/badges.tsx`, three components call `useTheme()` and `makeStyles(colors)`: `KidBadges` (line ~32), `BackButton` (line ~136), and `BadgeCard` (line ~171). Replace each occurrence of:

```ts
const { colors } = useTheme();
const styles = useMemo(() => makeStyles(colors), [colors]);
```

with:

```ts
const { colors, effective } = useTheme();
const isDark = effective === 'dark';
const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
```

- [ ] **Step 2: Update the makeStyles signature and locked colors**

In the same file, change `makeStyles` signature from `(colors: Palette)` to `(colors: Palette, isDark: boolean)`. Then update the locked styles:

```ts
cardLocked: {
  backgroundColor: isDark ? 'rgba(19,36,59,0.55)' : 'rgba(255,255,255,0.55)',
  borderWidth: 1,
  borderStyle: 'dashed',
  borderColor: colors.border,
  shadowOpacity: 0,
  elevation: 0,
},
```

And `medLocked`:

```ts
medLocked: {
  backgroundColor: isDark ? 'rgba(34,50,75,0.6)' : '#EDF3F1',
  borderWidth: 2,
  borderStyle: 'dashed',
  borderColor: colors.border,
  shadowOpacity: 0,
  elevation: 0,
},
```

And the locked text colors:

```ts
cardTitleLocked: { color: colors.textMuted },
cardDesc: {
  fontFamily: typography.fontFamilySemi,
  fontSize: typography.tiny,
  color: colors.textMuted,
  textAlign: 'center',
  fontStyle: 'italic',
  lineHeight: 15,
},
```

(The `cardDesc` color was `#8A9C98`; now `colors.textMuted`.)

- [ ] **Step 3: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/(app)/kid/[profileId]/badges.tsx
git commit -m "fix(mobile): badges — locked cards readable in dark mode"
```

---

## Task 8: celebrationQueue — group 2+ approvals into one item (issue 10)

**Files:**
- Modify: `mobile/src/lib/celebrationQueue.ts`
- Modify: `mobile/tests/celebrationQueue.test.ts`

- [ ] **Step 1: Write the failing test for two approvals grouping**

Open `mobile/tests/celebrationQueue.test.ts` and add the following test inside the `describe('buildCelebrationQueue', ...)` block (just before its closing `});`):

```ts
it('groups 2+ approvals into a single approval_group item', () => {
  const r = buildCelebrationQueue({
    approvals: [
      approval('a1', '2026-05-02T09:00:00Z', 'Dishes', 3),
      approval('a2', '2026-05-02T10:00:00Z', 'Trash', 5),
    ],
    achievements: [],
    goals: [],
    windowStarTotal: 0,
  });
  expect(r.items).toHaveLength(1);
  expect(r.items[0]).toEqual({
    kind: 'approval_group',
    count: 2,
    stars: 8,
    at: '2026-05-02T10:00:00Z',
  });
  expect(r.maxAt).toBe('2026-05-02T10:00:00Z');
});

it('keeps single approval as chore_approved (no group)', () => {
  const r = buildCelebrationQueue({
    approvals: [approval('a1', '2026-05-02T10:00:00Z', 'Dishes', 3)],
    achievements: [],
    goals: [],
    windowStarTotal: 0,
  });
  expect(r.items).toHaveLength(1);
  expect(r.items[0].kind).toBe('chore_approved');
});

it('intermixes approval_group with achievements and goals by timestamp', () => {
  const r = buildCelebrationQueue({
    approvals: [
      approval('a1', '2026-05-02T09:00:00Z', 'Dishes', 3),
      approval('a2', '2026-05-02T11:00:00Z', 'Trash', 5),
    ],
    achievements: [ach('b1', '2026-05-02T10:00:00Z', 'stargazer')],
    goals: [goal('g1', '2026-05-02T12:00:00Z')],
    windowStarTotal: 0,
  });
  // approval_group sits at the latest approval (11:00), then goal at 12:00.
  // achievement at 10:00 fires before the group's anchor timestamp.
  expect(r.items.map((i) => i.kind)).toEqual(['achievement', 'approval_group', 'goal']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npm test -- --testPathPattern=celebrationQueue`
Expected: FAIL — the three new tests fail with messages along the lines of `Received: [...{kind: 'chore_approved'...}]` for the first new test (since no grouping logic exists yet).

- [ ] **Step 3: Add the `approval_group` kind and grouping logic**

Open `mobile/src/lib/celebrationQueue.ts`. Replace the `CelebrationItem` union with:

```ts
export type CelebrationItem =
  | { kind: 'chore_approved'; id: string; at: string; title: string; stars: number }
  | { kind: 'approval_group'; count: number; stars: number; at: string }
  | { kind: 'achievement'; id: string; at: string; achievementKey: string }
  | { kind: 'goal'; id: string; at: string; title: string }
  | { kind: 'summary'; moreCount: number; extraStars: number };
```

Then in `buildCelebrationQueue`, replace the body with:

```ts
export function buildCelebrationQueue(input: BuildInput): BuildResult {
  const groupApprovals = input.approvals.length >= 2;

  const merged: Exclude<CelebrationItem, { kind: 'summary' }>[] = [
    ...(groupApprovals
      ? [{
          kind: 'approval_group' as const,
          count: input.approvals.length,
          stars: input.approvals.reduce((s, a) => s + a.stars, 0),
          at: input.approvals.reduce(
            (latest, a) => (ts(a.approved_at) > ts(latest) ? a.approved_at : latest),
            input.approvals[0].approved_at,
          ),
        }]
      : input.approvals.map((a) => ({
          kind: 'chore_approved' as const, id: a.id, at: a.approved_at, title: a.title, stars: a.stars,
        }))),
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

  const played = merged.slice(merged.length - CELEBRATION_CAP);
  const moreCount = merged.length - CELEBRATION_CAP;
  const items: CelebrationItem[] = [
    ...played,
    { kind: 'summary', moreCount, extraStars: input.windowStarTotal },
  ];
  return { items, maxAt };
}
```

- [ ] **Step 4: Run the test to verify the three new ones pass**

Run: `cd mobile && npm test -- --testPathPattern=celebrationQueue`
Expected: the three new tests PASS. **Two pre-existing tests will FAIL** — "plays the CAP most-recent items and appends a summary when over cap" and "does not append a summary at exactly the cap" — because they bulk-pumped approvals through and approvals now collapse to one item. Those are fixed in the next step.

- [ ] **Step 5: Update the CAP-related tests to use achievements as bulk source**

With grouping, the pre-existing CAP tests can't use approvals to exercise the over-cap path. Switch them to achievements (which don't get grouped). In `mobile/tests/celebrationQueue.test.ts`, replace the "plays the CAP most-recent items and appends a summary when over cap" test with:

```ts
it('plays the CAP most-recent items and appends a summary when over cap', () => {
  const achievements = Array.from({ length: CELEBRATION_CAP + 3 }, (_, i) =>
    ach(`b${i}`, day(10 + i), 'stargazer'));
  const r = buildCelebrationQueue({
    approvals: [], achievements, goals: [], windowStarTotal: 42,
  });
  expect(r.items.length).toBe(CELEBRATION_CAP + 1);
  expect(r.items.slice(0, CELEBRATION_CAP).every((i) => i.kind === 'achievement')).toBe(true);
  const summary = r.items[CELEBRATION_CAP];
  expect(summary).toEqual({ kind: 'summary', moreCount: 3, extraStars: 42 });
  expect((r.items[0] as any).id).toBe('b3');
  expect((r.items[CELEBRATION_CAP - 1] as any).id).toBe(`b${CELEBRATION_CAP + 2}`);
});
```

Replace the "does not append a summary at exactly the cap" test with:

```ts
it('does not append a summary at exactly the cap', () => {
  const achievements = Array.from({ length: CELEBRATION_CAP }, (_, i) =>
    ach(`b${i}`, day(i + 1), 'stargazer'));
  const r = buildCelebrationQueue({
    approvals: [], achievements, goals: [], windowStarTotal: 0,
  });
  expect(r.items.length).toBe(CELEBRATION_CAP);
  expect(r.items.some((i) => i.kind === 'summary')).toBe(false);
});
```

The "preserves source order for equal timestamps" test uses 1 approval — it still passes because grouping requires 2+. No change needed there.

- [ ] **Step 6: Run all celebrationQueue tests**

Run: `cd mobile && npm test -- --testPathPattern=celebrationQueue`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/celebrationQueue.ts mobile/tests/celebrationQueue.test.ts
git commit -m "feat(mobile): celebrationQueue — collapse 2+ approvals into one approval_group"
```

---

## Task 9: AchievementBanner — render approval_group + i18n (issue 10)

**Files:**
- Modify: `mobile/src/components/AchievementBanner.tsx`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`

- [ ] **Step 1: Add the i18n key (en)**

In `mobile/src/i18n/locales/en.json`, inside the `celebration` block, add:

```json
"choresApproved_one": "{{count}} chore approved!",
"choresApproved_other": "{{count}} chores approved!"
```

- [ ] **Step 2: Add the i18n key (es)**

In `mobile/src/i18n/locales/es.json`, inside the `celebration` block, add:

```json
"choresApproved_one": "¡{{count}} tarea aprobada!",
"choresApproved_other": "¡{{count}} tareas aprobadas!"
```

- [ ] **Step 3: Add the renderer branch**

Open `mobile/src/components/AchievementBanner.tsx`. In `renderBody`, add a new branch right after the `chore_approved` branch (and before the `goal` branch):

```tsx
if (item.kind === 'approval_group') {
  return (
    <>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>
        {t('celebration.choresApproved', { count: item.count })}
      </Text>
      <Text style={styles.description}>+{item.stars} ⭐</Text>
    </>
  );
}
```

- [ ] **Step 4: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the banner tests (regression)**

Run: `cd mobile && npm test -- --testPathPattern=achievementBanner`
Expected: PASS — no regressions on the existing tests.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/AchievementBanner.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): AchievementBanner — render approval_group with pluralized count"
```

---

## Task 10: Stargazer migration + pgTAP test updates (issue 11, DB side)

**Files:**
- Create: `supabase/migrations/20260521000001_first_star_to_stargazer.sql`
- Modify: `supabase/tests/34_check_achievements.sql`
- Modify: `supabase/tests/35_approve_chore_achievement_integration.sql`
- Modify: `supabase/tests/33_achievements_rls.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260521000001_first_star_to_stargazer.sql` with:

```sql
-- Replace the first_star achievement (>= 1 star) with stargazer (>= 10 stars),
-- and rename existing rows so older kids' badge pages render consistently.

create or replace function public.check_achievements(p_profile_id uuid)
  returns text[]
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  p_family_id uuid;
  stars_earned int;
  streak_max int;
  chore_count int;
  redemption_count int;
  unlocked text[];
begin
  select profiles.family_id into p_family_id from public.profiles where id = p_profile_id;
  if p_family_id is null then return '{}'; end if;

  select coalesce(sum(delta), 0)::int into stars_earned
    from public.star_ledger where profile_id = p_profile_id and delta > 0;

  select coalesce(greatest(current_count, longest_count), 0)::int into streak_max
    from public.streaks where profile_id = p_profile_id;
  streak_max := coalesce(streak_max, 0);

  select count(*)::int into chore_count
    from public.chore_instances where completed_by = p_profile_id and status = 'approved';

  select count(*)::int into redemption_count
    from public.redemptions where kid_profile_id = p_profile_id and status = 'fulfilled';

  with candidates(k) as (
    select unnest(array[
      case when stars_earned     >= 10  then 'stargazer'    end,
      case when stars_earned     >= 100 then 'stars_100'    end,
      case when stars_earned     >= 500 then 'stars_500'    end,
      case when streak_max       >= 7   then 'streak_7'     end,
      case when streak_max       >= 30  then 'streak_30'    end,
      case when chore_count      >= 1   then 'first_chore'  end,
      case when chore_count      >= 25  then 'chores_25'    end,
      case when redemption_count >= 1   then 'first_reward' end
    ])
  ),
  ins as (
    insert into public.achievements(family_id, profile_id, achievement_key)
    select p_family_id, p_profile_id, k from candidates where k is not null
    on conflict (profile_id, achievement_key) do nothing
    returning achievement_key
  )
  select coalesce(array_agg(achievement_key), '{}'::text[]) into unlocked from ins;

  return unlocked;
end;
$$;

-- Backfill: rename pre-existing first_star rows to stargazer. We skip rows where
-- a stargazer row already exists for the same profile (idempotency).
update public.achievements
   set achievement_key = 'stargazer'
 where achievement_key = 'first_star'
   and not exists (
     select 1 from public.achievements a2
      where a2.profile_id = public.achievements.profile_id
        and a2.achievement_key = 'stargazer'
   );

-- For any profile that had BOTH (shouldn't happen pre-migration but be safe),
-- drop the orphan first_star row.
delete from public.achievements where achievement_key = 'first_star';
```

- [ ] **Step 2: Update `supabase/tests/34_check_achievements.sql`**

Open `supabase/tests/34_check_achievements.sql`. Replace the entire file with:

```sql
begin;
select plan(12);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Leo',   3, null),
  ('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Mia',   4, null);

-- 1. Unknown profile returns empty.
select is(public.check_achievements('99999999-9999-9999-9999-999999999999'), '{}'::text[], 'unknown profile_id returns empty');

-- 2. No-activity kid returns empty.
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], 'no-activity kid returns empty');

-- 3. 1 star → nothing (below 10-star stargazer threshold).
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 1, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], '1 star unlocks nothing');

-- 4. 10 stars → stargazer.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 9, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['stargazer']::text[], '10 stars unlocks stargazer');

-- 5. 100 stars → stars_100 only.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 90, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['stars_100']::text[], '100 stars unlocks stars_100 only');

-- 6. Negative ledger doesn't revoke.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', -50, 'redemption');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), '{}'::text[], 'negative ledger does not revoke');

-- 7. 500 cumulative positive → stars_500.
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 400, 'chore_approved');
select is(public.check_achievements('a2222222-2222-2222-2222-222222222222'), array['stars_500']::text[], '500 cumulative unlocks stars_500');

-- 8. Streak via longest_count, with 10 stars → stargazer + streak_7.
insert into public.streaks(profile_id, family_id, current_count, longest_count, last_completion_date)
  values ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 7, current_date);
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 10, 'chore_approved');
select ok(
  array['stargazer', 'streak_7']::text[] <@ public.check_achievements('a3333333-3333-3333-3333-333333333333'),
  'streak_7 unlocked via longest_count + stargazer'
);

-- 9. 25 approved chore_instances for Mia → chores_25 + first_chore (no stargazer yet — Mia has no star_ledger rows).
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 1, 'auto', '{"type":"daily"}'::jsonb, 'a4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(chore_id, family_id, assignee_profile_id, completed_by, due_at, status)
  select 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444',
         now() + (gs || ' minutes')::interval, 'approved'
  from generate_series(1, 25) gs;
insert into public.star_ledger(family_id, profile_id, delta, reason) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 25, 'chore_approved');
select ok(
  array['chores_25']::text[] <@ public.check_achievements('a4444444-4444-4444-4444-444444444444'),
  '25 approved chore_instances unlocks chores_25'
);

-- 10. First fulfilled redemption → first_reward.
insert into public.rewards(id, family_id, title, star_cost, icon_id, created_by)
  values ('aaa11111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ice Cream', 1, 2, 'a1111111-1111-1111-1111-111111111111');
insert into public.redemptions(family_id, reward_id, kid_profile_id, star_cost_snapshot, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaa11111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 1, 'fulfilled');
select ok(
  array['first_reward']::text[] <@ public.check_achievements('a4444444-4444-4444-4444-444444444444'),
  'fulfilled redemption unlocks first_reward'
);

-- 11. Row inserted into achievements table.
select is(
  (select count(*)::int from public.achievements where profile_id = 'a4444444-4444-4444-4444-444444444444' and achievement_key = 'first_reward'),
  1, 'first_reward row exists in achievements'
);

-- 12. Sara has stargazer + stars_100 + stars_500 in the table.
select is(
  (select count(*)::int from public.achievements where profile_id = 'a2222222-2222-2222-2222-222222222222'),
  3, 'Sara has 3 achievements: stargazer + stars_100 + stars_500'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Update `supabase/tests/35_approve_chore_achievement_integration.sql`**

Open `supabase/tests/35_approve_chore_achievement_integration.sql`. The chore's `star_value` is currently `1`. Change it to `10` so the kid crosses the stargazer threshold on first approval. Also rename the assertion. Replace the entire file with:

```sql
begin;
select plan(3);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1, '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);
insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by)
  values ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 10, 'approval', '{"type":"daily"}'::jsonb, 'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');
insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status, completed_by, completed_at) values
  ('11111111-aaaa-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', now(), 'submitted', 'a2222222-2222-2222-2222-222222222222', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.approve_chore('11111111-aaaa-1111-1111-111111111111') $$,
  'approve_chore succeeds'
);

set local role postgres;
select is(
  (select count(*)::int from public.achievements
    where profile_id = 'a2222222-2222-2222-2222-222222222222' and achievement_key = 'stargazer'),
  1, 'stargazer achievement created by approve_chore (10-star chore)'
);
select is(
  (select count(*)::int from public.achievements
    where profile_id = 'a2222222-2222-2222-2222-222222222222' and achievement_key = 'first_chore'),
  1, 'first_chore achievement created by approve_chore'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Update `supabase/tests/33_achievements_rls.sql`**

Open `supabase/tests/33_achievements_rls.sql`. The two literals `'first_star'` on lines 16 and 17 are placeholder achievement keys for RLS testing — they don't depend on the threshold. Replace them with `'stargazer'`:

```sql
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'stargazer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b9999999-9999-9999-9999-999999999999', 'stargazer');
```

(Leave the rest of the file intact.)

- [ ] **Step 5: Reset the local Supabase database and run tests**

Run: `npx supabase db reset` (this re-applies all migrations including the new one)
Expected: completes without error.

Then: `npx supabase test db`
Expected: full suite green — `34_check_achievements`, `35_approve_chore_achievement_integration`, `33_achievements_rls`, and every other test pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260521000001_first_star_to_stargazer.sql supabase/tests/34_check_achievements.sql supabase/tests/35_approve_chore_achievement_integration.sql supabase/tests/33_achievements_rls.sql
git commit -m "feat(supabase): replace first_star (>=1) with stargazer (>=10 stars) + backfill"
```

---

## Task 11: Stargazer — mobile constants, i18n, push drain, test renames (issue 11, frontend side)

**Files:**
- Modify: `mobile/src/constants/achievements.ts`
- Modify: `mobile/src/i18n/locales/en.json`
- Modify: `mobile/src/i18n/locales/es.json`
- Modify: `supabase/functions/send_push_drain/index.ts`
- Modify: `mobile/tests/achievementBanner.test.tsx`
- Modify: `mobile/tests/celebrationQueue.test.ts`
- Modify: `mobile/tests/events.test.ts`

- [ ] **Step 1: Rename in `mobile/src/constants/achievements.ts`**

Open `mobile/src/constants/achievements.ts`. Replace its full contents with:

```ts
export type AchievementKey =
  | 'stargazer' | 'stars_100' | 'stars_500'
  | 'streak_7' | 'streak_30'
  | 'first_chore' | 'chores_25'
  | 'first_reward';

export const ACHIEVEMENTS: Record<AchievementKey, { emoji: string; title: string; description: string }> = {
  stargazer:    { emoji: '⭐', title: 'Stargazer',      description: 'Earn 10 stars total' },
  stars_100:    { emoji: '💯', title: 'Century',         description: 'Earn 100 stars total' },
  stars_500:    { emoji: '🏆', title: 'High Roller',     description: 'Earn 500 stars total' },
  streak_7:     { emoji: '🔥', title: 'Week Streak',     description: 'Earn stars 7 days in a row' },
  streak_30:    { emoji: '🌟', title: 'Month Streak',    description: 'Earn stars 30 days in a row' },
  first_chore:  { emoji: '✅', title: 'Getting Started', description: 'Get your first chore approved' },
  chores_25:    { emoji: '💪', title: 'Quarter Century', description: 'Get 25 chores approved' },
  first_reward: { emoji: '🎁', title: 'First Reward',    description: 'Redeem your first reward' },
};

export const ACHIEVEMENT_KEYS: AchievementKey[] = [
  'stargazer', 'stars_100', 'stars_500',
  'streak_7', 'streak_30',
  'first_chore', 'chores_25',
  'first_reward',
];
```

- [ ] **Step 2: Update `mobile/src/i18n/locales/en.json`**

In the `achievements` block, replace:

```json
"first_star": { "title": "First Star", "desc": "Earn your first star" },
```

with:

```json
"stargazer": { "title": "Stargazer", "desc": "Earn 10 stars total" },
```

- [ ] **Step 3: Update `mobile/src/i18n/locales/es.json`**

In `mobile/src/i18n/locales/es.json`, the `achievements` block has Spanish copy. Replace:

```json
"first_star": { "title": "Primera estrella", "desc": "Gana tu primera estrella" },
```

with:

```json
"stargazer": { "title": "Observador", "desc": "Gana 10 estrellas en total" },
```

(The Spanish for `first_chore` is "Primeros pasos" — "First steps", which is what triggered the duplicate-feeling concern in the original report. With Stargazer at a different threshold, the two no longer fire on the same event, so they read as distinct milestones now.)

- [ ] **Step 4: Update `supabase/functions/send_push_drain/index.ts`**

Open `supabase/functions/send_push_drain/index.ts`. In the `ACHIEVEMENTS` lookup, replace:

```ts
first_star:   { emoji: '⭐', title: 'First Star' },
```

with:

```ts
stargazer:    { emoji: '⭐', title: 'Stargazer' },
```

- [ ] **Step 5: Update mobile tests — rename string literals**

Open `mobile/tests/achievementBanner.test.tsx`. Find the line `achievementKey: 'first_star'` and change `'first_star'` to `'stargazer'`.

Open `mobile/tests/celebrationQueue.test.ts`. Change the helper default:

```ts
const ach = (id: string, at: string, key = 'first_star') =>
```

to:

```ts
const ach = (id: string, at: string, key = 'stargazer') =>
```

Open `mobile/tests/events.test.ts`. Change all three occurrences of `key: 'first_star'` to `key: 'stargazer'` (a global find-replace within the file is fine).

- [ ] **Step 6: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors. (If `AchievementKey` is referenced anywhere else with the old literal, fix that reference here.)

- [ ] **Step 7: Run mobile tests**

Run: `cd mobile && npm test -- --ci --watchman=false`
Expected: full suite green.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/constants/achievements.ts mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json supabase/functions/send_push_drain/index.ts mobile/tests/achievementBanner.test.tsx mobile/tests/celebrationQueue.test.ts mobile/tests/events.test.ts
git commit -m "feat(mobile): replace first_star with stargazer in constants, i18n, push, tests"
```

---

## Final verification

After all 11 tasks ship, run:

- [ ] **Full mobile test suite**: `cd mobile && npm test -- --ci --watchman=false` — expected all suites green.
- [ ] **Full TypeScript**: `cd mobile && npx tsc --noEmit` — expected no new errors.
- [ ] **Full pgTAP suite**: `npx supabase test db` — expected all green.
- [ ] **Manual emulator walkthrough (light + dark)**:
  - Chores form (new + edit): verification picker selected state = primary teal, three buttons equal height, hints readable.
  - Parent home with no goal: empty-state tile visible, tap routes to `/parent/goals/create`.
  - Parent home with goal that has a description: description shows on GoalCard.
  - Goals screen empty state: purpose blurb visible. Create form: blurb under title.
  - Kid home dark mode: switch-arrow visible, star/streak hero text readable.
  - Kid badges page: ✓ seal on medallion, no overlap; locked cards readable in dark mode.
  - Approve 2+ chores rapidly from another parent session: kid sees one grouped banner ("N chores approved · +M ⭐").
  - First-time kid earns 10 stars: stargazer unlocks.

If everything passes, tag the milestone or open the PR. The earlier finishing-a-development-branch skill applies here.
