// mobile/app/(app)/parent/leaderboard.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import i18n from '../../../src/i18n';
import { supabase } from '../../../src/lib/supabase';
import { useLeaderboard, type LeaderboardRow } from '../../../src/hooks/useLeaderboard';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { TidePoolBackground } from '../../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography, radii } from '../../../src/theme';

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

const PED = {
  1: { top: '#FBC646', bottom: '#E6A52E' },
  2: { top: '#C9D2DA', bottom: '#9AA7B2' },
  3: { top: '#E0A878', bottom: '#C9854E' },
} as const;

export default function ParentLeaderboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [scope, setScope] = useState<'week' | 'allTime'>('week');

  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-leaderboard'],
    queryFn: async (): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('user_id', user.id)
        .eq('type', 'parent')
        .maybeSingle();
      return (profile as { family_id: string } | null)?.family_id ?? null;
    },
  });

  const { data, isLoading } = useLeaderboard(familyId ?? undefined);
  const rows = data ?? [];

  function onBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/parent/settings');
  }

  const sorted = [...rows].sort((a, b) =>
    scope === 'week' ? a.week_rank - b.week_rank : a.all_time_rank - b.all_time_rank,
  );
  const starsOf = (r: LeaderboardRow) => (scope === 'week' ? r.week_stars : r.all_time_stars);
  const rankOf = (r: LeaderboardRow) => (scope === 'week' ? r.week_rank : r.all_time_rank);
  const starsLabel = (n: number) =>
    i18n.t(scope === 'week' ? 'leaderboard.starsThisWeek' : 'leaderboard.starsAllTime', { count: n });

  const isSolo = sorted.length === 1;
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardRow[];

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <View style={styles.topbar}>
          <BackButton onPress={onBack} />
          <Text style={styles.h1}>{i18n.t('leaderboard.title')}</Text>
        </View>

        <View style={styles.toggle}>
          <Pressable
            onPress={() => setScope('week')}
            style={[styles.tg, scope === 'week' && styles.tgOn]}
          >
            <Text style={[styles.tgText, scope === 'week' && styles.tgTextOn]}>
              {i18n.t('leaderboard.tabThisWeek')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setScope('allTime')}
            style={[styles.tg, scope === 'allTime' && styles.tgOn]}
          >
            <Text style={[styles.tgText, scope === 'allTime' && styles.tgTextOn]}>
              {i18n.t('leaderboard.tabAllTime')}
            </Text>
          </Pressable>
        </View>

        {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />}

        {!isLoading && rows.length === 0 && (
          <View style={styles.center}>
            <Text style={styles.bigEmoji}>🐚</Text>
            <Text style={styles.muted}>{i18n.t('leaderboard.emptyState')}</Text>
          </View>
        )}

        {!isLoading && isSolo && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.solo}>{i18n.t('leaderboard.soloFallback')}</Text>
            <SoloCard row={sorted[0]} stars={starsLabel(starsOf(sorted[0]))} />
          </ScrollView>
        )}

        {!isLoading && rows.length > 1 && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.podium}>
              {podiumOrder.map((r) => (
                <PodiumCol
                  key={r.profile_id}
                  row={r}
                  place={rankOf(r) as 1 | 2 | 3}
                  stars={starsOf(r)}
                />
              ))}
            </View>

            {rest.length > 0 && (
              <View style={styles.rest}>
                {rest.map((r, i) => (
                  <RestRow
                    key={r.profile_id}
                    row={r}
                    rank={rankOf(r)}
                    stars={starsLabel(starsOf(r))}
                    index={i}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('common.back', 'Back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

function PodiumCol({ row, place, stars }: { row: LeaderboardRow; place: 1 | 2 | 3; stars: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 480,
      delay: 80 + (place === 1 ? 0 : place * 90),
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [enter, place]);

  const a = AVATARS[(row.avatar_id ?? 1) as AvatarId] ?? AVATARS[1];
  const pedH = place === 1 ? 108 : place === 2 ? 82 : 62;
  const avSize = place === 1 ? 78 : 62;

  return (
    <Animated.View
      style={[
        styles.col,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      {place === 1 && <Text style={styles.crown}>👑</Text>}
      <View style={[styles.av, { width: avSize, height: avSize, borderRadius: avSize / 2, backgroundColor: a.bg }]}>
        <Text style={{ fontSize: avSize * 0.5 }}>{a.emoji}</Text>
      </View>
      <Text style={styles.colName} numberOfLines={1}>{row.display_name}</Text>
      <Text style={styles.colStars}>⭐ {stars}</Text>
      <View style={[styles.ped, { height: pedH, backgroundColor: PED[place].bottom }]}>
        <View style={[styles.pedTop, { backgroundColor: PED[place].top }]} />
        <Text style={styles.pedNum}>{place}</Text>
      </View>
    </Animated.View>
  );
}

function RestRow({
  row,
  rank,
  stars,
  index,
}: {
  row: LeaderboardRow;
  rank: number;
  stars: string;
  index: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      delay: 360 + index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const a = AVATARS[(row.avatar_id ?? 1) as AvatarId] ?? AVATARS[1];
  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <Text style={styles.rank}>#{rank}</Text>
      <View style={[styles.rowAv, { backgroundColor: a.bg }]}>
        <Text style={styles.rowEmoji}>{a.emoji}</Text>
      </View>
      <Text style={styles.rowName} numberOfLines={1}>{row.display_name}</Text>
      <Text style={styles.rowStars}>{stars}</Text>
    </Animated.View>
  );
}

function SoloCard({ row, stars }: { row: LeaderboardRow; stars: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const a = AVATARS[(row.avatar_id ?? 1) as AvatarId] ?? AVATARS[1];
  return (
    <View style={styles.soloCard}>
      <View style={[styles.soloAv, { backgroundColor: a.bg }]}>
        <Text style={styles.soloEmoji}>{a.emoji}</Text>
      </View>
      <Text style={styles.soloName}>{row.display_name}</Text>
      <Text style={styles.soloStars}>{stars}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingTop: TOP_INSET, paddingHorizontal: spacing.xl },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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

  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: spacing.xs + 1,
    marginTop: spacing.xl,
    shadowColor: SHADOW,
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tg: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', borderRadius: radii.pill },
  tgOn: { backgroundColor: colors.primary },
  tgText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.textMuted },
  tgTextOn: { color: '#fff' },

  scroll: { paddingTop: spacing.xl, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingBottom: 80 },
  bigEmoji: { fontSize: 48 },
  muted: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, textAlign: 'center' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm + 2 },
  col: { width: 104, alignItems: 'center' },
  crown: { fontSize: 26, marginBottom: 2 },
  av: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: SHADOW,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  colName: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.text, marginTop: spacing.sm },
  colStars: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark, marginTop: 2 },
  ped: {
    width: '100%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    marginTop: spacing.sm + 2,
    alignItems: 'center',
    overflow: 'hidden',
  },
  pedTop: { height: 6, alignSelf: 'stretch' },
  pedNum: { fontFamily: typography.fontFamilyBold, fontSize: 24, color: '#fff', marginTop: spacing.sm },

  rest: { marginTop: spacing.xl, gap: spacing.sm + 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    gap: spacing.md,
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  rank: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.textMuted, width: 34 },
  rowAv: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 22 },
  rowName: { flex: 1, fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
  rowStars: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted },

  solo: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  soloCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: SHADOW,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  soloAv: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  soloEmoji: { fontSize: 50 },
  soloName: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
  soloStars: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.primaryDark },
  });
