import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

export type TaskKind = 'chore' | 'skill';

const KINDS: TaskKind[] = ['chore', 'skill'];

export function TaskKindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: TaskKind;
  onChange: (v: TaskKind) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.label}>{t('forms.taskType.label')}</Text>
      <View style={styles.row}>
        {KINDS.map((k) => {
          const sel = k === value;
          return (
            <Pressable
              key={k}
              onPress={() => !disabled && onChange(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled }}
              style={[styles.btn, sel && styles.btnSel, disabled && styles.btnDisabled]}
            >
              <Text style={[styles.btnEmoji]}>{k === 'chore' ? '⭐' : '🎯'}</Text>
              <Text style={[styles.btnLabel, sel && styles.btnLabelSel]}>
                {t(`forms.taskType.${k}.label`)}
              </Text>
              <Text style={[styles.btnHint, sel && styles.btnHintSel]} numberOfLines={2}>
                {t(`forms.taskType.${k}.hint`)}
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
      minHeight: 88,
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
    btnSel: { backgroundColor: colors.primary, borderColor: colors.primary },
    btnDisabled: { opacity: 0.55 },
    btnEmoji: { fontSize: 22, marginBottom: 2 },
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
