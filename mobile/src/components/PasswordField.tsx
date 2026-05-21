import { useMemo, useState } from 'react';
import { TextInput, View, Text, StyleSheet, Pressable, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, useTheme, type Palette } from '../theme';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

type Props = TextInputProps & {
  label: string;
  error?: string;
  showStrength?: boolean;
};

export function PasswordField({ label, error, style, showStrength, onFocus, onBlur, value, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          testID="password-input"
          {...rest}
          value={value as string}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          secureTextEntry={!visible}
          style={[
            styles.input,
            focused && styles.inputFocused,
            error && styles.inputError,
            style,
          ]}
          placeholderTextColor={colors.textMuted}
        />
        <Pressable
          testID="password-toggle"
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          style={styles.eyeBtn}
        >
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {showStrength && typeof value === 'string' && value.length > 0 ? (
        <View testID="password-strength-bar">
          <PasswordStrengthMeter value={value as string} />
        </View>
      ) : null}
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
    inputWrap: { position: 'relative' },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingRight: 44,
      fontSize: typography.body,
      fontFamily: typography.fontFamily,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    inputFocused: { borderColor: colors.primary },
    inputError: { borderColor: colors.error },
    eyeBtn: {
      position: 'absolute',
      right: spacing.md,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    error: {
      color: colors.error,
      fontSize: typography.small,
      fontFamily: typography.fontFamily,
      marginTop: spacing.xs,
    },
  });
