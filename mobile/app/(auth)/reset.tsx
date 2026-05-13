import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { requestPasswordReset } from '../../src/lib/auth';
import { colors, spacing, typography } from '../../src/theme';

export default function ResetScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e.message ?? t('auth.errors.tryAgain'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('auth.reset.checkEmail')}</Text>
        <Text style={styles.body}>{t('auth.reset.checkEmailBody')}</Text>
        <Link href="/(auth)/login" style={styles.link}>{t('auth.reset.backToLogin')}</Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.reset.title')}</Text>
      <TextField
        label={t('auth.reset.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={t('auth.reset.submit')} onPress={onSubmit} loading={loading} />
      <Link href="/(auth)/login" style={styles.link}>{t('auth.reset.backToLogin')}</Link>
    </View>
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
  body: {
    fontFamily: typography.fontFamily,
    fontSize: typography.body,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: typography.small,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  link: {
    color: colors.primary,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
