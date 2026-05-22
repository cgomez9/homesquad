import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, radii, typography, useTheme, type Palette } from '../theme';
import type { Recurrence } from '../lib/recurrence';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
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
  const [pendingTime, setPendingTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isRecurring = value.type !== 'once';
  const currentTimes: string[] =
    (value.type === 'daily' || value.type === 'weekly')
      ? value.times ?? []
      : [];
  const hasTimes = currentTimes.length > 0;
  const supportsTimes = value.type === 'daily' || value.type === 'weekly';

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
    setError(null);
    if (on) {
      if (value.type === 'daily') onChange({ type: 'daily', times: [] });
      else if (value.type === 'weekly') onChange({ type: 'weekly', days: value.days, times: [] });
    } else {
      patchTimes([]);
    }
  }

  function addTime() {
    setError(null);
    const trimmed = pendingTime.trim();
    if (!TIME_RE.test(trimmed)) {
      setError(t('forms.invalidTime'));
      return;
    }
    if (currentTimes.includes(trimmed)) return;
    if (currentTimes.length >= MAX_TIMES) {
      setError(t('forms.invalidTime'));
      return;
    }
    const next = [...currentTimes, trimmed].sort();
    patchTimes(next);
    setPendingTime('');
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
                  value={hasTimes || (value as { times?: string[] }).times !== undefined}
                  onValueChange={toggleSpecificTimes}
                />
              </View>

              {((value as { times?: string[] }).times !== undefined) && (
                <View>
                  <View style={styles.chipsRow}>
                    {currentTimes.map((time) => (
                      <View key={time} style={styles.chip}>
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
                      </View>
                    ))}
                  </View>
                  <View style={styles.addRow}>
                    <TextInput
                      testID="add-time-input"
                      value={pendingTime}
                      onChangeText={setPendingTime}
                      placeholder={t('forms.addTimePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numbers-and-punctuation"
                      autoCapitalize="none"
                      style={styles.addInput}
                      onSubmitEditing={addTime}
                    />
                    <Pressable
                      testID="add-time-button"
                      onPress={addTime}
                      style={styles.addBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.addBtnText}>{t('forms.addTime')}</Text>
                    </Pressable>
                  </View>
                  {error && (
                    <Text testID="add-time-error" style={styles.error}>{error}</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    rowLabel: {
      flex: 1,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
    },
    sub: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.xs,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    segRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
    seg: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    segSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.text,
    },
    segTextSel: { color: '#fff' },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    dayChip: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.body,
      color: colors.text,
    },
    dayTextSel: { color: '#fff' },
    timesBlock: { marginTop: spacing.md },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(14,165,164,0.12)',
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    chipText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small + 1,
      color: colors.primaryDark,
    },
    chipRemove: {
      fontFamily: typography.fontFamilyBold,
      fontSize: 18,
      color: colors.primaryDark,
      lineHeight: 18,
    },
    addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    addInput: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    addBtn: {
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
    },
    addBtnText: {
      color: '#fff',
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.body,
    },
    error: {
      color: colors.error,
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      marginTop: spacing.xs,
    },
  });
