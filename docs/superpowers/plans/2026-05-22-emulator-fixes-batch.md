# Emulator Fixes Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the seven fixes specified in `docs/superpowers/specs/2026-05-22-emulator-fixes-batch-design.md` — AvatarPicker selected ring, RewardIconPicker theme + i18n labels, PinPad theme + i18n + readable keys, AssigneePicker theme + i18n, goals/create form readable inputs in dark, parent Approvals tab pending-decisions badge, and the kid photo upload `blob → arrayBuffer` fix.

**Architecture:** Six per-file UI migrations (drop hardcoded hex / English literals, adopt `useTheme + makeStyles(colors)` + `useTranslation`), one new hook (`usePendingDecisionsCount`) that issues count-only PostgREST queries and renders a tab-bar badge, and one one-line client API swap for the storage upload path. Zero new dependencies. Jest setup gains a synchronous i18next init so component tests see real translations.

**Tech Stack:** Expo React Native, react-i18next, TanStack Query, Supabase Storage. No new top-level dependencies.

**Spec:** `docs/superpowers/specs/2026-05-22-emulator-fixes-batch-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `mobile/src/components/AvatarPicker.tsx` | useTheme + makeStyles; selected.borderColor=colors.primary, width 3 (modify) |
| `mobile/src/constants/rewardIcons.ts` | Replace `label: string` with `labelKey: string` (modify) |
| `mobile/src/components/RewardIconPicker.tsx` | useTheme + makeStyles; render labels via `t('rewardIcons.${labelKey}')` (modify) |
| `mobile/src/components/AssigneePicker.tsx` | useTheme + makeStyles; render labels via t (modify) |
| `mobile/src/components/PinPad.tsx` | useTheme + makeStyles; t('pin.title') + t('common.cancel'); key text color (modify) |
| `mobile/jest.setup.js` | Sync init i18next with bundled en/es so component tests see real translations (modify) |
| `mobile/app/(app)/parent/goals/create.tsx` | isDark-aware input bg, placeholderTextColor uses colors.textMuted (modify) |
| `mobile/src/hooks/usePendingDecisionsCount.ts` | New: TanStack count-only queries for submitted chores + pending redemptions (create) |
| `mobile/src/components/ParentTabBar.tsx` | Render badge on Approvals tab when count > 0 (modify) |
| `mobile/app/(app)/parent/approvals.tsx` | Invalidate the new count queries alongside the existing ones (modify) |
| `mobile/src/i18n/locales/en.json`, `es.json` | New keys: rewardIcons.*, forms.assignee, forms.anyone, pin.title, tabs.approvalsCount (modify) |
| `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx` | blob → arrayBuffer (modify) |

---

## Task 1: AvatarPicker — theme migration + visible selected ring

**Files:**
- Modify: `mobile/src/components/AvatarPicker.tsx`

- [ ] **Step 1: Replace `mobile/src/components/AvatarPicker.tsx` with:**

```tsx
import { useMemo } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { AVATAR_IDS, AVATARS, AvatarId } from '../constants/avatars';
import { useTheme, type Palette, spacing, radii } from '../theme';

type Props = { value: AvatarId; onChange: (id: AvatarId) => void };

export function AvatarPicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {AVATAR_IDS.map((id) => {
        const a = AVATARS[id];
        const selected = id === value;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.tile, { backgroundColor: a.bg }, selected && styles.selected]}
          >
            <Text style={styles.emoji}>{a.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginVertical: spacing.lg },
    tile: { width: 64, height: 64, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
    selected: { borderColor: colors.primary },
    emoji: { fontSize: 32 },
  });
```

- [ ] **Step 2: TypeScript check**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full test suite (regression)**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/AvatarPicker.tsx
git commit -m "fix(mobile): AvatarPicker — teal selected ring readable in dark"
```

---

## Task 2: RewardIconPicker — i18n labels + theme migration

**Files:**
- Modify: `mobile/src/constants/rewardIcons.ts`
- Modify: `mobile/src/components/RewardIconPicker.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`

Only one site reads `REWARD_ICONS[id].label`: the picker itself. All other call sites read `.emoji`. Verified by `grep -n "REWARD_ICONS\[" mobile/`.

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, add a new top-level block at the end of the file (mind the comma after the previous block):

```json
"rewardIcons": {
  "label": "Icon",
  "gift": "Gift",
  "treat": "Treat",
  "game": "Game",
  "cash": "Cash",
  "time": "Time",
  "snack": "Snack",
  "movie": "Movie",
  "toy": "Toy"
}
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, add at the end:

```json
"rewardIcons": {
  "label": "Icono",
  "gift": "Regalo",
  "treat": "Postre",
  "game": "Juego",
  "cash": "Dinero",
  "time": "Tiempo",
  "snack": "Snack",
  "movie": "Peli",
  "toy": "Peluche"
}
```

- [ ] **Step 3: Update `mobile/src/constants/rewardIcons.ts`**

Replace the entire contents with:

```ts
export type RewardIconId = 1|2|3|4|5|6|7|8;

export const REWARD_ICONS: Record<RewardIconId, { emoji: string; labelKey: string }> = {
  1: { emoji: '🎁',  labelKey: 'gift' },
  2: { emoji: '🍦',  labelKey: 'treat' },
  3: { emoji: '🎮',  labelKey: 'game' },
  4: { emoji: '💵',  labelKey: 'cash' },
  5: { emoji: '⏰',  labelKey: 'time' },
  6: { emoji: '🍪',  labelKey: 'snack' },
  7: { emoji: '🎬',  labelKey: 'movie' },
  8: { emoji: '🧸',  labelKey: 'toy' },
};

export const REWARD_ICON_IDS: RewardIconId[] = [1, 2, 3, 4, 5, 6, 7, 8];
```

- [ ] **Step 4: Replace `mobile/src/components/RewardIconPicker.tsx` with:**

```tsx
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { REWARD_ICONS, REWARD_ICON_IDS, type RewardIconId } from '../constants/rewardIcons';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

type Props = {
  value: RewardIconId;
  onChange: (id: RewardIconId) => void;
};

export function RewardIconPicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.label}>{t('rewardIcons.label')}</Text>
      <View style={styles.row}>
        {REWARD_ICON_IDS.map((id) => {
          const sel = id === value;
          const { emoji, labelKey } = REWARD_ICONS[id];
          return (
            <Pressable
              key={id}
              testID={`reward-icon-${id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(id)}
              style={[styles.chip, sel && styles.chipSel]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={[styles.chipLabel, sel && styles.chipLabelSel]}>
                {t(`rewardIcons.${labelKey}`)}
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
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      minWidth: 64,
    },
    chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    emoji: { fontSize: 24 },
    chipLabel: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.tiny + 0.5,
      color: colors.text,
      marginTop: 2,
    },
    chipLabelSel: { color: '#fff' },
  });
```

- [ ] **Step 5: TypeScript check**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean. (No callers read `.label` — they read `.emoji` only.)

- [ ] **Step 6: Run the RewardIconPicker tests**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=RewardIconPicker`
Expected: existing 3 tests pass. They use `getByText` with emoji strings + `getByTestId('reward-icon-N')` for the selected state — no English label assertions.

- [ ] **Step 7: Run the full suite (regression)**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/constants/rewardIcons.ts mobile/src/components/RewardIconPicker.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): RewardIconPicker — theme migration + i18n labels"
```

---

## Task 3: PinPad — theme + i18n + Jest i18n init

The PinPad test asserts `getByText('Cancel')`. Moving Cancel to `t('common.cancel')` would normally break this test because `useTranslation` in an uninitialized i18next returns the key path (e.g., "common.cancel") rather than the translated value. The clean fix is to add a synchronous i18next init to `jest.setup.js` so all current and future tests see real English translations.

**Files:**
- Modify: `mobile/jest.setup.js`
- Modify: `mobile/src/components/PinPad.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, add a new top-level block (mind the comma):

```json
"pin": {
  "title": "Enter PIN"
}
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`:

```json
"pin": {
  "title": "Introduce tu PIN"
}
```

- [ ] **Step 3: Initialize i18next in `mobile/jest.setup.js`**

Replace the entire contents of `mobile/jest.setup.js` with:

```js
// Global Jest setup. Applies to every test suite.

// ThemeProvider transitively imports @react-native-async-storage/async-storage
// (for persisting the theme pref). The package's native code can't run under
// Jest, so we wire in the bundled in-memory mock once here instead of in every
// test file.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Initialize i18next synchronously with the bundled English locale so any
// component test that uses useTranslation/t() sees real translations rather
// than the raw key paths. Spanish bundle is loaded as a fallback resource
// but the active language is 'en' to match existing test expectations.
const i18n = require('i18next').default;
const { initReactI18next } = require('react-i18next');
const en = require('./src/i18n/locales/en.json');
const es = require('./src/i18n/locales/es.json');
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
```

- [ ] **Step 4: Run full test suite to confirm no regressions from i18n init**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass. Any component that currently uses `t()` will start receiving real translations; since translations match the historical hardcoded strings, no test should regress. If one does, that test was relying on the un-initialized key fallback — flag it and update to assert the new translated string.

- [ ] **Step 5: Replace `mobile/src/components/PinPad.tsx` with:**

```tsx
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, typography } from '../theme';

type Props = {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ onSubmit, onCancel, error }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [pin, setPin] = useState('');

  function press(k: string) {
    if (k === '') return;
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pin.title')}</Text>
      <View style={styles.dots}>
        {[0,1,2,3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <Pressable key={i} style={styles.key} onPress={() => press(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { padding: spacing.xl, alignItems: 'center', gap: spacing.lg },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
    dots: { flexDirection: 'row', gap: spacing.lg },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textMuted },
    dotFilled: { backgroundColor: colors.text, borderColor: colors.text },
    error: { color: colors.error, fontSize: typography.small, fontFamily: typography.fontFamilySemi },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
    key: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
    keyText: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    cancel: { paddingVertical: spacing.sm },
    cancelText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.primary },
  });
```

- [ ] **Step 6: Run the PinPad tests**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=PinPad`
Expected: 3 existing tests pass. The test asserts `getByText('Cancel')` and `getByText('Wrong PIN')`; with i18n initialized to en, `t('common.cancel')` resolves to `"Cancel"` so the test continues to pass.

- [ ] **Step 7: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/jest.setup.js mobile/src/components/PinPad.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): PinPad — theme + i18n + Jest i18next init"
```

---

## Task 4: AssigneePicker — theme + i18n

**Files:**
- Modify: `mobile/src/components/AssigneePicker.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, inside the existing `forms` block, add (mind comma):

```json
"assignee": "Assignee",
"anyone": "Anyone"
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, in the matching `forms` block:

```json
"assignee": "Asignado",
"anyone": "Cualquiera"
```

(`parent.anyone` already exists in both locales — keep it; this is a separate `forms.anyone` for the picker context.)

- [ ] **Step 3: Replace `mobile/src/components/AssigneePicker.tsx` with:**

```tsx
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AVATARS, AvatarId } from '../constants/avatars';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

export type Assignee = { id: string; display_name: string; avatar_id: number };

export function AssigneePicker({
  kids,
  value,
  onChange,
}: {
  kids: Assignee[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.label}>{t('forms.assignee')}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
          style={[styles.chip, value === null && styles.chipSel]}
        >
          <Text style={[styles.chipText, value === null && styles.chipTextSel]}>
            {t('forms.anyone')}
          </Text>
        </Pressable>
        {kids.map((k) => {
          const a = AVATARS[k.avatar_id as AvatarId];
          const sel = value === k.id;
          return (
            <Pressable
              key={k.id}
              onPress={() => onChange(k.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              style={[styles.chip, sel && styles.chipSel]}
            >
              <Text style={styles.emoji}>{a.emoji}</Text>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{k.display_name}</Text>
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
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.text,
    },
    chipTextSel: { color: '#fff' },
    emoji: { fontSize: 16 },
  });
```

- [ ] **Step 4: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/AssigneePicker.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): AssigneePicker — theme migration + i18n labels"
```

---

## Task 5: goals/create form — readable inputs in dark

**Files:**
- Modify: `mobile/app/(app)/parent/goals/create.tsx`

- [ ] **Step 1: Add `effective` to the `useTheme` destructure**

In `mobile/app/(app)/parent/goals/create.tsx`, find:

```tsx
const { colors } = useTheme();
const styles = useMemo(() => makeStyles(colors), [colors]);
```

Replace with:

```tsx
const { colors, effective } = useTheme();
const isDark = effective === 'dark';
const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
```

- [ ] **Step 2: Update the `makeStyles` signature**

In the same file, find:

```ts
const makeStyles = (colors: Palette) =>
  StyleSheet.create({
```

Replace with:

```ts
const makeStyles = (colors: Palette, isDark: boolean) =>
  StyleSheet.create({
```

- [ ] **Step 3: Make the input bg theme-aware**

In the same file, inside `makeStyles`, find the `input` style entry:

```ts
input: {
  borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
  paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  backgroundColor: '#FBFDFC', color: colors.text,
  fontFamily: typography.fontFamilySemi, fontSize: typography.body,
},
```

Replace with:

```ts
input: {
  borderWidth: 1.5,
  borderColor: colors.border,
  borderRadius: 12,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm + 2,
  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FBFDFC',
  color: colors.text,
  fontFamily: typography.fontFamilySemi,
  fontSize: typography.body,
},
```

- [ ] **Step 4: Switch placeholder color to a theme token**

In the same file, find every occurrence of:

```tsx
placeholderTextColor="#9DB0AC"
```

Replace each occurrence with:

```tsx
placeholderTextColor={colors.textMuted}
```

There are three TextInputs in `goals/create.tsx` (title, target, description) — update all three.

- [ ] **Step 5: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/app/\(app\)/parent/goals/create.tsx
git commit -m "fix(mobile): goals/create — readable inputs in dark mode"
```

---

## Task 6: Approvals tab — pending-decisions badge

**Files:**
- Create: `mobile/src/hooks/usePendingDecisionsCount.ts`
- Modify: `mobile/src/components/ParentTabBar.tsx`
- Modify: `mobile/app/(app)/parent/approvals.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, inside the existing `tabs` block, add (mind comma):

```json
"approvalsCount": "{{count}} pending approvals"
```

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, in the matching `tabs` block:

```json
"approvalsCount": "{{count}} pendientes"
```

- [ ] **Step 3: Create the hook `mobile/src/hooks/usePendingDecisionsCount.ts`**

```ts
import { useQueries } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const STALE_MS = 30_000;

export function usePendingDecisionsCount(): number {
  const [chores, redemptions] = useQueries({
    queries: [
      {
        queryKey: ['approvals-chores-count'],
        queryFn: async (): Promise<number> => {
          const { count, error } = await supabase
            .from('chore_instances')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'submitted');
          if (error) throw error;
          return count ?? 0;
        },
        staleTime: STALE_MS,
      },
      {
        queryKey: ['approvals-redemptions-pending-count'],
        queryFn: async (): Promise<number> => {
          const { count, error } = await supabase
            .from('redemptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
          if (error) throw error;
          return count ?? 0;
        },
        staleTime: STALE_MS,
      },
    ],
  });
  return (chores.data ?? 0) + (redemptions.data ?? 0);
}
```

- [ ] **Step 4: Modify `mobile/src/components/ParentTabBar.tsx`**

Open the file. Add the hook import at the top of the file (after the existing imports):

```ts
import { usePendingDecisionsCount } from '../hooks/usePendingDecisionsCount';
```

Inside the `ParentTabBar` component body, after the existing `const activeName = state.routes[state.index]?.name;` line, add:

```ts
const pendingCount = usePendingDecisionsCount();
```

Replace the entire returned Pressable for each tab (the `<Pressable key={tab.name} ...>...</Pressable>` block inside the `TABS.map`) with this version that wraps the icon in a relative-positioned View and renders the badge conditionally on the Approvals tab:

```tsx
return (
  <Pressable
    key={tab.name}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: focused }}
    accessibilityLabel={
      tab.name === 'approvals' && pendingCount > 0
        ? t('tabs.approvalsCount', { count: pendingCount })
        : t(tab.labelKey)
    }
    style={styles.tab}
  >
    <View style={styles.iconWrap}>
      <Ionicons
        name={focused ? tab.on : tab.off}
        size={23}
        color={focused ? colors.primary : colors.textMuted}
      />
      {tab.name === 'approvals' && pendingCount > 0 && (
        <View style={styles.badge} testID="approvals-badge">
          <Text style={styles.badgeText}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </Text>
        </View>
      )}
    </View>
    <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
      {t(tab.labelKey)}
    </Text>
  </Pressable>
);
```

Inside the same file's `makeStyles(colors)` factory, add these new style entries at the end (after `labelOn`):

```ts
iconWrap: { position: 'relative' },
badge: {
  position: 'absolute',
  top: -6,
  right: -10,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  backgroundColor: colors.error,
  paddingHorizontal: 4,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1.5,
  borderColor: colors.surface,
},
badgeText: {
  color: '#fff',
  fontFamily: typography.fontFamilyBold,
  fontSize: 10,
  lineHeight: 12,
},
```

- [ ] **Step 5: Invalidate the new count queries from approvals decisions**

Open `mobile/app/(app)/parent/approvals.tsx`. Find the `invalidateAfterDecision` function. Inside its body, after the existing `qc.invalidateQueries({ queryKey: ['approvals-redemptions-approved'] });` line (or the last existing invalidation), add:

```ts
qc.invalidateQueries({ queryKey: ['approvals-chores-count'] });
qc.invalidateQueries({ queryKey: ['approvals-redemptions-pending-count'] });
```

- [ ] **Step 6: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/hooks/usePendingDecisionsCount.ts mobile/src/components/ParentTabBar.tsx mobile/app/\(app\)/parent/approvals.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): parent tab bar — pending-decisions count badge on Approvals"
```

---

## Task 7: Kid photo upload — blob → arrayBuffer

**Files:**
- Modify: `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx`

- [ ] **Step 1: Replace the blob upload line**

In `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx`, find:

```ts
const blob = await (await fetch(uri)).blob();
let lastErr: string | null = null;
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const { error: upErr } = await supabase.storage
    .from('chore-proofs')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
```

Replace with:

```ts
const arrayBuffer = await (await fetch(uri)).arrayBuffer();
let lastErr: string | null = null;
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const { error: upErr } = await supabase.storage
    .from('chore-proofs')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
```

- [ ] **Step 2: TypeScript check**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean. The `supabase.storage.upload()` second-arg accepts `Blob | ArrayBuffer | string`, so `ArrayBuffer` is a valid type.

- [ ] **Step 3: Run full test suite (regression)**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/app/\(app\)/kid/\[profileId\]/chore/\[instanceId\]/photo.tsx
git commit -m "fix(mobile): kid photo upload — switch blob to arrayBuffer for Android"
```

---

## Final verification

After all 7 tasks ship:

- [ ] **Full mobile test suite**: `cd mobile && npm test -- --ci --watchman=false` — expected all suites green.
- [ ] **Full TypeScript**: `cd mobile && npx tsc --noEmit` — clean.
- [ ] **Manual emulator walkthrough (light + dark, en + es)**:
  - Onboarding → avatar picker: selected avatar has a clear teal ring on both themes; no more invisible-in-dark.
  - Parent → New reward → icon picker: selected tile is teal, labels render in Spanish when locale is es.
  - Family picker → enter parent PIN: number keys visible in dark mode; "Introduce tu PIN" in Spanish.
  - Parent → New chore → assignee row: labels translated; selected pill is teal.
  - Parent → Goals → Create a goal: typed text + placeholder readable in dark mode.
  - Parent tab bar: a red badge with count appears on Approvals when there are pending decisions; updates after approving; disappears at 0.
  - Kid → tap done on a photo-mode chore → snap photo → tap send. Upload succeeds (no "network error").

If everything passes, hand off to `superpowers:finishing-a-development-branch`.
