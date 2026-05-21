import { useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { formatRecurrence, Recurrence } from '../../../src/lib/recurrence';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { useActiveGoal } from '../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../src/components/GoalCard';
import { TidePoolBackground } from '../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../src/theme';

type Chore = {
  id: string;
  title: string;
  star_value: number;
  recurrence: Recurrence;
  assignee: { id: string; display_name: string; avatar_id: number } | null;
};

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function ChoresList() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-home'],
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

  const activeGoal = useActiveGoal(familyId ?? undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['parent-chores'],
    queryFn: async (): Promise<Chore[]> => {
      const { data, error } = await supabase
        .from('chores')
        .select('id, title, star_value, recurrence, assignee:profiles!chores_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('active', true)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Chore[];
    },
  });

  const archive = useMutation({
    mutationFn: async (choreId: string) => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: choreId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-chores'] }),
  });

  function confirmArchive(c: Chore) {
    Alert.alert(t('parent.archiveChoreTitle'), c.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: () => archive.mutate(c.id) },
    ]);
  }

  const chores = data ?? [];

  const header = (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>{t('parent.choresTitle')}</Text>
        <Fab onPress={() => router.push('/(app)/parent/chores/new' as never)} />
      </View>

      {activeGoal.data ? (
        <Pressable
          onPress={() => router.push('/(app)/parent/goals' as never)}
          style={styles.goalWrap}
        >
          <GoalCard goal={activeGoal.data} />
        </Pressable>
      ) : familyId && !activeGoal.isLoading ? (
        <Pressable
          onPress={() => router.push('/(app)/parent/goals/create' as never)}
          accessibilityRole="button"
          accessibilityLabel={t('parent.setGoalCta.title')}
          style={styles.goalCta}
        >
          <Text style={styles.goalCtaEmoji}>🎯</Text>
          <View style={styles.goalCtaText}>
            <Text style={styles.goalCtaTitle}>{t('parent.setGoalCta.title')}</Text>
            <Text style={styles.goalCtaBlurb}>{t('parent.setGoalCta.blurb')}</Text>
          </View>
          <Text style={styles.goalCtaChevron}>›</Text>
        </Pressable>
      ) : null}

      {chores.length > 0 && (
        <Text style={styles.section}>{t('parent.activeChores', { count: chores.length })}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <FlatList
        data={chores}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        renderItem={({ item }) => (
          <ChoreRow
            chore={item}
            onPress={() => router.push(`/(app)/parent/chores/${item.id}` as never)}
            onLongPress={() => confirmArchive(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : error ? (
            <Text style={styles.err}>{(error as Error).message}</Text>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌊</Text>
              <Text style={styles.emptyText}>{t('parent.choresEmpty')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

/* ---------- add (FAB) ---------- */

function Fab({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('parent.newChoreA11y')}
        style={styles.fab}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- chore row ---------- */

function ChoreRow({
  chore,
  onPress,
  onLongPress,
}: {
  chore: Chore;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const a = chore.assignee ? AVATARS[chore.assignee.avatar_id as AvatarId] : null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('parent.rowA11y', { title: chore.title })}
        style={styles.row}
      >
        <View style={styles.rowMain}>
          <Text style={styles.choreTitle} numberOfLines={1}>{chore.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.pillRec}>
              <Text style={styles.pillRecText}>{formatRecurrence(chore.recurrence, t)}</Text>
            </View>
            <View style={styles.pillStar}>
              <Text style={styles.pillStarText}>⭐ {chore.star_value}</Text>
            </View>
          </View>
        </View>

        {chore.assignee && a ? (
          <View style={styles.who}>
            <View style={[styles.whoAv, { backgroundColor: a.bg }]}>
              <Text style={styles.whoEmoji}>{a.emoji}</Text>
            </View>
            <Text style={styles.whoName} numberOfLines={1}>{chore.assignee.display_name}</Text>
          </View>
        ) : (
          <View style={styles.who}>
            <View style={[styles.whoAv, styles.whoAvAny]}>
              <Text style={styles.whoEmoji}>👥</Text>
            </View>
            <Text style={styles.whoAnyName}>{t('parent.anyone')}</Text>
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
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
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

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text, letterSpacing: -0.3 },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 30, fontFamily: typography.fontFamilyBold, lineHeight: 34 },

  goalWrap: { marginBottom: spacing.sm },
  goalCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  goalCtaEmoji: { fontSize: 26 },
  goalCtaText: { flex: 1, minWidth: 0 },
  goalCtaTitle: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.body,
    color: colors.text,
  },
  goalCtaBlurb: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  goalCtaChevron: {
    fontSize: 22,
    color: colors.textMuted,
    fontFamily: typography.fontFamilyBold,
  },
  section: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },
  empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg, gap: spacing.xs },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, textAlign: 'center' },

  row: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
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
  rowMain: { flex: 1, minWidth: 0 },
  choreTitle: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: colors.text },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pillRec: {
    backgroundColor: '#EAF7F4',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  pillRecText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.primaryDark },
  pillStar: {
    backgroundColor: '#FFF1C9',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  pillStarText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#7A5200' },

  who: { alignItems: 'center', gap: spacing.xs, width: 60 },
  whoAv: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  whoAvAny: { backgroundColor: '#EDF3F1' },
  whoEmoji: { fontSize: 22 },
  whoName: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.textMuted },
  whoAnyName: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#94A8A4' },
  });
