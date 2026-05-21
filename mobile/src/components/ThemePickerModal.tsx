import { useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radii, spacing, typography, useTheme, type Palette, type ThemeMode } from '../theme';

type Props = {
  visible: boolean;
  current: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  onCancel: () => void;
};

export function ThemePickerModal({ visible, current, onSelect, onCancel }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const options: { value: ThemeMode; labelKey: string }[] = [
    { value: 'light', labelKey: 'settings.theme.light' },
    { value: 'dark', labelKey: 'settings.theme.dark' },
    { value: 'system', labelKey: 'settings.theme.system' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('settings.theme.label')}</Text>
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              testID={`theme-option-${opt.value}`}
              onPress={() => onSelect(opt.value)}
              style={styles.row}
            >
              <View style={[styles.radio, current === opt.value && styles.radioOn]}>
                {current === opt.value && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.rowLabel}>{t(opt.labelKey)}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xl, width: '100%', maxWidth: 360, gap: spacing.sm },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text, marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
    radio: { width: 22, height: 22, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    radioOn: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.primary },
    rowLabel: { fontFamily: typography.fontFamily, fontSize: typography.body, color: colors.text },
  });
