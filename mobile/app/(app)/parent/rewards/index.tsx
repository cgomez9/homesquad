import { useMemo, useRef } from 'react';
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
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

type Reward = {
  id: string;
  title: string;
  star_cost: number;
  icon_id: number;
  description: string | null;
};

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function RewardsList() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['parent-rewards'],
    queryFn: async (): Promise<Reward[]> => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, title, star_cost, icon_id, description')
        .eq('active', true)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Reward[];
    },
  });

  const archive = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase.rpc('archive_reward', { reward_id: rewardId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-rewards'] }),
  });

  function confirmArchive(r: Reward) {
    Alert.alert(t('parent.archiveRewardTitle'), r.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: () => archive.mutate(r.id) },
    ]);
  }

  const rewards = data ?? [];

  const header = (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>{t('parent.rewardsTitle')}</Text>
        <Fab onPress={() => router.push('/(app)/parent/rewards/new' as never)} />
      </View>
      {rewards.length > 0 && (
        <Text style={styles.section}>
          {t('parent.rewardsCount', { count: rewards.length })}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <FlatList
        data={rewards}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        renderItem={({ item }) => (
          <RewardRow
            reward={item}
            onPress={() => router.push(`/(app)/parent/rewards/${item.id}` as never)}
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
              <Text style={styles.emptyText}>{t('parent.rewardsEmpty')}</Text>
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
        accessibilityLabel={t('parent.newRewardA11y')}
        style={styles.fab}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- reward row ---------- */

function RewardRow({
  reward,
  onPress,
  onLongPress,
}: {
  reward: Reward;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const emoji = REWARD_ICONS[reward.icon_id as RewardIconId]?.emoji ?? '🎁';

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('parent.rowA11y', { title: reward.title })}
        style={styles.row}
      >
        <View style={styles.ico}>
          <Text style={styles.icoEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rewardTitle} numberOfLines={1}>{reward.title}</Text>
          {reward.description ? (
            <Text style={styles.desc} numberOfLines={1}>{reward.description}</Text>
          ) : null}
        </View>
        <View style={styles.cost}>
          <Text style={styles.costText}>⭐ {reward.star_cost}</Text>
        </View>
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

    section: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      color: colors.textMuted,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
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
    ico: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: '#EAF7F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    icoEmoji: { fontSize: 30 },
    rowMain: { flex: 1, minWidth: 0 },
    rewardTitle: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: colors.text },
    desc: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: 3 },
    cost: {
      backgroundColor: '#FFF1C9',
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    costText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#7A5200' },
  });
