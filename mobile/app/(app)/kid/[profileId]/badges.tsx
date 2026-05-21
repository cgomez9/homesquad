// mobile/app/(app)/kid/[profileId]/badges.tsx
import { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../src/lib/supabase';
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, type AchievementKey } from '../../../../src/constants/achievements';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

type Unlocked = { achievement_key: string; unlocked_at: string };

const SHADOW = '#0F766E';
const GOLD = '#FCE3A1';
const GOLD_RING = 'rgba(251,191,36,0.28)';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function KidBadges() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [unlockedQ, balanceQ] = useQueries({
    queries: [
      {
        queryKey: ['kid-badges', profileId],
        queryFn: async (): Promise<Unlocked[]> => {
          const { data, error } = await supabase
            .from('achievements')
            .select('achievement_key, unlocked_at')
            .eq('profile_id', profileId);
          if (error) throw error;
          return (data ?? []) as Unlocked[];
        },
        enabled: !!profileId,
      },
      {
        queryKey: ['balance', profileId],
        queryFn: async (): Promise<number> => {
          const { data, error } = await supabase
            .from('star_ledger')
            .select('delta')
            .eq('profile_id', profileId);
          if (error) throw error;
          return (data ?? []).reduce((s, r) => s + (r as { delta: number }).delta, 0);
        },
        enabled: !!profileId,
      },
    ],
  });

  const balance = balanceQ.data ?? 0;
  const unlockedByKey = new Map<string, string>();
  (unlockedQ.data ?? []).forEach((u) => unlockedByKey.set(u.achievement_key, u.unlocked_at));

  const total = ACHIEVEMENT_KEYS.length;
  const collected = ACHIEVEMENT_KEYS.filter((k) => unlockedByKey.has(k)).length;
  const pct = Math.round((collected / total) * 100);

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.tl}>
            <BackButton onPress={() => router.back()} />
            <View>
              <Text style={styles.h1}>{t('badges.title')}</Text>
              <Text style={styles.hsub}>{t('badges.collection')}</Text>
            </View>
          </View>
          <View style={styles.starChip}>
            <Text style={styles.starChipText}>⭐ {balance}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.prog}>
            <View style={styles.progTop}>
              <Text style={styles.progBig}>
                {t('badges.collected', { collected, total })}
              </Text>
              <Text style={styles.progPct}>{pct}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>

          {unlockedQ.isLoading && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )}
          {unlockedQ.error && (
            <Text style={styles.err}>{(unlockedQ.error as Error).message}</Text>
          )}

          <View style={styles.grid}>
            {ACHIEVEMENT_KEYS.map((key: AchievementKey, i) => (
              <BadgeCard
                key={key}
                achievement={{
                  emoji: ACHIEVEMENTS[key].emoji,
                  title: t(`achievements.${key}.title`),
                  description: t(`achievements.${key}.desc`),
                }}
                unlockedAt={unlockedByKey.get(key)}
                index={i}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/* ---------- back button ---------- */

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- badge card ---------- */

function BadgeCard({
  achievement,
  unlockedAt,
  index,
}: {
  achievement: { emoji: string; title: string; description: string };
  unlockedAt: string | undefined;
  index: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const enter = useRef(new Animated.Value(0)).current;
  const unlocked = !!unlockedAt;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 60 + index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const animStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };

  return (
    <Animated.View style={[styles.card, !unlocked && styles.cardLocked, animStyle]}>
      {unlocked && (
        <View style={styles.ribbon}>
          <Text style={styles.ribbonText}>{t('badges.earned')}</Text>
        </View>
      )}
      <View style={[styles.med, !unlocked && styles.medLocked]}>
        <Text style={[styles.emoji, !unlocked && styles.emojiLocked]}>{achievement.emoji}</Text>
      </View>
      <Text style={[styles.cardTitle, !unlocked && styles.cardTitleLocked]}>
        {achievement.title}
      </Text>
      {unlocked ? (
        <Text style={styles.cardDate}>{new Date(unlockedAt!).toLocaleDateString()}</Text>
      ) : (
        <Text style={styles.cardDesc}>{achievement.description}</Text>
      )}
    </Animated.View>
  );
}

/* ---------- styles ---------- */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingTop: TOP_INSET },

  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  tl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  backIcon: { fontSize: 19, color: colors.text, fontFamily: typography.fontFamilyBold },
  h1: { fontFamily: typography.fontFamilyBold, fontSize: 24, color: colors.text },
  hsub: { fontFamily: typography.fontFamilySemi, fontSize: typography.small - 1, color: colors.textMuted },
  starChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg - 2,
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  starChipText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 120 },

  prog: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.lg,
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  progTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm + 1,
  },
  progBig: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
  progBigNum: { color: colors.primaryDark },
  progPct: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
  track: { height: 9, backgroundColor: colors.border, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 9, backgroundColor: colors.primary, borderRadius: radii.pill },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: spacing.lg + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm - 1,
    marginBottom: spacing.md + 1,
    shadowColor: SHADOW,
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  cardLocked: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C4DAD6',
    shadowOpacity: 0,
    elevation: 0,
  },
  ribbon: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.success,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  ribbonText: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 10,
    color: '#06382E',
    letterSpacing: 0.5,
  },
  med: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D9A01E',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    borderWidth: 4,
    borderColor: GOLD_RING,
  },
  medLocked: {
    backgroundColor: '#EDF3F1',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C4DAD6',
    shadowOpacity: 0,
    elevation: 0,
  },
  emoji: { fontSize: 36 },
  emojiLocked: { opacity: 0.4 },
  cardTitle: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small + 1,
    color: colors.text,
    textAlign: 'center',
  },
  cardTitleLocked: { color: '#7E938F' },
  cardDate: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
  cardDesc: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.tiny,
    color: '#8A9C98',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 15,
  },
});

