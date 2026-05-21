// mobile/app/(app)/parent/goals/index.tsx
import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import i18n from '../../../../src/i18n';
import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../../src/components/GoalCard';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { supabase } from '../../../../src/lib/supabase';
import { useTheme, type Palette, spacing, radii, typography } from '../../../../src/theme';

type ArchivedGoal = {
  id: string;
  title: string;
  target_stars: number;
  status: 'completed' | 'canceled';
  completed_at: string | null;
  created_at: string;
};

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Resolve familyId from the logged-in parent profile
  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-goals'],
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

  const active = useActiveGoal(familyId ?? undefined);

  const archive = useQuery({
    queryKey: ['goals-archive', familyId],
    enabled: !!familyId,
    queryFn: async (): Promise<ArchivedGoal[]> => {
      const { data, error } = await (supabase as any)
        .from('family_goals')
        .select('id, title, target_stars, status, completed_at, created_at')
        .eq('family_id', familyId)
        .in('status', ['completed', 'canceled'])
        .order('completed_at', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cancelGoal = async () => {
    if (!active.data) return;
    Alert.alert(
      i18n.t('goals.cancelButton'),
      i18n.t('goals.cancelConfirm'),
      [
        { text: i18n.t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: i18n.t('goals.cancelButton'),
          style: 'destructive',
          onPress: async () => {
            await (supabase as any).rpc('cancel_family_goal', { p_goal_id: active.data!.id });
            active.refetch();
            archive.refetch();
          },
        },
      ],
    );
  };

  const header = (
    <View>
      <View style={styles.topbar}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>{i18n.t('goals.title')}</Text>
      </View>

      {active.data ? (
        <View style={styles.hero}>
          <View style={styles.goalElev}>
            <GoalCard goal={active.data} />
          </View>
          <CancelButton onPress={cancelGoal} />
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyText}>{i18n.t('goals.noActive')}</Text>
          <CreateButton onPress={() => router.push('/(app)/parent/goals/create')} />
        </View>
      )}

      <Text style={styles.archiveTitle}>{i18n.t('goals.archiveTitle')}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <FlatList
        data={archive.data ?? []}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        ListEmptyComponent={
          <Text style={styles.archiveEmpty}>{i18n.t('goals.archiveEmpty')}</Text>
        }
        renderItem={({ item }) => {
          const done = item.status === 'completed';
          return (
            <View style={styles.archiveRow}>
              <View style={styles.archiveMain}>
                <Text style={styles.archiveItemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.archiveItemMeta}>
                  {item.target_stars}⭐ target
                  {done && item.completed_at
                    ? ` · ${new Date(item.completed_at).toLocaleDateString()}`
                    : ''}
                </Text>
              </View>
              <View style={[styles.pill, done ? styles.pillDone : styles.pillCanceled]}>
                <Text style={done ? styles.pillDoneText : styles.pillCanceledText}>
                  {done ? '✓ Completed' : 'Canceled'}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

/* ---------- buttons ---------- */

function BackButton({ onPress }: { onPress: () => void }) {
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
        accessibilityLabel={i18n.t('common.back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

function CancelButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: spacing.md }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('goals.cancelButton')}
        style={styles.cancelBtn}
      >
        <Text style={styles.cancelText}>{i18n.t('goals.cancelButton')}</Text>
      </Pressable>
    </Animated.View>
  );
}

function CreateButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: 'stretch', marginTop: spacing.lg }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('goals.createButton')}
        style={styles.createBtn}
      >
        <Text style={styles.createText}>{i18n.t('goals.createButton')}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- shared press-scale ---------- */

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  function onPressIn() {
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
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
  scroll: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET, paddingBottom: spacing.xxl },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
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
  title: { fontFamily: typography.fontFamilyBold, fontSize: 26, color: colors.text },

  // The (untouched) GoalCard, given a clean elevated lift — no faux-glow blobs
  // (RN can't soft-blur, so a refined teal shadow reads better than a smudge).
  hero: { marginBottom: spacing.sm },
  goalElev: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    shadowColor: SHADOW,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 7,
  },

  empty: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: SHADOW,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  emptyEmoji: { fontSize: 52 },
  emptyText: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },

  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  createText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },

  cancelBtn: {
    borderWidth: 2,
    borderColor: '#FBD5DD',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: { color: colors.error, fontFamily: typography.fontFamilyBold, fontSize: typography.body },

  archiveTitle: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  archiveEmpty: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.lg,
  },
  archiveRow: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm + 2,
    shadowColor: SHADOW,
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  archiveMain: { flex: 1, minWidth: 0 },
  archiveItemTitle: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
  archiveItemMeta: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: 2 },
  pill: { paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  pillDone: { backgroundColor: 'rgba(52,211,153,0.18)' },
  pillDoneText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.primaryDark },
  pillCanceled: { backgroundColor: '#F3EEE9' },
  pillCanceledText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#9A8466' },
  });
