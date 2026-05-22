import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, typography } from '../theme';

type Props = {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ onSubmit, onCancel, error }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [pin, setPin] = useState('');

  function press(k: string) {
    if (k === '') return;
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pin.title')}</Text>
      <View style={styles.dots}>
        {[0,1,2,3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <Pressable key={i} style={styles.key} onPress={() => press(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { padding: spacing.xl, alignItems: 'center', gap: spacing.lg },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
    dots: { flexDirection: 'row', gap: spacing.lg },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textMuted },
    dotFilled: { backgroundColor: colors.text, borderColor: colors.text },
    error: { color: colors.error, fontSize: typography.small, fontFamily: typography.fontFamilySemi },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
    key: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
    keyText: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    cancel: { paddingVertical: spacing.sm },
    cancelText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.primary },
  });
