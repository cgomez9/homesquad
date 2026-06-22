import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PRIVILEGE_ICONS, PRIVILEGE_ICON_IDS, type PrivilegeIconId } from '../constants/privilegeIcons';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

type Props = {
  value: PrivilegeIconId;
  onChange: (id: PrivilegeIconId) => void;
};

export function PrivilegeIconPicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.label}>{t('privilegeIcons.label')}</Text>
      <View style={styles.row}>
        {PRIVILEGE_ICON_IDS.map((id) => {
          const sel = id === value;
          const { emoji, labelKey } = PRIVILEGE_ICONS[id];
          return (
            <Pressable
              key={id}
              testID={`privilege-icon-${id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(id)}
              style={[styles.chip, sel && styles.chipSel]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={[styles.chipLabel, sel && styles.chipLabelSel]}>
                {t(`privilegeIcons.${labelKey}`)}
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
