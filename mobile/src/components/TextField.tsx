import { useMemo, useState } from 'react';
import { TextInput, View, Text, StyleSheet, TextInputProps } from 'react-native';
import { radii, spacing, typography, useTheme, type Palette } from '../theme';

type Props = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[styles.input, focused && styles.inputFocused, error && styles.inputError, style]}
        placeholderTextColor={colors.textMuted}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      marginBottom: spacing.xs,
      color: colors.text,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      fontSize: typography.body,
      fontFamily: typography.fontFamily,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    inputFocused: { borderColor: colors.primary },
    inputError: { borderColor: colors.error },
    error: {
      color: colors.error,
      fontSize: typography.small,
      fontFamily: typography.fontFamily,
      marginTop: spacing.xs,
    },
  });
