# Emulator Fixes Batch — 2026-05-22

Six visual contrast / i18n fixes, one new feature (notification badge on the Approvals tab), and one functional fix (kid photo upload "network error"). All issues surfaced during the user's manual emulator walkthrough after the timed-chores feature merge (`5774f09`).

## Scope

| # | Surface | Issue |
|---|---|---|
| 1 | `AvatarPicker` (onboarding) | Selected-tile border (`#111`) invisible in dark mode |
| 2 | `RewardIconPicker` (reward form) | Hardcoded hex + English-only labels (Gift, Treat, Game…) |
| 3 | `PinPad` (parent profile re-entry) | Number keys have no color → black on dark; English-only labels |
| 4 | `AssigneePicker` (chore form) | Hardcoded hex + English-only "Assignee" / "Anyone" |
| 5 | `goals/create.tsx` form inputs | Near-white input bg + cream text = invisible in dark mode |
| 6 | Parent tab bar | New: notification badge on Approvals tab showing pending decisions count |
| 7 | Kid photo upload | `blob` path on `supabase.storage.upload` surfaces as "network error" on Android — switch to `arrayBuffer` |

## Non-goals

- A reusable theme-aware Input component to replace per-screen TextInput styles. Worth a follow-up sweep.
- Completing the Tide Pool migration of every remaining old-pattern component. This spec covers exactly the components in the punch list.
- Reworking the storage bucket RLS or signed-URL strategy. Photo upload fix is a pure client-side pattern swap.

## Fix details

### 1. AvatarPicker — selected indicator readable in dark

**File:** `mobile/src/components/AvatarPicker.tsx`

Migrate to `useTheme()` + `makeStyles(colors)`. The current `borderColor: '#111'` becomes `colors.primary` (teal in both modes), `borderWidth` bumps from 2 to 3 so the ring is unmistakable against the tile's warm-tint background.

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

No new i18n (this component has no text labels). No tests required (purely visual change, no behavior).

### 2. RewardIconPicker — theme tokens + i18n labels

**Files:**
- `mobile/src/components/RewardIconPicker.tsx`
- `mobile/src/constants/rewardIcons.ts`
- `mobile/src/i18n/locales/en.json`, `es.json`

The `REWARD_ICONS` constant currently embeds English labels (`Gift`, `Treat`, etc.). Replace each `label` with a stable i18n key. The picker renders `t(\`rewardIcons.${labelKey}\`)`.

**`rewardIcons.ts` change:**

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

**i18n keys (en):** new top-level block

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

**i18n keys (es):**

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

**`RewardIconPicker.tsx` rewrite:** Convert to `useTheme + makeStyles(colors)`. Selected chip: `colors.primary` bg + white text. Unselected: `colors.surface` bg + `colors.border` border + `colors.text` label. Picker section label sourced from `t('rewardIcons.label')`.

**Callers:** any place that reads `REWARD_ICONS[id].label` needs updating. Search the codebase for that pattern. Likely call sites: parent rewards form (`/parent/rewards/new.tsx`, `/parent/rewards/[id].tsx`), approvals card (already uses `.emoji`), and the kid rewards screen. Each needs to swap `.label` → `t(\`rewardIcons.${REWARD_ICONS[id].labelKey}\`)`.

**Test update:** `mobile/tests/RewardIconPicker.test.tsx` exists. Update any assertion that compares against the literal English strings to instead match the localized version (or assert via testID match only).

### 3. PinPad — readable + theme + i18n

**File:** `mobile/src/components/PinPad.tsx`

Wholesale migration to `useTheme + makeStyles(colors)`. Number-key text gains `color: colors.text`. Dots: empty = `colors.textMuted` border, filled = `colors.text` solid. Title and cancel labels through i18n.

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

**i18n (en):** add `pin.title` = "Enter PIN".
**i18n (es):** `pin.title` = "Introduce tu PIN".

`common.cancel` already exists in both locales.

**Test update:** `mobile/tests/PinPad.test.tsx` may assert against the literal "Enter PIN". Update to use a regex or testID lookup, OR wrap the test in an `I18nextProvider` mock that returns the English keys.

### 4. AssigneePicker — theme tokens + i18n

**Files:**
- `mobile/src/components/AssigneePicker.tsx`
- `mobile/src/i18n/locales/en.json`, `es.json`

Mirror of the RewardIconPicker migration. Selected chip = `colors.primary` bg + white text; unselected = `colors.surface` bg + `colors.border` border + `colors.text` label. The "Assignee" section label moves to `t('forms.assignee')`. The "Anyone" chip moves to `t('forms.anyone')`.

**i18n additions:**
- en `forms.assignee`: "Assignee"; `forms.anyone`: "Anyone"
- es `forms.assignee`: "Asignado"; `forms.anyone`: "Cualquiera"

(`parent.anyone` already exists in both locales — used on the parent home chore row. We add a new dedicated `forms.anyone` for the assignee picker, keeping the existing key intact for the home row.)

No test file exists for `AssigneePicker`; the migration is verified by tsc + the parent chores form continuing to work.

### 5. Goal-create form — readable inputs in dark

**File:** `mobile/app/(app)/parent/goals/create.tsx`

The `input` style hardcodes `backgroundColor: '#FBFDFC'` (near-white) and `color: colors.text`. In dark mode that's near-white-bg + cream-text → invisible. Same for the `multiline` description textarea. Placeholder color `#9DB0AC` is also low contrast.

Fix: introduce `isDark` via `effective` (same pattern as TC-Task 7 RecurrencePicker), make the bg theme-aware:

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

Change all three `placeholderTextColor="#9DB0AC"` props in the JSX to `placeholderTextColor={colors.textMuted}`.

### 6. Approvals tab — pending-decisions badge

**Files:**
- New: `mobile/src/hooks/usePendingDecisionsCount.ts`
- Modify: `mobile/src/components/ParentTabBar.tsx`
- Modify: locales

**Hook:** `usePendingDecisionsCount(): number`.

The Approvals screen already issues two TanStack queries that we want to read: `['approvals-chores']` (submitted chore_instances) and `['approvals-redemptions-pending']` (pending redemptions). The badge hook calls those same queries — TanStack will deduplicate and serve from cache when both consumers (tab bar + approvals screen) are mounted. When the tab bar is mounted alone, the queries refetch on mount.

```ts
import { useQueries } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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
        staleTime: 30_000,
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
        staleTime: 30_000,
      },
    ],
  });
  return (chores.data ?? 0) + (redemptions.data ?? 0);
}
```

**Why separate query keys** (not reusing `['approvals-chores']` / `['approvals-redemptions-pending']`): the existing queries on the Approvals screen fetch the full row data and order by timestamp. The count-only queries use `head: true` + `count: 'exact'` for efficiency. The tradeoff: when the parent acts on an approval (which invalidates the full-data queries), we also need to invalidate the count queries. We do that in the existing `invalidateAfterDecision` helper in `mobile/app/(app)/parent/approvals.tsx`:

```ts
qc.invalidateQueries({ queryKey: ['approvals-chores-count'] });
qc.invalidateQueries({ queryKey: ['approvals-redemptions-pending-count'] });
```

**Realtime keepalive:** the count queries refetch when `staleTime` expires (30 s) on any mount/refocus. For more immediate updates, the existing approvals screen already maintains a realtime subscription that triggers `invalidateAfterDecision`. We additively invalidate the new count queries from that path (above). For the tab bar's case (parent not on the Approvals screen), the queries refetch every time the bar mounts (i.e., every navigation). Acceptable.

**ParentTabBar change:** call the hook in the tab bar component, render a small absolutely-positioned badge on the Approvals tab.

```tsx
import { usePendingDecisionsCount } from '../hooks/usePendingDecisionsCount';

// inside ParentTabBar render:
const pendingCount = usePendingDecisionsCount();

// when rendering the Approvals tab Pressable:
<Pressable ... style={styles.tab}>
  <View style={styles.iconWrap}>
    <Ionicons name={...} size={23} color={...} />
    {tab.name === 'approvals' && pendingCount > 0 && (
      <View style={styles.badge} accessibilityLabel={t('tabs.approvalsCount', { count: pendingCount })}>
        <Text style={styles.badgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
      </View>
    )}
  </View>
  <Text ...>{t(tab.labelKey)}</Text>
</Pressable>
```

**Styles:**

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

**i18n (en):** `tabs.approvalsCount`: `"{{count}} pending approvals"` (a11y label).
**i18n (es):** `tabs.approvalsCount`: `"{{count}} pendientes"`.

**Test:** Jest test for `usePendingDecisionsCount`. Mock supabase to return specific counts, assert hook returns the sum. (Optional — the hook is simple; the integration is verified visually.)

### 7. Kid photo upload — switch blob → arrayBuffer

**File:** `mobile/app/(app)/kid/[profileId]/chore/[instanceId]/photo.tsx`

Replace the blob fetch with an ArrayBuffer fetch:

```ts
// before:
const blob = await (await fetch(uri)).blob();
// ...upload(path, blob, ...)

// after:
const arrayBuffer = await (await fetch(uri)).arrayBuffer();
// ...upload(path, arrayBuffer, ...)
```

The `upload()` signature accepts `Blob | ArrayBuffer | string`, so this is a drop-in. The arrayBuffer path is the canonical Supabase Storage React Native pattern and avoids the known-brittle blob behavior on Android (which surfaces as a generic "Network request failed").

**Test:** none — covered by manual emulator verification (retake a chore photo, observe upload succeeds).

### 8. Out-of-scope items deliberately left for follow-ups

- The day-of-week initials `M T W T F S S` vs `L M M J V S D` are already wired correctly in `RecurrencePicker.tsx` (TC-Task 7); the user's screenshot was a stale Metro bundle. If after a hard reload the issue remains, file as a separate bug.
- A reusable theme-aware `<Input>` component to absorb the per-screen TextInput patterns. Worth a future cleanup PR.
- A reusable theme-aware `<ChipPicker>` to absorb the AvatarPicker / RewardIconPicker / AssigneePicker / VerificationModePicker repetition. Five components with near-identical structure; abstraction worth ~30% LOC reduction. Not this batch.

## Risk + rollout

- All UI changes are local to the listed files. No new dependencies.
- The `usePendingDecisionsCount` hook adds two new lightweight queries. They run on every parent navigation (when the tab bar mounts/remounts), with a 30 s staleTime so back-to-back navigations don't thrash. Negligible server load.
- The photo upload change is a one-line API swap. If it doesn't fix the user's "network error", the next investigation step is to capture the literal error string + check Supabase logs.

## Verification

- `tsc --noEmit` clean.
- `npm test -- --ci --watchman=false` green; updated test assertions for `RewardIconPicker.test.tsx` and `PinPad.test.tsx` pass.
- Manual emulator walkthrough (light + dark, en + es):
  - Onboarding avatar picker: selected avatar has a clear teal ring on both themes.
  - Reward form: picker tiles theme-correct; labels render in Spanish when locale is es.
  - PIN entry from family picker / settings: number keys visible in dark.
  - Chore form: assignee picker labels translated; selected pill is teal.
  - Goal create: typed text + placeholder readable in dark.
  - Parent tab bar: a red badge with count appears on Approvals when there are pending decisions; disappears when count is 0; updates after approving.
  - Kid task photo: capture + send works without "network error".
