import { useMemo } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { radii, typography, useTheme, type Palette } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export function Button({ label, onPress, disabled, loading, variant = 'primary', style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && (variant === 'primary' ? styles.primaryPressed : styles.secondaryPressed),
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} /> : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      height: 52,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primary: { backgroundColor: colors.primary },
    primaryPressed: { backgroundColor: colors.primaryDark },
    secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
    secondaryPressed: { backgroundColor: 'rgba(14, 165, 164, 0.08)' },
    disabled: { opacity: 0.5 },
    label: { color: '#fff', fontSize: typography.body, fontFamily: typography.fontFamilyBold },
    labelSecondary: { color: colors.primary },
  });
