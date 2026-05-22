import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TidePoolBackground } from '../../src/components/TidePool';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { PasswordField } from '../../src/components/PasswordField';
import { SocialAuthRow } from '../../src/components/SocialAuthRow';
import { signIn } from '../../src/lib/auth';
import { AVATARS } from '../../src/constants/avatars';
import { radii, spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight ?? 24) + 12;

// Warm yellow lion — friendly returning-user hero
const HERO_AVATAR = AVATARS[6];

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enter = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, bob]);

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
    <View style={styles.screen}>
      <TidePoolBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Text style={styles.wordmark}>
              {t('app.brandName')}<Text style={styles.wordmarkDot}>·</Text>
            </Text>
          </View>

          <Animated.View
            style={[
              styles.hero,
              {
                opacity: enter,
                transform: [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                ],
              },
            ]}
          >
            <View style={styles.heroGlow} />
            <Animated.View
              style={{
                transform: [
                  { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) },
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                ],
              }}
            >
              <View style={[styles.bubble, { backgroundColor: HERO_AVATAR.bg }]}>
                <Text style={styles.bubbleEmoji}>{HERO_AVATAR.emoji}</Text>
              </View>
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={{
              opacity: enter,
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}
          >
            <Text style={styles.title}>{t('auth.login.title')}</Text>
            <Text style={styles.sub}>{t('auth.login.subtitle')}</Text>
          </Animated.View>

          <View style={styles.card}>
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
            <View style={styles.forgotRow}>
              <Link href="/(auth)/reset" style={styles.forgotLink}>
                {t('auth.login.forgotPassword')}
              </Link>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t('auth.login.submit')}
            onPress={onSubmit}
            loading={loading}
            style={styles.cta}
          />

          <SocialAuthRow />

          <View style={styles.footRow}>
            <Link href="/(auth)/signup" style={styles.footLink}>
              {t('auth.login.noAccount')}
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  kav: { flex: 1 },
  scroll: {
    paddingTop: TOP_INSET,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },

  topBar: { alignItems: 'flex-start' },
  wordmark: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 18,
    color: colors.primaryDark,
    letterSpacing: 0.2,
  },
  wordmarkDot: { color: colors.accent },

  hero: {
    marginTop: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(52,211,153,0.18)',
  },
  bubble: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F766E',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bubbleEmoji: { fontSize: 56 },

  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 30,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
    letterSpacing: -0.4,
  },
  sub: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },

  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    shadowColor: '#0F766E',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  forgotRow: { alignItems: 'flex-end', marginTop: -spacing.md, marginBottom: spacing.sm },
  forgotLink: {
    color: colors.primary,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    paddingVertical: spacing.xs,
  },

  error: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: typography.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  cta: {
    marginTop: spacing.lg,
    height: 54,
    borderRadius: radii.pill,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },

  footRow: { alignItems: 'center', marginTop: spacing.md },
  footLink: {
    color: colors.primaryDark,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    paddingVertical: spacing.sm,
  },
});
