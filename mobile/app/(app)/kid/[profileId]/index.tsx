// mobile/app/(app)/kid/[profileId]/index.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ChoreCard, type ChoreAction, type ChoreCardInstance } from '../../../../src/components/ChoreCard';
import { claimChore, releaseChore, startChore, finishChore } from '../../../../src/lib/chores';

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

  const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;

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
    queryKey: ['kid-today', profileId, familyId],
    queryFn: async (): Promise<ChoreCardInstance[]> => {
      if (!familyId) return [];
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, assignee_profile_id, rejection_reason, chore:chores(id,title,kind,star_value,token_value,current_skill_streak,verification_mode,recurrence), assignee:profiles!chore_instances_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('family_id', familyId)
        .in('status', ['pending', 'started', 'finished', 'rejected'])
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .order('due_at');
      if (error) throw error;
      const rows = (data ?? []) as unknown as ChoreCardInstance[];
      // Three-section sort: mine -> unassigned -> others'
      return rows.sort((a, b) => {
        const sa = a.assignee_profile_id === profileId ? 0 : a.assignee_profile_id === null ? 1 : 2;
        const sb = b.assignee_profile_id === profileId ? 0 : b.assignee_profile_id === null ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return a.due_at.localeCompare(b.due_at);
      });
    },
    enabled: !!profileId && !!familyId,
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

  const { data: tokenBalance } = useQuery({
    queryKey: ['token-balance', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('privilege_token_ledger')
        .select('delta')
        .eq('profile_id', profileId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r as { delta: number }).delta, 0);
    },
    enabled: !!profileId,
  });

  const choreAction = useMutation({
    mutationFn: async (action: ChoreAction) => {
      if (!profileId) throw new Error('no profile');
      switch (action.kind) {
        case 'claim':   return claimChore(action.instanceId, profileId);
        case 'release': return releaseChore(action.instanceId, profileId);
        case 'start':   return startChore(action.instanceId, profileId);
        case 'finish': {
          const inst = instances?.find((i) => i.id === action.instanceId);
          if (inst?.chore?.verification_mode === 'photo') {
            router.push(`/(app)/kid/${profileId}/chore/${action.instanceId}/photo` as never);
            return;
          }
          return finishChore(action.instanceId, profileId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kid-today', profileId, familyId] });
      qc.invalidateQueries({ queryKey: ['token-balance', profileId] });
      qc.invalidateQueries({ queryKey: ['balance', profileId] });
    },
  });

  function onAction(action: ChoreAction) {
    fireSmallFeedback();
    choreAction.mutate(action);
  }

  useEffect(() => {
    if (!profileId) return;
    const choreChannel = supabase
      .channel(`kid-feedback-chore-${profileId}-${channelKey}`)
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
      .channel(`kid-feedback-red-${profileId}-${channelKey}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'redemptions',
        filter: `kid_profile_id=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'fulfilled' && oldStatus !== 'fulfilled') fireBigFeedback();
      })
      .subscribe();
    const privRedChannel = supabase
      .channel(`kid-feedback-priv-${profileId}-${channelKey}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'privilege_redemptions',
        filter: `kid_profile_id=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'fulfilled' && oldStatus !== 'fulfilled') fireBigFeedback();
        qc.invalidateQueries({ queryKey: ['token-balance', profileId] });
      })
      .subscribe();
    const tokenChannel = supabase
      .channel(`kid-token-ledger-${profileId}-${channelKey}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'privilege_token_ledger',
        filter: `profile_id=eq.${profileId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['token-balance', profileId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(choreChannel);
      supabase.removeChannel(redChannel);
      supabase.removeChannel(privRedChannel);
      supabase.removeChannel(tokenChannel);
    };
  }, [profileId, qc, channelKey]);

  const avatar = AVATARS[(meta?.avatar_id ?? 1) as AvatarId] ?? AVATARS[1];
  const list = instances ?? [];
  const starList = list.filter((i) => (i.chore?.kind ?? 'chore') === 'chore');
  const skillList = list.filter((i) => i.chore?.kind === 'skill');
  const todoCount = starList.filter((i) => i.status === 'pending' || i.status === 'started').length;
  const skillTodoCount = skillList.filter((i) => i.status === 'pending' || i.status === 'started').length;

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
            <NavBtn icon="🎯" label={t('kid.nav.privileges')}
              badge={(tokenBalance ?? 0) > 0 ? tokenBalance : undefined}
              onPress={() => router.push(`/(app)/kid/${profileId}/privileges` as never)} />
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

          {starList.map((inst) => (
            <ChoreCard
              key={inst.id}
              inst={inst}
              viewerActorId={profileId ?? ''}
              onAction={onAction}
            />
          ))}

          {skillList.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>{t('kid.skills')}</Text>
                {skillTodoCount > 0 && <Text style={styles.sectionCount}>{t('kid.toGo', { count: skillTodoCount })}</Text>}
              </View>
              {skillList.map((inst) => (
                <ChoreCard
                  key={inst.id}
                  inst={inst}
                  viewerActorId={profileId ?? ''}
                  onAction={onAction}
                />
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/* ---------- nav button ---------- */

function NavBtn({ icon, label, badge, onPress }: { icon: string; label: string; badge?: number; onPress: () => void }) {
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
        accessibilityLabel={badge !== undefined ? `${label} (${badge})` : label}
        style={styles.navBtn}
      >
        <Text style={styles.navIcon}>{icon}</Text>
        {badge !== undefined && (
          <View style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
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
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#1F548F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  navBadgeText: { fontFamily: typography.fontFamilyBold, fontSize: 10, color: '#fff', lineHeight: 12 },

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
});
