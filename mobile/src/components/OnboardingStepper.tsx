// Extensible onboarding step indicator. Pass the ordered step labels and the
// current index; future steps (e.g. "Activities") just get appended to the
// array by the caller — no layout changes needed here.
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radii, spacing, typography, useTheme, type Palette } from '../theme';

export function OnboardingStepper({ steps, current }: { steps: string[]; current: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row} accessibilityRole="progressbar">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={styles.stepWrap}>
            {i > 0 && <View style={[styles.bar, i <= current && styles.barOn]} />}
            <View style={styles.step}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                <Text style={[styles.dotText, (done || active) && styles.dotTextOn]}>
                  {done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text
                style={[styles.label, (done || active) && styles.labelOn]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    stepWrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    bar: {
      width: 28,
      height: 3,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginHorizontal: spacing.sm,
    },
    barOn: { backgroundColor: colors.primary },
    step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
    },
    dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    dotText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
    dotTextOn: { color: '#fff' },
    label: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
    labelOn: { color: colors.text },
  });
