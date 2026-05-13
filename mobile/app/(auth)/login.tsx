import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { PasswordField } from '../../src/components/PasswordField';
import { SocialAuthRow } from '../../src/components/SocialAuthRow';
import { signIn } from '../../src/lib/auth';
import { colors, spacing, typography } from '../../src/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? t('auth.errors.signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <Text style={styles.title}>{t('auth.login.title')}</Text>
      <SocialAuthRow />
      <TextField
        label={t('auth.login.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <PasswordField
        label={t('auth.login.password')}
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={t('auth.login.submit')} onPress={onSubmit} loading={loading} />
      <View style={styles.links}>
        <Link href="/(auth)/signup" style={styles.link}>{t('auth.login.noAccount')}</Link>
        <Link href="/(auth)/reset" style={styles.link}>{t('auth.login.forgotPassword')}</Link>
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
  links: { marginTop: spacing.lg, gap: spacing.md, alignItems: 'center' },
  link: {
    color: colors.primary,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    paddingVertical: spacing.sm,
  },
});
