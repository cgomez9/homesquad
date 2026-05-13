import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { PasswordField } from '../../src/components/PasswordField';
import { SocialAuthRow } from '../../src/components/SocialAuthRow';
import { isAcceptable } from '../../src/components/PasswordStrengthMeter';
import { signUp } from '../../src/lib/auth';
import { colors, spacing, typography } from '../../src/theme';

export default function SignupScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && isAcceptable(password) && password === confirm;

  async function onSubmit() {
    setError(null);
    if (!isAcceptable(password)) return setError(t('auth.signup.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.signup.passwordsDontMatch'));
    setLoading(true);
    try {
      await signUp(email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? t('auth.errors.signUpFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <Text style={styles.title}>{t('auth.signup.title')}</Text>
      <SocialAuthRow />
      <TextField
        label={t('auth.signup.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <PasswordField
        label={t('auth.signup.password')}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        showStrength
      />
      <PasswordField
        label={t('auth.signup.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={t('auth.signup.submit')} onPress={onSubmit} loading={loading} disabled={!canSubmit} />
      <View style={styles.links}>
        <Link href="/(auth)/login" style={styles.link}>{t('auth.signup.hasAccount')}</Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center', backgroundColor: colors.bg },
  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.h1,
    color: colors.text,
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: typography.small,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  links: { marginTop: spacing.lg, alignItems: 'center' },
  link: {
    color: colors.primary,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    paddingVertical: spacing.sm,
  },
});
