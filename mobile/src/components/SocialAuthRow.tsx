import { Platform, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { signInWithApple, signInWithGoogle } from '../lib/auth';
import { colors, radii, spacing, typography } from '../theme';

export function SocialAuthRow() {
  const { t } = useTranslation();
  const googleConfigured =
    !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
    !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  async function onApplePress() {
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('canceled')) return;
      Alert.alert(t('auth.errors.signInFailed'), msg || t('auth.errors.tryAgain'));
    }
  }

  async function onGooglePress() {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const msg = e?.message ?? '';
      const code = e?.code ?? '';
      if (code === 'SIGN_IN_CANCELLED' || msg.includes('cancelled')) return;
      if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        Alert.alert(t('auth.errors.signInFailed'), t('auth.errors.googlePlayMissing'));
        return;
      }
      Alert.alert(t('auth.errors.signInFailed'), msg || t('auth.errors.tryAgain'));
    }
  }

  const hasAnySocial = Platform.OS === 'ios' || googleConfigured;

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.lg}
          style={styles.appleBtn}
          onPress={onApplePress}
        />
      )}
      {googleConfigured && (
        <Pressable onPress={onGooglePress} style={styles.googleBtn}>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleText}>{t('auth.social.google')}</Text>
        </Pressable>
      )}
      {hasAnySocial && (
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>{t('auth.social.or')}</Text>
          <View style={styles.line} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: spacing.md, marginBottom: spacing.md },
  appleBtn: { height: 48 },
  googleBtn: {
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  googleG: { fontSize: 18, fontFamily: typography.fontFamilyBold, color: '#4285F4' },
  googleText: { fontSize: typography.body, color: colors.text, fontFamily: typography.fontFamilySemi },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.textMuted, fontFamily: typography.fontFamily, fontSize: typography.small },
});
