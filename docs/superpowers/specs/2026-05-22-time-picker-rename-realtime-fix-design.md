# Time Picker + Rename + Realtime Fix — 2026-05-22

Three independent fixes batched together:

1. **TimePickerModal** — replace the HH:MM `TextInput` in `RecurrencePicker` with a vendored modal picker (hour wheel + minute wheel at 5-minute granularity). Zero new dependencies.
2. **Shores → HomeSquad rename** — user-visible strings only (app display name, login/signup screens, i18n subtitle, push notification titles). Slug, scheme, repo name, and historical doc files unchanged.
3. **Realtime channel name uniqueness** — fix the `cannot add 'postgres_changes' callbacks for realtime:... after subscribe()` error by appending a per-mount-instance suffix to each `supabase.channel(...)` name.

## Scope

| # | Surface | Issue |
|---|---|---|
| 1 | `RecurrencePicker` (chore form) | HH:MM text input is unfriendly — replace with a proper modal picker |
| 2 | App display name + push titles | Rename Shores → HomeSquad in user-visible strings only |
| 3 | Realtime channels (4 sites) | Channel name reuse triggers postgres_changes error on StrictMode/fast-refresh remounts |

## Non-goals

- Adding `@react-native-community/datetimepicker` or any new top-level dependency.
- Renaming the Expo `slug` (kept as `shores`), URL `scheme` (kept as `shores://`), or the GitHub repo `cgomez9/chores`.
- Localizing the brand name "HomeSquad" — it stays English-only in both en and es resources.
- Per-minute time precision in the picker — locked at 5-minute granularity for v1.
- A reusable `useRealtimeChannel(name, attach)` hook — premature; the 4 sites are simple enough to patch in place.

## Fix details

### 1. TimePickerModal

**Files:**
- Create: `mobile/src/components/TimePickerModal.tsx`
- Modify: `mobile/src/components/RecurrencePicker.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`
- Modify: `mobile/tests/RecurrencePicker.test.tsx`

#### Component API

```ts
type Props = {
  visible: boolean;
  initial?: string;          // 'HH:MM', defaults to '08:00' when undefined
  onCancel: () => void;
  onConfirm: (hhmm: string) => void;
};

export function TimePickerModal(props: Props): JSX.Element;
```

The modal uses two snap-aligned `FlatList`s side by side: hours 0–23 (left), minutes 0/5/10/.../55 (right). The centered row is the current selection — implemented via `snapToInterval` + `decelerationRate: 'fast'`, with a fixed-height container and three visible rows per list (center row highlighted). Buttons: "Cancel" (left) + "OK" (right). Theme tokens via `useTheme + makeStyles`.

#### Why a custom modal + not @react-native-community/datetimepicker

Established codebase constraint: zero new top-level deps. The custom picker is ~150 LOC of plain RN primitives, theme-aware, and gives us full control over styling, light/dark mode, and Spanish-localized labels. Trade-off: doesn't match each platform's native picker exactly — acceptable given consistent cross-platform look is more valuable here.

#### Integration in `RecurrencePicker`

Replace the current "add time" row (text input + "+ Add" button) with a single "+ Add time" `Pressable` that opens the modal. Existing chips become tappable to *edit* — tapping a chip opens the modal pre-filled with that chip's value; on confirm the old chip is replaced.

State changes in `RecurrencePicker`:
- New state `pickerVisible: boolean`.
- New state `editingTime: string | null` — when null, the modal is opening for an add; when set to an existing time, the modal is opening to edit that time. On confirm: if `editingTime` was null, dedup-add the new time; if set, remove the old time and add the new one (preserves the chip order via sort).
- Remove `pendingTime` state and `error` state; the modal validates internally so the picker no longer needs them.

TestIDs:
- `time-picker-trigger` — the Pressable that opens the modal (replaces `add-time-button`).
- `time-picker-modal` — the modal root (for assertions about visibility).
- `time-picker-confirm` — the OK button inside the modal.
- `time-picker-cancel` — the Cancel button inside the modal.
- `time-chip-${time}` — the chip Pressable (for tap-to-edit).
- `time-chip-remove-${time}` — unchanged.

#### Component implementation

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet, type ListRenderItem } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

type Props = {
  visible: boolean;
  initial?: string;
  onCancel: () => void;
  onConfirm: (hhmm: string) => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const ROW_H = 44;
const VISIBLE_ROWS = 5;            // 2 above + center + 2 below

function parse(initial: string | undefined): { h: number; m: number } {
  const raw = (initial ?? '08:00').trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return { h: 8, m: 0 };
  const h = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  // Snap to nearest 5-minute step (rounds down — picker only offers 5-min steps).
  const m = Math.min(55, Math.round(minute / 5) * 5);
  return { h, m };
}

export function TimePickerModal({ visible, initial, onCancel, onConfirm }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [{ h, m }, setHM] = useState(() => parse(initial));
  const hourRef = useRef<FlatList<number>>(null);
  const minRef = useRef<FlatList<number>>(null);

  // Re-init when the modal opens (so editing a different chip starts from its value).
  useEffect(() => {
    if (!visible) return;
    const next = parse(initial);
    setHM(next);
    // Scroll both wheels to the parsed value on next frame.
    requestAnimationFrame(() => {
      hourRef.current?.scrollToIndex({ index: next.h, animated: false });
      minRef.current?.scrollToIndex({ index: MINUTES.indexOf(next.m), animated: false });
    });
  }, [visible, initial]);

  const onHourScrollEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW_H);
    setHM((s) => ({ ...s, h: Math.max(0, Math.min(23, i)) }));
  };
  const onMinScrollEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW_H);
    const m = MINUTES[Math.max(0, Math.min(MINUTES.length - 1, i))];
    setHM((s) => ({ ...s, m }));
  };

  const renderHour: ListRenderItem<number> = ({ item }) => (
    <View style={[styles.row, item === h && styles.rowSel]}>
      <Text style={[styles.rowText, item === h && styles.rowTextSel]}>
        {item.toString().padStart(2, '0')}
      </Text>
    </View>
  );
  const renderMin: ListRenderItem<number> = ({ item }) => (
    <View style={[styles.row, item === m && styles.rowSel]}>
      <Text style={[styles.rowText, item === m && styles.rowTextSel]}>
        {item.toString().padStart(2, '0')}
      </Text>
    </View>
  );

  const hhmm = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay} testID="time-picker-modal">
        <View style={styles.card}>
          <Text style={styles.title}>{t('forms.pickTimeTitle')}</Text>
          <View style={styles.wheels}>
            <FlatList
              ref={hourRef}
              data={HOURS}
              keyExtractor={(item) => `h-${item}`}
              renderItem={renderHour}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_H}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
              contentContainerStyle={{ paddingVertical: ROW_H * Math.floor(VISIBLE_ROWS / 2) }}
              style={styles.wheel}
              onMomentumScrollEnd={onHourScrollEnd}
              initialScrollIndex={h}
            />
            <Text style={styles.colon}>:</Text>
            <FlatList
              ref={minRef}
              data={MINUTES}
              keyExtractor={(item) => `m-${item}`}
              renderItem={renderMin}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_H}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
              contentContainerStyle={{ paddingVertical: ROW_H * Math.floor(VISIBLE_ROWS / 2) }}
              style={styles.wheel}
              onMomentumScrollEnd={onMinScrollEnd}
              initialScrollIndex={MINUTES.indexOf(m)}
            />
          </View>
          <View style={styles.actions}>
            <Pressable testID="time-picker-cancel" onPress={onCancel} style={[styles.btn, styles.btnCancel]}>
              <Text style={styles.btnCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable testID="time-picker-confirm" onPress={() => onConfirm(hhmm)} style={[styles.btn, styles.btnOk]}>
              <Text style={styles.btnOkText}>{t('common.ok')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,40,38,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, width: 320, gap: spacing.md },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text, textAlign: 'center' },
    wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ROW_H * VISIBLE_ROWS, gap: spacing.sm },
    wheel: { flex: 1, height: ROW_H * VISIBLE_ROWS },
    colon: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    row: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
    rowSel: { backgroundColor: 'rgba(14,165,164,0.12)', borderRadius: radii.md },
    rowText: { fontFamily: typography.fontFamilySemi, fontSize: 22, color: colors.textMuted },
    rowTextSel: { color: colors.primaryDark, fontFamily: typography.fontFamilyBold },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.pill, alignItems: 'center' },
    btnCancel: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
    btnCancelText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
    btnOk: { backgroundColor: colors.primary },
    btnOkText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: '#fff' },
  });
```

#### RecurrencePicker changes

- Import `TimePickerModal`.
- Add state `pickerVisible: boolean`, `editingTime: string | null`.
- Remove state `pendingTime`, `error`.
- Remove the `addTime` function; replace with two callbacks:
  - `openPickerForAdd()` — sets `editingTime = null`, `pickerVisible = true`.
  - `openPickerForEdit(time)` — sets `editingTime = time`, `pickerVisible = true`.
  - `onConfirmTime(hhmm)` — closes modal, dedup-adds (or replaces if editing), sorts.
- The "+ Add time" Pressable below the chips opens the modal in add mode.
- Each chip's main label area becomes a Pressable that opens the modal in edit mode (the × icon remains a separate Pressable for remove).
- The validated text input + error label disappear (modal can't produce invalid output).

#### i18n keys

en:
```json
"pickTimeTitle": "Pick a time",
"ok": "OK"
```

(Place `pickTimeTitle` under `forms`. `ok` lives under `common` — only add if it doesn't already exist.)

es:
```json
"pickTimeTitle": "Elige una hora",
"ok": "Aceptar"
```

#### Test updates

The existing `RecurrencePicker.test.tsx` covers six cases. Several of them now need updating because the API surface changed (text input + "+ Add" → modal trigger + modal confirm):

- "renders Specific times toggle off by default for daily without times" — unchanged.
- "turning the toggle on starts with empty times and shows the input row" — rename to "shows the picker trigger row" and assert `getByTestId('time-picker-trigger')` instead of `getByTestId('add-time-input')`.
- "adding a valid time inserts it sorted and dedup" — restructure: tap the trigger, assert modal becomes visible, simulate confirm with a target time, then assert `onChange` was called with the sorted result.
- "adding a duplicate time is a no-op" — same structure: open modal, confirm with an existing time, assert `onChange` was not called.
- "removing a time chip drops it" — unchanged (testID `time-chip-remove-${time}` preserved).
- "invalid time format shows error and does not call onChange" — DELETE this test. The modal's wheels can only produce valid HH:MM strings, so the validation path no longer exists. Replace with a new test "tapping an existing chip opens picker in edit mode and replacing the value updates the chip" which exercises the edit flow.

The exact updated test code lives in the plan's TDD step. Six tests in, six tests out (one deleted, one added).

### 2. Shores → HomeSquad rename (user-visible only)

**Files:**
- `mobile/app.json`
- `mobile/src/i18n/locales/en.json`, `es.json`
- `mobile/app/(auth)/login.tsx`
- `mobile/app/(auth)/signup.tsx`
- `supabase/functions/send_push_drain/index.ts`

#### `mobile/app.json`

Change `"name": "Shores"` to `"name": "HomeSquad"`. Leave `"slug"` and `"scheme"` as `"shores"` — those are internal identifiers that preserve dev-build continuity.

#### i18n: new key `app.brandName`

en:
```json
"app": {
  "brandName": "HomeSquad"
}
```

es:
```json
"app": {
  "brandName": "HomeSquad"
}
```

(Brand name is English-only; the same string in both locales.)

Also update the existing `auth.subtitle` (or whatever the welcome subtitle key is — verify during implementation; the screenshot shows "Shores turns everyday chores into a little adventure for your whole family." in en.json). Change "Shores" to "HomeSquad" inline in both en + es subtitle strings. The brandName key gives us a way to interpolate going forward.

#### Login + signup screens

Each has one hardcoded `"Shores"` literal. Replace with `t('app.brandName')`. The change is purely textual — no layout or style change.

#### `send_push_drain/index.ts`

Add a constant near the top:

```ts
const BRAND = 'HomeSquad';
```

Replace all 14 occurrences of `title: 'Shores',` with `title: BRAND,`. The function body becomes more DRY too.

### 3. Realtime channel name uniqueness

**Files:**
- `mobile/src/hooks/useCelebrationCatchup.ts`
- `mobile/app/(app)/kid/[profileId]/index.tsx`
- `mobile/src/lib/realtime.ts`

#### The pattern

Inside each component or hook that creates a Supabase Realtime channel, generate a per-mount-instance unique suffix using `useRef`:

```ts
const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;
// ...
.channel(`celebration-cursor-${profileId}-${channelKey}`)
```

`useRef`'s initializer runs once per component instance — across re-renders the same value is returned. Across mount cycles a new instance is created, generating a new random suffix. This prevents two effect invocations from referring to the same channel name in the Supabase client registry.

For `mobile/src/lib/realtime.ts` — `subscribeToFamily` is a plain function, not a hook. The unique suffix has to come from the caller. Adjust the signature to accept an optional suffix:

```ts
export function subscribeToFamily(
  familyId: string,
  queryClient: QueryClient,
  channelKey: string,
): RealtimeChannel {
  // ...
  .channel(`family-${familyId}-${channelKey}`)
  // ...
}
```

And in `mobile/app/_layout.tsx`'s `RealtimeBridge`, generate the key once via `useRef` and pass it in:

```ts
const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;
// ...
const channel = subscribeToFamily(family.familyId, qc, channelKey);
```

#### Affected channels

| Location | Channel name | After fix |
|---|---|---|
| `useCelebrationCatchup.ts:102` | `celebration-cursor-${profileId}` | `celebration-cursor-${profileId}-${channelKey}` |
| `kid/[profileId]/index.tsx:152` | `kid-feedback-chore-${profileId}` | `kid-feedback-chore-${profileId}-${channelKey}` |
| `kid/[profileId]/index.tsx:163` | `kid-feedback-red-${profileId}` | `kid-feedback-red-${profileId}-${channelKey}` |
| `realtime.ts:8` | `family-${familyId}` | `family-${familyId}-${channelKey}` |

All four sites get the same `useRef`-based key (one ref per component, applied to whichever channels that component creates).

#### Why this works

- Each mount instance of the component gets a fresh random 8-char suffix.
- Re-renders of the same instance preserve the suffix (useRef is stable).
- Mount → cleanup → remount creates two distinct channel names; no collision in the client's channel registry.
- Server-side, during the brief overlap between cleanup and remount in StrictMode, the old channel is gracefully removed by `supabase.removeChannel(ch)` while the new channel registers under a different name. No conflict.

#### Verification

- Open the app in dev, navigate to the kid home, then to the photo screen, then back. No `cannot add postgres_changes callbacks` error in Metro logs.
- Realtime continues to work end-to-end: parent approves a chore from another session → the kid home updates (kid-feedback-chore channel listener fires) → celebration banner queue advances (celebration-cursor channel listener moves the watermark).

#### Out of scope for this fix

- A reusable `useRealtimeChannel(name, attach)` hook to encapsulate the pattern. Worth a future cleanup once we have ≥5 sites; not yet.
- Sentry/observability wiring for the realtime error if it does recur. Defer.

## Risk + rollout

- **TimePickerModal**: new file. RecurrencePicker rewrites are contained; the new modal is invoked from one place. Light/dark theme tested via tokens. The 5-minute granularity is a deliberate simplification — if a user needs 8:03 specifically, that's a v2 conversation.
- **Rename**: silent. Devices update title on next push received. No migration needed. The Expo `name` change updates the Android launcher label on next dev-client rebuild; until then the icon still reads "Shores" because the Android manifest's `android:label` was baked at build time. Document this as a follow-up to rebuild the dev client when desired.
- **Realtime fix**: defense-in-depth one-line change per site. If somehow the fix introduced a regression, the symptom would be `removeChannel` failing to find the channel — which is benign (warning, not error) and would be obvious on every navigation.

## Verification

- `tsc --noEmit` clean.
- `npm test -- --ci --watchman=false` green; updated RecurrencePicker test passes (6 tests after restructure).
- Manual emulator pass:
  - **Time picker**: add chore → toggle Specific times → tap "+ Add time" → modal opens → wheels work → confirm with 08:00 → chip appears. Tap chip → modal opens with 08:00 pre-filled → change to 09:30 → confirm → chip updates. Cancel button closes without changes. Add a second time, confirm sort order.
  - **Rename**: app launcher icon (after rebuild) shows "HomeSquad". Login + signup screens read "HomeSquad" where they used to say "Shores". Take an action that fires a push (e.g., kid completes a chore in approval mode) → push title reads "HomeSquad".
  - **Realtime fix**: kid completes a photo chore → photo upload flow runs → no `postgres_changes` error in Metro. Navigate back and forth between kid home and photo screen ~5 times → no error. Hot-reload the app → no error.
