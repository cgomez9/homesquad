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
  Pressable,
  StatusBar,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TidePoolBackground } from '../../src/components/TidePool';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { PasswordField } from '../../src/components/PasswordField';
import { SocialAuthRow } from '../../src/components/SocialAuthRow';
import { isAcceptable } from '../../src/components/PasswordStrengthMeter';
import { signUp } from '../../src/lib/auth';
import { AVATARS, AvatarId } from '../../src/constants/avatars';
import { radii, spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight ?? 24) + 12;

// Pink unicorn / yellow lion / blue dog — middle bubble bigger, matches Welcome's CREW pattern
const CREW: AvatarId[] = [5, 6, 2];

export default function SignupScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

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

  function onBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
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
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={styles.backBtn}
              hitSlop={8}
            >
              <Text style={styles.backChevron}>‹</Text>
            </Pressable>
            <Text style={styles.wordmark}>
              {t('app.brandName')}<Text style={styles.wordmarkDot}>·</Text>
            </Text>
            <View style={styles.backBtnSpacer} />
          </View>

          <Animated.View
            style={[
              styles.hero,
              {
                opacity: enter,
                transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              },
            ]}
          >
            <View style={styles.heroGlow} />
            <View style={styles.crew}>
              {CREW.map((id, i) => (
                <Bubble key={id} id={id} index={i} enter={enter} />
              ))}
            </View>
          </Animated.View>

          <Animated.View
            style={{
              opacity: enter,
              transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}
          >
            <Text style={styles.title}>{t('auth.signup.title')}</Text>
            <Text style={styles.sub}>{t('auth.signup.subtitle')}</Text>
          </Animated.View>

          <View style={styles.card}>
            <TextField
              label={t('auth.signup.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
            />
            <PasswordField
              label={t('auth.signup.password')}
              value={password}
              onChangeText={setPassword}
              showStrength
            />
            <PasswordField
              label={t('auth.signup.confirmPassword')}
              value={confirm}
              onChangeText={setConfirm}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t('auth.signup.submit')}
            onPress={onSubmit}
            loading={loading}
            disabled={!canSubmit}
            style={styles.cta}
          />

          <SocialAuthRow />

          <View style={styles.footRow}>
            <Link href="/(auth)/login" style={styles.footLink}>
              {t('auth.signup.hasAccount')}
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ id, index, enter }: { id: AvatarId; index: number; enter: Animated.Value }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bob = useRef(new Animated.Value(0)).current;
  const a = AVATARS[id];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1800,
          delay: index * 220,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, index]);

  const big = index === 1;
  const size = big ? 84 : 64;

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          {
            translateY: Animated.add(
              enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
              bob.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }),
            ),
          },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
        marginHorizontal: -6,
      }}
    >
      <View
        style={[
          styles.crewBubble,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: a.bg },
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>{a.emoji}</Text>
      </View>
    </Animated.View>
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

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F766E',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  backBtnSpacer: { width: 40, height: 40 },
  backChevron: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 22,
    color: colors.primaryDark,
    marginTop: -2,
  },
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
    paddingVertical: spacing.sm,
  },
  heroGlow: {
    position: 'absolute',
    width: 200,
    height: 90,
    borderRadius: 100,
    backgroundColor: 'rgba(52,211,153,0.18)',
  },
  crew: { flexDirection: 'row', alignItems: 'center' },
  crewBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: '#0F766E',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

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
