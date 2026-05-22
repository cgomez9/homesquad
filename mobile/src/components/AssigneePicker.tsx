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
