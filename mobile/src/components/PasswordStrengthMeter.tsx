import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import zxcvbn from 'zxcvbn';
import { spacing, typography, useTheme, type Palette } from '../theme';

type Props = { value: string };

const SEGMENT_COUNT = 5;

function scoreFor(value: string): { score: number; isTooShort: boolean } {
  if (value.length < 8) return { score: 0, isTooShort: true };
  const result = zxcvbn(value);
  return { score: result.score, isTooShort: false };
}

function colorAt(scoreOrTooShort: { score: number; isTooShort: boolean }, colors: Palette): string {
  if (scoreOrTooShort.isTooShort) return colors.strengthVeryWeak;
  switch (scoreOrTooShort.score) {
    case 0: return colors.strengthVeryWeak;
    case 1: return colors.strengthWeak;
    case 2: return colors.strengthFair;
    case 3: return colors.strengthStrong;
    case 4: return colors.strengthVeryStrong;
    default: return colors.strengthVeryWeak;
  }
}

function labelKeyFor(scoreOrTooShort: { score: number; isTooShort: boolean }): string {
  if (scoreOrTooShort.isTooShort) return 'auth.passwordStrength.tooShort';
  switch (scoreOrTooShort.score) {
    case 0: return 'auth.passwordStrength.veryWeak';
    case 1: return 'auth.passwordStrength.weak';
    case 2: return 'auth.passwordStrength.fair';
    case 3: return 'auth.passwordStrength.strong';
    case 4: return 'auth.passwordStrength.veryStrong';
    default: return 'auth.passwordStrength.veryWeak';
  }
}

export function PasswordStrengthMeter({ value }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  if (value.length === 0) return null;

  const s = scoreFor(value);
  const color = colorAt(s, colors);
  const filledCount = s.isTooShort ? 1 : s.score + 1;

  return (
    <View style={styles.container}>
      <View style={styles.barRow}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < filledCount ? color : colors.border },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color }]}>{t(labelKeyFor(s))}</Text>
    </View>
  );
}

export function isAcceptable(value: string): boolean {
  if (value.length < 8) return false;
  return zxcvbn(value).score >= 2;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { marginTop: spacing.sm, gap: spacing.xs },
    barRow: { flexDirection: 'row', gap: spacing.xs },
    segment: { flex: 1, height: 4, borderRadius: 2 },
    label: { fontFamily: typography.fontFamily, fontSize: typography.small },
  });
