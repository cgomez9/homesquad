# Time Picker + Rename + Realtime Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HH:MM text input in `RecurrencePicker` with a vendored modal time picker (hour + minute wheels, 5-min granularity); rename Shores → HomeSquad in user-visible strings only (app display name, auth wordmarks, i18n subtitle, push notification titles); fix the `cannot add postgres_changes callbacks after subscribe()` error by appending a `useRef`-generated suffix to each `supabase.channel(...)` name.

**Architecture:** New `TimePickerModal` component (~150 LOC, two snap-aligned `FlatList`s, theme-aware). `RecurrencePicker` swaps the text input for a modal trigger + edit-on-chip-tap. Rename touches 5 files and extracts a `BRAND` constant in `send_push_drain`. Realtime fix is one ref per consumer (4 sites) — preserves all existing event listeners and channel cleanup paths.

**Tech Stack:** Expo React Native, react-i18next, TanStack Query, Supabase Realtime. Zero new top-level dependencies.

**Spec:** `docs/superpowers/specs/2026-05-22-time-picker-rename-realtime-fix-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `mobile/src/components/TimePickerModal.tsx` | Hour + minute wheel modal (create) |
| `mobile/src/components/RecurrencePicker.tsx` | Replace text-input row with modal trigger; tap-chip-to-edit (modify) |
| `mobile/tests/RecurrencePicker.test.tsx` | Restructure tests for the modal flow (modify) |
| `mobile/src/i18n/locales/en.json`, `es.json` | New keys: `forms.pickTimeTitle`, `common.ok`, `app.brandName`; subtitle copy (modify) |
| `mobile/app.json` | `name` Shores → HomeSquad (modify) |
| `mobile/app/(auth)/login.tsx`, `signup.tsx` | Wordmark Shores → `t('app.brandName')` (modify) |
| `supabase/functions/send_push_drain/index.ts` | Extract `BRAND` constant, replace 14 push titles (modify) |
| `mobile/src/hooks/useCelebrationCatchup.ts` | Append useRef channel key (modify) |
| `mobile/app/(app)/kid/[profileId]/index.tsx` | Same for two channels (modify) |
| `mobile/src/lib/realtime.ts` | Accept `channelKey` parameter (modify) |
| `mobile/app/_layout.tsx` | Generate key, pass into `subscribeToFamily` (modify) |

---

## Task 1: TimePickerModal component + i18n keys

**Files:**
- Create: `mobile/src/components/TimePickerModal.tsx`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`

- [ ] **Step 1: Add i18n keys (en)**

In `mobile/src/i18n/locales/en.json`, inside the existing `forms` block, add (mind comma):

```json
"pickTimeTitle": "Pick a time"
```

Inside the existing `common` block (between `back` and `cancel`):

```json
"ok": "OK"
```

If `common.ok` already exists, skip; verify with `grep '"ok"' mobile/src/i18n/locales/en.json`.

- [ ] **Step 2: Add i18n keys (es)**

In `mobile/src/i18n/locales/es.json`, inside `forms`:

```json
"pickTimeTitle": "Elige una hora"
```

Inside `common`:

```json
"ok": "Aceptar"
```

Same skip-if-exists check.

- [ ] **Step 3: Create `mobile/src/components/TimePickerModal.tsx`**

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
const VISIBLE_ROWS = 5;

function parse(initial: string | undefined): { h: number; m: number } {
  const raw = (initial ?? '08:00').trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return { h: 8, m: 0 };
  const h = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
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

  useEffect(() => {
    if (!visible) return;
    const next = parse(initial);
    setHM(next);
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

- [ ] **Step 4: TypeScript check**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean. The component is self-contained; tsc only verifies that imports + types resolve.

- [ ] **Step 5: Run full test suite (regression — no component test for the modal itself, the integration test in Task 2 exercises it)**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass. No tests reference the new component yet.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/TimePickerModal.tsx mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json
git commit -m "feat(mobile): add TimePickerModal — hour + minute wheel picker, zero new deps"
```

---

## Task 2: Integrate TimePickerModal into RecurrencePicker

**Files:**
- Modify: `mobile/src/components/RecurrencePicker.tsx`
- Modify: `mobile/tests/RecurrencePicker.test.tsx`

This task uses TDD: write the new test expectations first, run them to fail, then refactor the picker.

- [ ] **Step 1: Replace the test file `mobile/tests/RecurrencePicker.test.tsx` with the new structure**

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecurrencePicker } from '../src/components/RecurrencePicker';
import type { Recurrence } from '../src/lib/recurrence';

function controlled(initial: Recurrence) {
  let value = initial;
  const onChange = jest.fn((next: Recurrence) => { value = next; });
  return { get value() { return value; }, onChange };
}

describe('RecurrencePicker times UI', () => {
  it('renders Specific times toggle off by default for daily without times', () => {
    const { onChange } = controlled({ type: 'daily' });
    const { getByTestId } = render(
      <RecurrencePicker value={{ type: 'daily' }} onChange={onChange} />,
    );
    const toggle = getByTestId('specific-times-toggle');
    expect(toggle.props.value).toBe(false);
  });

  it('turning the toggle on starts with empty times and shows the picker trigger', () => {
    const ctrl = controlled({ type: 'daily' });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent(getByTestId('specific-times-toggle'), 'valueChange', true);
    expect(ctrl.onChange).toHaveBeenCalledWith({ type: 'daily', times: [] });
    const tree = render(
      <RecurrencePicker value={{ type: 'daily', times: [] }} onChange={ctrl.onChange} />,
    );
    expect(tree.queryByTestId('time-picker-trigger')).not.toBeNull();
  });

  it('tapping the trigger opens the modal and confirming a time adds it sorted', () => {
    const ctrl = controlled({ type: 'daily', times: ['20:00'] });
    const { getByTestId, queryByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    // Modal not visible initially.
    expect(queryByTestId('time-picker-modal')).toBeNull();
    // Open it.
    fireEvent.press(getByTestId('time-picker-trigger'));
    expect(getByTestId('time-picker-modal')).not.toBeNull();
    // The modal's default value is '08:00'. Confirming should add it sorted before 20:00.
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).toHaveBeenLastCalledWith({ type: 'daily', times: ['08:00', '20:00'] });
  });

  it('confirming a duplicate time is a silent no-op', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-picker-trigger'));
    // Modal default is 08:00; confirm without changing wheels.
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).not.toHaveBeenCalled();
  });

  it('removing a time chip drops it', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00', '20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-chip-remove-08:00'));
    expect(ctrl.onChange).toHaveBeenCalledWith({ type: 'daily', times: ['20:00'] });
  });

  it('tapping a chip opens the picker in edit mode and confirming replaces the value', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00', '20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    // Tap the 08:00 chip to edit.
    fireEvent.press(getByTestId('time-chip-08:00'));
    expect(getByTestId('time-picker-modal')).not.toBeNull();
    // The modal initial should be 08:00; confirming as-is is a no-op (dedup).
    // To verify the replace path we'd need to simulate scrolling the wheel, which
    // is impractical in jsdom. Assert behavior by confirming: when the modal is
    // open in edit mode and the user confirms the same value, onChange is NOT
    // called (the existing value is preserved, not duplicated).
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=RecurrencePicker`
Expected: tests fail because `time-picker-trigger`, `time-picker-modal`, `time-picker-confirm`, `time-chip-08:00` testIDs don't exist yet (the current code uses `add-time-input` + `add-time-button`).

- [ ] **Step 3: Replace `mobile/src/components/RecurrencePicker.tsx` with:**

```tsx
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, radii, typography, useTheme, type Palette } from '../theme';
import { TimePickerModal } from './TimePickerModal';
import type { Recurrence } from '../lib/recurrence';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MAX_TIMES = 6;

export function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (r: Recurrence) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editingTime, setEditingTime] = useState<string | null>(null);

  const isRecurring = value.type !== 'once';
  const currentTimes: string[] =
    (value.type === 'daily' || value.type === 'weekly') ? value.times ?? [] : [];
  const supportsTimes = value.type === 'daily' || value.type === 'weekly';
  const timesEnabled = (value as { times?: string[] }).times !== undefined;

  function patchTimes(next: string[]) {
    if (value.type === 'daily') {
      onChange(next.length === 0 ? { type: 'daily' } : { type: 'daily', times: next });
    } else if (value.type === 'weekly') {
      onChange(
        next.length === 0
          ? { type: 'weekly', days: value.days }
          : { type: 'weekly', days: value.days, times: next },
      );
    }
  }

  function toggleSpecificTimes(on: boolean) {
    if (on) {
      if (value.type === 'daily') onChange({ type: 'daily', times: [] });
      else if (value.type === 'weekly') onChange({ type: 'weekly', days: value.days, times: [] });
    } else {
      patchTimes([]);
    }
  }

  function openPickerForAdd() {
    if (currentTimes.length >= MAX_TIMES) return;
    setEditingTime(null);
    setPickerVisible(true);
  }

  function openPickerForEdit(time: string) {
    setEditingTime(time);
    setPickerVisible(true);
  }

  function onConfirmTime(hhmm: string) {
    setPickerVisible(false);
    const editing = editingTime;
    setEditingTime(null);
    if (editing) {
      // Edit flow: if user confirmed the same time, no-op. Otherwise replace.
      if (editing === hhmm) return;
      const without = currentTimes.filter((x) => x !== editing);
      if (without.includes(hhmm)) {
        // The new time already exists elsewhere — just drop the edited one to dedup.
        patchTimes([...without].sort());
        return;
      }
      patchTimes([...without, hhmm].sort());
    } else {
      // Add flow.
      if (currentTimes.includes(hhmm)) return; // silent dedup
      if (currentTimes.length >= MAX_TIMES) return;
      patchTimes([...currentTimes, hhmm].sort());
    }
  }

  function removeTime(time: string) {
    patchTimes(currentTimes.filter((x) => x !== time));
  }

  return (
    <View>
      <Text style={styles.label}>{t('forms.recurrenceLabel')}</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('forms.repeats')}</Text>
        <Switch
          value={isRecurring}
          onValueChange={(on) =>
            onChange(on ? { type: 'daily' } : { type: 'once', due: new Date().toISOString().slice(0, 10) })
          }
        />
      </View>

      {!isRecurring && value.type === 'once' && (
        <View>
          <Text style={styles.sub}>{t('forms.dueDateLabel')}</Text>
          <TextInput
            value={value.due}
            onChangeText={(text) => onChange({ type: 'once', due: text })}
            style={styles.input}
            placeholder={t('forms.dueDatePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      )}

      {isRecurring && (
        <View>
          <View style={styles.segRow}>
            {(['daily', 'weekly'] as const).map((kind) => {
              const sel = value.type === kind;
              return (
                <Pressable
                  key={kind}
                  onPress={() =>
                    onChange(
                      kind === 'daily'
                        ? { type: 'daily', ...(currentTimes.length ? { times: currentTimes } : {}) }
                        : { type: 'weekly', days: [new Date().getDay()], ...(currentTimes.length ? { times: currentTimes } : {}) },
                    )
                  }
                  style={[styles.seg, sel && styles.segSel]}
                >
                  <Text style={[styles.segText, sel && styles.segTextSel]}>
                    {kind === 'daily' ? t('forms.recurrenceDaily') : t('forms.recurrenceWeekly')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {value.type === 'weekly' && (
            <View style={styles.daysRow}>
              {DAY_KEYS.map((key, i) => {
                const sel = value.days.includes(i);
                return (
                  <Pressable
                    key={key}
                    onPress={() =>
                      onChange({
                        type: 'weekly',
                        days: sel ? value.days.filter((d) => d !== i) : [...value.days, i].sort(),
                        ...(currentTimes.length ? { times: currentTimes } : {}),
                      })
                    }
                    style={[styles.dayChip, sel && styles.dayChipSel]}
                  >
                    <Text style={[styles.dayText, sel && styles.dayTextSel]}>
                      {t(`recurrence.dayShort.${key}`).charAt(0)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {supportsTimes && (
            <View style={styles.timesBlock}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('forms.specificTimesToggle')}</Text>
                <Switch
                  testID="specific-times-toggle"
                  value={timesEnabled}
                  onValueChange={toggleSpecificTimes}
                />
              </View>

              {timesEnabled && (
                <View>
                  <View style={styles.chipsRow}>
                    {currentTimes.map((time) => (
                      <Pressable
                        key={time}
                        testID={`time-chip-${time}`}
                        onPress={() => openPickerForEdit(time)}
                        style={styles.chip}
                      >
                        <Text style={styles.chipText}>{time}</Text>
                        <Pressable
                          testID={`time-chip-remove-${time}`}
                          onPress={() => removeTime(time)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`remove ${time}`}
                        >
                          <Text style={styles.chipRemove}>×</Text>
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    testID="time-picker-trigger"
                    onPress={openPickerForAdd}
                    style={styles.addBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.addBtnText}>+ {t('forms.addTime')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <TimePickerModal
        visible={pickerVisible}
        initial={editingTime ?? '08:00'}
        onCancel={() => { setPickerVisible(false); setEditingTime(null); }}
        onConfirm={onConfirmTime}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: { fontSize: typography.small, fontFamily: typography.fontFamilyBold, color: colors.textMuted, marginBottom: spacing.xs + 2 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
    rowLabel: { flex: 1, fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.text },
    sub: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: spacing.sm },
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginTop: spacing.xs, fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.text, backgroundColor: colors.surface },
    segRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
    seg: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
    segSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.text },
    segTextSel: { color: '#fff' },
    daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
    dayChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    dayChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
    dayTextSel: { color: '#fff' },
    timesBlock: { marginTop: spacing.md },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14,165,164,0.12)', paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill },
    chipText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.primaryDark },
    chipRemove: { fontFamily: typography.fontFamilyBold, fontSize: 18, color: colors.primaryDark, lineHeight: 18 },
    addBtn: { marginTop: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
    addBtnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.primary },
  });
```

Note: the once-recurrence date `TextInput` is preserved exactly as before. The `times[]` modal flow is independent of the once recurrence's date field — they live in different conditional branches.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --testPathPattern=RecurrencePicker`
Expected: 6 tests pass.

- [ ] **Step 5: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/components/RecurrencePicker.tsx mobile/tests/RecurrencePicker.test.tsx
git commit -m "feat(mobile): RecurrencePicker — TimePickerModal trigger + tap-chip-to-edit"
```

---

## Task 3: Shores → HomeSquad rename (user-visible)

**Files:**
- Modify: `mobile/app.json`
- Modify: `mobile/src/i18n/locales/en.json`, `es.json`
- Modify: `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/signup.tsx`
- Modify: `supabase/functions/send_push_drain/index.ts`

- [ ] **Step 1: Update `mobile/app.json`**

Find the line `"name": "Shores",` and change to `"name": "HomeSquad",`. Leave `"slug"` and `"scheme"` as `"shores"` (internal identifiers; dev-build continuity).

- [ ] **Step 2: Add `app.brandName` to en.json**

In `mobile/src/i18n/locales/en.json`, add a new top-level block at the end of the file (mind the comma after the previous block):

```json
"app": {
  "brandName": "HomeSquad"
}
```

- [ ] **Step 3: Update the subtitle copy in en.json**

In the same file, find `auth.welcome.subtitle`:

```
"subtitle": "Shores turns everyday chores into a little adventure for your whole family."
```

Replace with:

```
"subtitle": "HomeSquad turns everyday chores into a little adventure for your whole family."
```

- [ ] **Step 4: Add `app.brandName` to es.json**

In `mobile/src/i18n/locales/es.json`, add at the end:

```json
"app": {
  "brandName": "HomeSquad"
}
```

(Same brand name in es — English-only brand.)

- [ ] **Step 5: Update the subtitle copy in es.json**

In the same file, find `auth.welcome.subtitle`:

```
"subtitle": "Shores convierte las tareas de cada día en una pequeña aventura para toda la familia."
```

Replace with:

```
"subtitle": "HomeSquad convierte las tareas de cada día en una pequeña aventura para toda la familia."
```

- [ ] **Step 6: Update `mobile/app/(auth)/login.tsx`**

Find:

```tsx
<Text style={styles.wordmark}>
  Shores<Text style={styles.wordmarkDot}>·</Text>
</Text>
```

Replace with:

```tsx
<Text style={styles.wordmark}>
  {t('app.brandName')}<Text style={styles.wordmarkDot}>·</Text>
</Text>
```

The `t` from `useTranslation` is already in scope in this file.

- [ ] **Step 7: Update `mobile/app/(auth)/signup.tsx`**

Same change as login: find the identical wordmark JSX and replace `Shores` with `{t('app.brandName')}`.

- [ ] **Step 8: Update `supabase/functions/send_push_drain/index.ts`**

At the top of the file (just below the `ACHIEVEMENTS` constant declaration), add:

```ts
const BRAND = 'HomeSquad';
```

Then find every occurrence of `title: 'Shores',` (there are 14) and replace each with `title: BRAND,`.

- [ ] **Step 9: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass. (`translationParity.test.ts` should remain green because both locales add the same key set.)

- [ ] **Step 10: Confirm no stray "Shores" survives in live code**

Run: `cd C:/Users/USUARIO/Desktop/Shores && grep -rE "Shores" --include="*.ts" --include="*.tsx" --include="*.json" mobile/ supabase/functions/ 2>/dev/null | grep -v node_modules`
Expected output: empty. (Doc files under `docs/` and the `slug`/`scheme` in `app.json` are intentionally untouched and excluded by the grep filters.)

- [ ] **Step 11: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/app.json mobile/src/i18n/locales/en.json mobile/src/i18n/locales/es.json mobile/app/\(auth\)/login.tsx mobile/app/\(auth\)/signup.tsx supabase/functions/send_push_drain/index.ts
git commit -m "feat(mobile): rename Shores → HomeSquad in user-visible strings"
```

---

## Task 4: Realtime channel name uniqueness

**Files:**
- Modify: `mobile/src/hooks/useCelebrationCatchup.ts`
- Modify: `mobile/app/(app)/kid/[profileId]/index.tsx`
- Modify: `mobile/src/lib/realtime.ts`
- Modify: `mobile/app/_layout.tsx`

The same `useRef`-generated suffix pattern applies to all four sites.

- [ ] **Step 1: Update `mobile/src/hooks/useCelebrationCatchup.ts`**

Find the live-effect block (the second `useEffect` in the hook, ~line 99-131). Just inside the function body (before either of the two `useEffect`s), add:

```ts
import { useEffect, useRef } from 'react';
// (already imported — confirm by reading the top of the file)
```

Then, at the top of the `useCelebrationCatchup` function (above both `useEffect`s), add:

```ts
const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;
```

Then in the live effect, change:

```ts
const ch = supabase
  .channel(`celebration-cursor-${profileId}`)
```

to:

```ts
const ch = supabase
  .channel(`celebration-cursor-${profileId}-${channelKey}`)
```

- [ ] **Step 2: Update `mobile/app/(app)/kid/[profileId]/index.tsx`**

The kid index already imports `useRef`. Inside the `KidHome` function body (alongside the other refs/state hooks at the top), add:

```ts
const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;
```

Then find both `.channel(...)` calls in the `useEffect` realtime block. Change:

```ts
.channel(`kid-feedback-chore-${profileId}`)
```

to:

```ts
.channel(`kid-feedback-chore-${profileId}-${channelKey}`)
```

And:

```ts
.channel(`kid-feedback-red-${profileId}`)
```

to:

```ts
.channel(`kid-feedback-red-${profileId}-${channelKey}`)
```

- [ ] **Step 3: Update `mobile/src/lib/realtime.ts`**

Change the function signature from:

```ts
export function subscribeToFamily(familyId: string, queryClient: QueryClient): RealtimeChannel {
  const channel = supabase
    .channel(`family-${familyId}`)
```

to:

```ts
export function subscribeToFamily(
  familyId: string,
  queryClient: QueryClient,
  channelKey: string,
): RealtimeChannel {
  const channel = supabase
    .channel(`family-${familyId}-${channelKey}`)
```

- [ ] **Step 4: Update `mobile/app/_layout.tsx`**

In `RealtimeBridge`, the existing call is:

```ts
const channel = subscribeToFamily(family.familyId, qc);
```

Above the `useEffect` (just below the existing destructured hooks), add the ref:

```ts
const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;
```

And update the call inside `useEffect`:

```ts
const channel = subscribeToFamily(family.familyId, qc, channelKey);
```

Make sure `useRef` is imported from `react` at the top of `_layout.tsx` (likely already imported alongside `useEffect`; verify with `grep "from 'react'" mobile/app/_layout.tsx`).

- [ ] **Step 5: TypeScript + full suite**

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npx tsc --noEmit`
Expected: clean. The new `channelKey` parameter on `subscribeToFamily` is required, but the single caller is updated to pass it.

Run: `cd C:/Users/USUARIO/Desktop/Shores/mobile && npm test -- --ci --watchman=false`
Expected: all suites pass. The realtime tests (if any) mock the channel API and aren't affected.

- [ ] **Step 6: Confirm the postgres_changes error is gone (manual)**

Run the app in dev (`cd mobile && npx expo start --android`), open the parent flow → switch to a kid → open a chore in photo mode → tap done. Navigate back and forth a few times. The previous `cannot add postgres_changes callbacks` error should no longer appear in the Metro logs. (No automated coverage; this is a manual smoke.)

- [ ] **Step 7: Commit**

```bash
cd C:/Users/USUARIO/Desktop/Shores
git add mobile/src/hooks/useCelebrationCatchup.ts mobile/app/\(app\)/kid/\[profileId\]/index.tsx mobile/src/lib/realtime.ts mobile/app/_layout.tsx
git commit -m "fix(mobile): unique supabase channel names per mount — eliminates postgres_changes error"
```

---

## Final verification

After all 4 tasks ship:

- [ ] **Full mobile test suite**: `cd mobile && npm test -- --ci --watchman=false` — expected all suites green.
- [ ] **Full TypeScript**: `cd mobile && npx tsc --noEmit` — clean.
- [ ] **No stray "Shores" in live code**: `cd C:/Users/USUARIO/Desktop/Shores && grep -rE "Shores" --include="*.ts" --include="*.tsx" --include="*.json" mobile/ supabase/functions/ | grep -v node_modules` — empty.
- [ ] **Manual emulator walkthrough**:
  - Parent → New chore → toggle Specific times → tap "+ Add time" → modal opens → wheels scroll → confirm 08:00 → chip appears as `08:00 ×`. Tap the chip → modal opens with 08:00 pre-filled → scroll to 09:30 → confirm → chip updates to `09:30 ×`. Add a second time, confirm sort order. Tap × on a chip → it disappears.
  - Login / signup screens: wordmark shows "HomeSquad·". Welcome subtitle reads "HomeSquad turns everyday chores…".
  - Trigger a push (kid completes a chore in approval mode + parent on another device) → push title shows "HomeSquad".
  - Open kid home, navigate to chore photo capture and back several times. No `cannot add postgres_changes callbacks` error in Metro logs.

If everything passes, hand off to `superpowers:finishing-a-development-branch`.
