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
