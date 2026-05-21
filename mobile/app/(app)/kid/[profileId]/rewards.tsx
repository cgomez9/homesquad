// mobile/app/(app)/kid/[profileId]/rewards.tsx
import { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

type Reward = {
  id: string;
  title: string;
  description: string | null;
  star_cost: number;
  icon_id: number;
};

type OpenRedemption = {
  reward_id: string;
  status: 'pending' | 'approved';
};

const SHADOW = '#0F766E';
const GOLD = '#FBDE96';
const GOLD_TEXT = '#7A5200';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function KidRewards() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [rewards, openRed, balanceQ] = useQueries({
    queries: [
      {
        queryKey: ['kid-rewards', profileId],
        queryFn: async (): Promise<Reward[]> => {
          const { data, error } = await supabase
            .from('rewards')
            .select('id, title, description, star_cost, icon_id')
            .eq('active', true)
            .order('created_at');
          if (error) throw error;
          return (data ?? []) as Reward[];
        },
        enabled: !!profileId,
      },
      {
        queryKey: ['kid-open-redemptions', profileId],
        queryFn: async (): Promise<OpenRedemption[]> => {
          const { data, error } = await supabase
            .from('redemptions')
            .select('reward_id, status')
            .eq('kid_profile_id', profileId)
            .in('status', ['pending', 'approved']);
          if (error) throw error;
          return (data ?? []) as OpenRedemption[];
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
          return (data ?? []).reduce((sum, r) => sum + (r as { delta: number }).delta, 0);
        },
        enabled: !!profileId,
      },
    ],
  });

  const balance = balanceQ.data ?? 0;
  const openByReward = new Map<string, OpenRedemption['status']>();
  (openRed.data ?? []).forEach((r) => openByReward.set(r.reward_id, r.status));

  const requestMut = useMutation({
    mutationFn: async (vars: { rewardId: string }) => {
      const { error } = await supabase.rpc('request_redemption', {
        reward_id: vars.rewardId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kid-rewards', profileId] });
      qc.invalidateQueries({ queryKey: ['kid-open-redemptions', profileId] });
    },
    onError: (e) => Alert.alert(t('kidRewards.couldNotRequest'), (e as Error).message),
  });

  function onRequest(r: Reward) {
    Alert.alert(
      t('kidRewards.confirmTitle', { count: r.star_cost, title: r.title }),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('kidRewards.spend'), onPress: () => requestMut.mutate({ rewardId: r.id }) },
      ],
    );
  }

  const list = rewards.data ?? [];

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.tl}>
            <BackButton onPress={() => router.back()} />
            <View>
              <Text style={styles.h1}>{t('kidRewards.title')}</Text>
              <Text style={styles.hsub}>{t('kidRewards.subtitle')}</Text>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* star wallet hero */}
          <View style={styles.wallet}>
            <View style={styles.walletGlow} />
            <View>
              <Text style={styles.walletLbl}>{t('kidRewards.yourStars')}</Text>
              <Text style={styles.walletBig}>{balance}</Text>
            </View>
            <Text style={styles.walletCoin}>⭐</Text>
          </View>

          {(rewards.isLoading || openRed.isLoading) && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )}
          {rewards.error && <Text style={styles.err}>{(rewards.error as Error).message}</Text>}
          {rewards.data && rewards.data.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🐚</Text>
              <Text style={styles.emptyText}>{t('kidRewards.empty')}</Text>
            </View>
          )}

          <View style={styles.grid}>
            {list.map((r, i) => (
              <RewardTile
                key={r.id}
                reward={r}
                index={i}
                balance={balance}
                openStatus={openByReward.get(r.id)}
                onRequest={() => onRequest(r)}
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
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- reward tile ---------- */

function RewardTile({
  reward,
  index,
  balance,
  openStatus,
  onRequest,
}: {
  reward: Reward;
  index: number;
  balance: number;
  openStatus: OpenRedemption['status'] | undefined;
  onRequest: () => void;
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
      delay: 60 + index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const emoji = REWARD_ICONS[reward.icon_id as RewardIconId]?.emoji ?? '🎁';
  const affordable = balance >= reward.star_cost;
  const pending = openStatus === 'pending';
  const approved = openStatus === 'approved';
  const locked = !pending && !approved && !affordable;

  const animStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
    ],
  };

  return (
    <Animated.View style={[styles.tile, locked && styles.tileLocked, animStyle]}>
      <View style={[styles.tag, locked && styles.tagLocked]}>
        <Text style={[styles.tagText, locked && styles.tagTextLocked]}>⭐ {reward.star_cost}</Text>
      </View>

      <View style={[styles.tileIco, locked && styles.tileIcoLocked]}>
        <Text style={[styles.tileEmoji, locked && styles.tileEmojiLocked]}>{emoji}</Text>
      </View>

      <Text
        style={[styles.tileTitle, locked && styles.tileTitleLocked]}
        numberOfLines={2}
      >
        {reward.title}
      </Text>

      {pending && (
        <View style={[styles.statPill, styles.statPending]}>
          <Text style={styles.statPendingText}>{t('kidRewards.requested')}</Text>
        </View>
      )}
      {approved && (
        <View style={[styles.statPill, styles.statApproved]}>
          <Text style={styles.statApprovedText}>{t('kidRewards.coming')}</Text>
        </View>
      )}
      {locked && (
        <Text style={styles.needText}>🔒 {t('kidRewards.needMore', { count: reward.star_cost - balance })}</Text>
      )}
      {!pending && !approved && !locked && (
        <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
          <Pressable
            onPress={onRequest}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('kidRewards.requestA11y', { title: reward.title, count: reward.star_cost })}
            style={styles.reqBtn}
          >
            <Text style={styles.reqText}>{t('kidRewards.request')}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ---------- shared press-scale ---------- */

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  function onPressIn() {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
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

  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
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

  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 120 },

  // star wallet hero
  wallet: {
    backgroundColor: GOLD,
    borderRadius: 24,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#D9A01E',
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  walletGlow: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  walletLbl: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small,
    color: '#9A6A00',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  walletBig: { fontFamily: typography.fontFamilyBold, fontSize: 38, color: GOLD_TEXT },
  walletCoin: { fontSize: 44 },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },
  empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg, gap: spacing.xs },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  tile: {
    width: '48%',
    minHeight: 178,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingTop: spacing.lg + 2,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: SHADOW,
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  tileLocked: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    shadowOpacity: 0,
    elevation: 0,
  },
  tag: {
    position: 'absolute',
    top: spacing.md,
    right: -4,
    backgroundColor: '#FFE3A0',
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderTopLeftRadius: radii.pill,
    borderBottomLeftRadius: radii.pill,
    borderTopRightRadius: radii.sm,
    borderBottomRightRadius: radii.sm,
    shadowColor: '#D9A01E',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tagLocked: { backgroundColor: '#E3EAE8', shadowOpacity: 0, elevation: 0 },
  tagText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: GOLD_TEXT },
  tagTextLocked: { color: '#7E938F' },

  tileIco: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EAF7F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  tileIcoLocked: { backgroundColor: '#EDF3F1', opacity: 0.7 },
  tileEmoji: { fontSize: 34 },
  tileEmojiLocked: { opacity: 0.45 },

  tileTitle: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.body,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
    minHeight: 42,
  },
  tileTitleLocked: { color: '#7E938F' },

  reqBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginTop: 'auto',
    shadowColor: colors.primary,
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  reqText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: '#fff' },

  statPill: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginTop: 'auto',
  },
  statPending: { backgroundColor: 'rgba(52,211,153,0.18)' },
  statPendingText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark },
  statApproved: { backgroundColor: colors.success },
  statApprovedText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#06382E' },

  needText: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small,
    color: '#9A8466',
    marginTop: 'auto',
    paddingVertical: spacing.md,
  },
});

