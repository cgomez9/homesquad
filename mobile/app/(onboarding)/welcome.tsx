import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TidePoolBackground } from '../../src/components/TidePool';
import { AVATARS } from '../../src/constants/avatars';
import { radii, spacing, typography, useTheme, type Palette } from '../../src/theme';

// A little family washes up on the shore.
const CREW = [3, 5, 7, 2] as const;

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();

  const enter = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <View style={styles.heroZone}>
          <View style={styles.heroGlow} />
          <View style={styles.crew}>
            {CREW.map((id, i) => (
              <Bubble key={id} id={id} index={i} enter={enter} />
            ))}
          </View>
        </View>

        <Animated.View
          style={{
            opacity: enter,
            transform: [
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            ],
          }}
        >
          <Text style={styles.title}>{t('auth.welcome.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcome.subtitle')}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.ctaWrap,
            { opacity: enter, transform: [{ scale: btnScale }] },
          ]}
        >
          <Pressable
            onPress={() => router.replace('/(onboarding)/create-family')}
            onPressIn={() =>
              Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
            }
            onPressOut={() =>
              Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()
            }
            accessibilityRole="button"
            accessibilityLabel={t('auth.welcome.getStarted')}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{t('auth.welcome.getStarted')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function Bubble({
  id,
  index,
  enter,
}: {
  id: number;
  index: number;
  enter: Animated.Value;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bob = useRef(new Animated.Value(0)).current;
  const a = AVATARS[id as keyof typeof AVATARS];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1800,
          delay: index * 240,
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
  const size = big ? 92 : 72;

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          {
            translateY: Animated.add(
              enter.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }),
              bob.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }),
            ),
          },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
        marginTop: big ? 0 : spacing.lg,
        marginHorizontal: -6,
      }}
    >
      <View
        style={[
          styles.bubble,
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
  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: 90, paddingBottom: 56, justifyContent: 'space-between' },

  heroZone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(52,211,153,0.16)',
  },
  crew: { flexDirection: 'row', alignItems: 'center' },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: '#0F766E',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },

  ctaWrap: { marginTop: spacing.xl },
  cta: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.36,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  ctaText: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: '#fff' },
});
