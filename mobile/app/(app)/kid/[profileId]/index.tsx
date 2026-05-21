// mobile/app/(app)/kid/[profileId]/index.tsx
import { useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../src/lib/supabase';
import { fireSmallFeedback, fireBigFeedback } from '../../../../src/lib/feedback';
import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';
import { useCelebrationCatchup } from '../../../../src/hooks/useCelebrationCatchup';
import { GoalCard } from '../../../../src/components/GoalCard';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { AVATARS, AvatarId } from '../../../../src/constants/avatars';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

type Instance = {
  id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  due_at: string;
  rejection_reason: string | null;
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

type ProfileMeta = { family_id: string; display_name: string; avatar_id: number };

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;
const WEEKDAY_KEYS = [
  'common.days.sun', 'common.days.mon', 'common.days.tue', 'common.days.wed',
  'common.days.thu', 'common.days.fri', 'common.days.sat',
];

export default function KidHome() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const qc = useQueryClient();

  const { data: meta } = useQuery({
    queryKey: ['kid-profile-meta', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<ProfileMeta | null> => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id,display_name,avatar_id')
        .eq('id', profileId)
        .maybeSingle();
      return (profile as ProfileMeta | null) ?? null;
    },
  });
  const familyId = meta?.family_id ?? null;

  const activeGoal = useActiveGoal(familyId ?? undefined);
  useCelebrationCatchup(profileId, familyId ?? undefined);

  const { data: instances, isLoading, error } = useQuery({
    queryKey: ['kid-today', profileId],
    queryFn: async (): Promise<Instance[]> => {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, rejection_reason, chore:chores(id,title,star_value,verification_mode)')
        .or(`assignee_profile_id.eq.${profileId},assignee_profile_id.is.null`)
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .in('status', ['pending', 'submitted', 'rejected'])
        .order('due_at');
      if (error) throw error;
      return (data ?? []) as unknown as Instance[];
    },
    enabled: !!profileId,
  });

  const { data: balance } = useQuery({
    queryKey: ['balance', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('star_ledger')
        .select('delta')
        .eq('profile_id', profileId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r as { delta: number }).delta, 0);
    },
    enabled: !!profileId,
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('current_streak', { p: profileId });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!profileId,
  });

  const complete = useMutation({
    mutationFn: async (vars: { instanceId: string }) => {
      const { error } = await supabase.rpc('complete_chore', {
        instance_id: vars.instanceId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kid-today', profileId] }),
  });

  function onDone(inst: Instance) {
    if (!inst.chore) return;
    fireSmallFeedback();
    if (inst.chore.verification_mode === 'photo') {
      router.push(`/(app)/kid/${profileId}/chore/${inst.id}/photo` as never);
      return;
    }
    complete.mutate({ instanceId: inst.id });
  }

  useEffect(() => {
    if (!profileId) return;
    const choreChannel = supabase
      .channel(`kid-feedback-chore-${profileId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chore_instances',
        filter: `completed_by=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'approved' && oldStatus !== 'approved') fireBigFeedback();
      })
      .subscribe();
    const redChannel = supabase
      .channel(`kid-feedback-red-${profileId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'redemptions',
        filter: `kid_profile_id=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'fulfilled' && oldStatus !== 'fulfilled') fireBigFeedback();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(choreChannel);
      supabase.removeChannel(redChannel);
    };
  }, [profileId]);

  const avatar = AVATARS[(meta?.avatar_id ?? 1) as AvatarId] ?? AVATARS[1];
  const list = instances ?? [];
  const todoCount = list.filter((i) => i.status === 'pending').length;

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        {/* top bar — stays fixed above the scrolling list */}
        <View style={styles.topbar}>
          <View style={styles.who}>
            <View style={[styles.whoAv, { backgroundColor: avatar.bg }]}>
              <Text style={styles.whoEmoji}>{avatar.emoji}</Text>
            </View>
            <View>
              <Text style={styles.hi}>
                {meta?.display_name
                  ? t('kid.greeting', { name: meta.display_name })
                  : t('kid.greetingNoName')}
              </Text>
              <Text style={styles.hiDate}>{t(WEEKDAY_KEYS[new Date().getDay()])}</Text>
            </View>
          </View>
          <View style={styles.nav}>
            <NavBtn icon="🏅" label={t('kid.nav.badges')}
              onPress={() => router.push(`/(app)/kid/${profileId}/badges` as never)} />
            <NavBtn icon="🎁" label={t('kid.nav.rewards')}
              onPress={() => router.push(`/(app)/kid/${profileId}/rewards` as never)} />
            <NavBtn icon="🏆" label={t('kid.nav.leaderboard')}
              onPress={() => router.push(`/(app)/kid/${profileId}/leaderboard` as never)} />
            <NavBtn icon="↩" label={t('kid.nav.switch')}
              onPress={() => router.replace('/(app)')} />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.hero}>
            <View style={[styles.heroCard, styles.heroGold]}>
              <Text style={styles.heroBig}>{balance ?? 0}</Text>
              <Text style={styles.heroLbl}>{t('kid.stars')}</Text>
            </View>
            {(streak ?? 0) > 0 && (
              <View style={[styles.heroCard, styles.heroFire]}>
                <Text style={styles.heroBig}>{streak}</Text>
                <Text style={styles.heroLbl}>{t('kid.dayStreak')}</Text>
              </View>
            )}
          </View>

          {activeGoal.data && (
            <View style={styles.goalWrap}>
              <GoalCard goal={activeGoal.data} />
            </View>
          )}

          <View style={styles.sectionRow}>
            <Text style={styles.section}>{t('kid.today')}</Text>
            {todoCount > 0 && <Text style={styles.sectionCount}>{t('kid.toGo', { count: todoCount })}</Text>}
          </View>

          {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />}
          {error && <Text style={styles.err}>{(error as Error).message}</Text>}
          {instances && instances.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌊</Text>
              <Text style={styles.emptyTitle}>{t('kid.allDone')}</Text>
              <Text style={styles.emptySub}>{t('kid.goPlay')}</Text>
            </View>
          )}

          {list.map((inst, i) => (
            <ChoreCard key={inst.id} inst={inst} index={i} onDone={() => onDone(inst)} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/* ---------- nav button ---------- */

function NavBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.navBtn}
      >
        <Text style={styles.navIcon}>{icon}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- chore card ---------- */

function ChoreCard({
  inst,
  index,
  onDone,
}: {
  inst: Instance;
  index: number;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const enter = useRef(new Animated.Value(0)).current;
  const { scale, onPressIn, onPressOut } = usePressScale();

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: 80 + index * 65,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const submitted = inst.status === 'submitted';
  const rejected = inst.status === 'rejected';
  const stars = inst.chore?.star_value ?? 0;
  const isPhoto = inst.chore?.verification_mode === 'photo';

  const animStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
    ],
  };

  if (submitted) {
    return (
      <Animated.View style={[styles.card, styles.cardWait, animStyle]}>
        <View style={styles.waitBadge}>
          <Text style={styles.waitBadgeText}>⏳</Text>
        </View>
        <View style={styles.cardMain}>
          <Text style={[styles.choreTitle, styles.choreTitleWait]}>{inst.chore?.title}</Text>
          <Text style={styles.waitText}>{t('kid.waiting')}</Text>
        </View>
        <Text style={styles.starMuted}>⭐ {stars}</Text>
      </Animated.View>
    );
  }

  if (rejected) {
    return (
      <Animated.View style={[styles.card, styles.cardRej, animStyle]}>
        <View style={styles.cardMain}>
          <Text style={[styles.choreTitle, styles.choreTitleRej]}>{inst.chore?.title}</Text>
          <Text style={styles.rejText}>
            {inst.rejection_reason
              ? t('kid.rejectedReason', { reason: inst.rejection_reason })
              : t('kid.notApproved')}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={onDone}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('kid.tryAgainA11y', { title: inst.chore?.title ?? t('kid.choreFallback') })}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>{t('kid.tryAgain')}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, animStyle]}>
      <View style={styles.cardMain}>
        <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.star}>⭐ {stars}</Text>
          {isPhoto && (
            <View style={styles.photoTag}>
              <Text style={styles.photoTagText}>{t('kid.photo')}</Text>
            </View>
          )}
        </View>
      </View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={onDone}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={t('kid.markDoneA11y', { title: inst.chore?.title ?? t('kid.choreFallback') })}
          style={styles.doneBtn}
        >
          <Text style={styles.doneIcon}>✓</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* ---------- shared press-scale ---------- */

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  function onPressIn() {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }
  return { scale, onPressIn, onPressOut };
}

/* ---------- styles ---------- */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingTop: TOP_INSET },

  // top bar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 1 },
  whoAv: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SHADOW,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  whoEmoji: { fontSize: 26 },
  hi: { fontFamily: typography.fontFamilyBold, fontSize: 19, color: colors.text },
  hiDate: { fontFamily: typography.fontFamilySemi, fontSize: typography.small - 1, color: colors.textMuted },
  nav: { flexDirection: 'row', gap: spacing.sm },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  navIcon: { fontSize: 17, color: colors.text },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 140 },

  // hero stats
  hero: { flexDirection: 'row', gap: spacing.md },
  heroCard: {
    flex: 1,
    borderRadius: 22,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 2,
    shadowColor: SHADOW,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  // heroGold/heroFire backgrounds never flip in dark mode — text colors below are pinned to match.
  heroGold: { backgroundColor: '#FFF1C9' },
  heroFire: { backgroundColor: '#FFE0D0' },
  heroBig: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: '#134E4A' },
  heroLbl: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#5C7A78' },

  goalWrap: { marginTop: spacing.lg },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxl - spacing.xs,
    marginBottom: spacing.md,
  },
  section: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small,
    color: colors.primaryDark,
  },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },

  empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg, gap: spacing.xs },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
  emptySub: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },

  // chore card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: spacing.lg,
    paddingLeft: spacing.lg + 2,
    paddingRight: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    shadowColor: SHADOW,
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  cardMain: { flex: 1 },
  choreTitle: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs + 1 },
  star: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark },
  photoTag: {
    backgroundColor: 'rgba(15,118,110,0.07)',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  photoTagText: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
  doneBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  doneIcon: { color: '#fff', fontSize: 24, fontFamily: typography.fontFamilyBold },

  // waiting variant
  cardWait: { backgroundColor: 'rgba(52,211,153,0.12)', shadowOpacity: 0, elevation: 0 },
  waitBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52,211,153,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitBadgeText: { fontSize: 20 },
  choreTitleWait: { color: colors.primaryDark },
  waitText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark, marginTop: 3 },
  starMuted: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark },

  // rejected variant
  cardRej: {
    backgroundColor: '#FFF1F0',
    borderWidth: 1,
    borderColor: 'rgba(225,29,72,0.18)',
    shadowOpacity: 0,
    elevation: 0,
  },
  choreTitleRej: { color: colors.error },
  rejText: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.error,
    fontStyle: 'italic',
    marginTop: 3,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.34,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  retryText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: '#fff' },
});

