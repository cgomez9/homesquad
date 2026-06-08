import { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme, type Palette, radii, spacing, typography } from '../theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: (code: string) => void;
};

export function PairCodeInput({ value, onChange, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const inputRef = useRef<TextInput>(null);

  function handleChange(next: string) {
    const cleaned = next.replace(/\D/g, '').slice(0, 6);
    onChange(cleaned);
    if (cleaned.length === 6 && onSubmit) onSubmit(cleaned);
  }

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} testID="pair-digit" style={[styles.box, value.length === i && styles.boxActive]}>
            <Text style={styles.digit}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        testID="pair-hidden-input"
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        autoComplete="off"
        textContentType="none"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
    box: {
      width: 44,
      height: 56,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxActive: { borderColor: colors.primary },
    digit: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  });
