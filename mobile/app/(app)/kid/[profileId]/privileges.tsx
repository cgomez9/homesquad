// mobile/app/(app)/kid/[profileId]/privileges.tsx
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

type Privilege = {
  id: string;
  title: string;
  description: string | null;
  token_cost: number;
  icon_id: number;
};

type OpenRedemption = {
  privilege_id: string;
  status: 'pending' | 'approved';
};

const SHADOW = '#0F766E';
const TOKEN_BG = '#DBE9FF';
const TOKEN_TEXT = '#1F548F';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function KidPrivileges() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [privileges, openRed, balanceQ] = useQueries({
    queries: [
      {
        queryKey: ['kid-privileges', profileId],
        queryFn: async (): Promise<Privilege[]> => {
          const { data, error } = await supabase
            .from('privileges')
            .select('id, title, description, token_cost, icon_id')
            .eq('active', true)
            .order('created_at');
          if (error) throw error;
          return (data ?? []) as Privilege[];
        },
        enabled: !!profileId,
      },
      {
        queryKey: ['kid-open-privilege-redemptions', profileId],
        queryFn: async (): Promise<OpenRedemption[]> => {
          const { data, error } = await supabase
            .from('privilege_redemptions')
            .select('privilege_id, status')
            .eq('kid_profile_id', profileId)
            .in('status', ['pending', 'approved']);
          if (error) throw error;
          return (data ?? []) as OpenRedemption[];
        },
        enabled: !!profileId,
      },
      {
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
      },
    ],
  });

  const balance = balanceQ.data ?? 0;
  const openByPriv = new Map<string, OpenRedemption['status']>();
  (openRed.data ?? []).forEach((r) => openByPriv.set(r.privilege_id, r.status));

  const requestMut = useMutation({
    mutationFn: async (vars: { privilegeId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('request_privilege_redemption', {
        privilege_id: vars.privilegeId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kid-privileges', profileId] });
      qc.invalidateQueries({ queryKey: ['kid-open-privilege-redemptions', profileId] });
    },
    onError: (e) => Alert.alert(t('kidPrivileges.couldNotRequest'), (e as Error).message),
  });

  function onRequest(p: Privilege) {
    Alert.alert(
      t('kidPrivileges.confirmTitle', { count: p.token_cost, title: p.title }),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('kidPrivileges.spend'), onPress: () => requestMut.mutate({ privilegeId: p.id }) },
      ],
    );
  }

  const list = privileges.data ?? [];

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <View style={styles.topbar}>
          <View style={styles.tl}>
            <BackButton onPress={() => router.back()} />
            <View>
              <Text style={styles.h1}>{t('kidPrivileges.title')}</Text>
              <Text style={styles.hsub}>{t('kidPrivileges.subtitle')}</Text>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.wallet}>
            <View style={styles.walletGlow} />
            <View>
              <Text style={styles.walletLbl}>{t('kidPrivileges.yourTokens')}</Text>
              <Text style={styles.walletBig}>{balance}</Text>
            </View>
            <Text style={styles.walletCoin}>🪙</Text>
          </View>

          {(privileges.isLoading || openRed.isLoading) && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          )}
          {privileges.error && <Text style={styles.err}>{(privileges.error as Error).message}</Text>}
          {privileges.data && privileges.data.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={styles.emptyText}>{t('kidPrivileges.empty')}</Text>
            </View>
          )}

          <View style={styles.grid}>
            {list.map((p, i) => (
              <PrivilegeTile
                key={p.id}
                privilege={p}
                index={i}
                balance={balance}
                openStatus={openByPriv.get(p.id)}
                onRequest={() => onRequest(p)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

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

function PrivilegeTile({
  privilege,
  index,
  balance,
  openStatus,
  onRequest,
}: {
  privilege: Privilege;
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

  const emoji = REWARD_ICONS[privilege.icon_id as RewardIconId]?.emoji ?? '🎁';
  const affordable = balance >= privilege.token_cost;
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
        <Text style={[styles.tagText, locked && styles.tagTextLocked]}>🪙 {privilege.token_cost}</Text>
      </View>

      <View style={[styles.tileIco, locked && styles.tileIcoLocked]}>
        <Text style={[styles.tileEmoji, locked && styles.tileEmojiLocked]}>{emoji}</Text>
      </View>

      <Text
        style={[styles.tileTitle, locked && styles.tileTitleLocked]}
        numberOfLines={2}
      >
        {privilege.title}
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
        <Text style={styles.needText}>🔒 {t('kidPrivileges.needMore', { count: privilege.token_cost - balance })}</Text>
      )}
      {!pending && !approved && !locked && (
        <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
          <Pressable
            onPress={onRequest}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('kidPrivileges.requestA11y', { title: privilege.title, count: privilege.token_cost })}
            style={styles.reqBtn}
          >
            <Text style={styles.reqText}>{t('kidRewards.request')}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingTop: TOP_INSET },

    topbar: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.xl, marginBottom: spacing.sm,
    },
    tl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    back: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: SHADOW, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    },
    backIcon: { fontSize: 19, color: colors.text, fontFamily: typography.fontFamilyBold },
    h1: { fontFamily: typography.fontFamilyBold, fontSize: 24, color: colors.text },
    hsub: { fontFamily: typography.fontFamilySemi, fontSize: typography.small - 1, color: colors.textMuted },

    scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 120 },

    wallet: {
      backgroundColor: TOKEN_BG, borderRadius: 24,
      paddingVertical: spacing.xl, paddingHorizontal: spacing.xl,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      overflow: 'hidden',
      shadowColor: '#1F548F', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6,
    },
    walletGlow: {
      position: 'absolute', right: -30, top: -30,
      width: 140, height: 140, borderRadius: 70,
      backgroundColor: 'rgba(255,255,255,0.45)',
    },
    walletLbl: {
      fontFamily: typography.fontFamilyBold, fontSize: typography.small,
      color: '#33588C', textTransform: 'uppercase', letterSpacing: 1,
    },
    walletBig: { fontFamily: typography.fontFamilyBold, fontSize: 38, color: TOKEN_TEXT },
    walletCoin: { fontSize: 44 },

    err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },
    empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg, gap: spacing.xs },
    emptyEmoji: { fontSize: 48 },
    emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.xl },
    tile: {
      width: '48%', minHeight: 178, backgroundColor: colors.surface, borderRadius: 22,
      paddingTop: spacing.lg + 2, paddingBottom: spacing.lg, paddingHorizontal: spacing.md,
      alignItems: 'center', marginBottom: spacing.lg,
      shadowColor: SHADOW, shadowOpacity: 0.11, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4,
    },
    tileLocked: { backgroundColor: 'rgba(255,255,255,0.6)', shadowOpacity: 0, elevation: 0 },
    tag: {
      position: 'absolute', top: spacing.md, right: -4,
      backgroundColor: '#C7DBF4',
      paddingVertical: 5, paddingHorizontal: spacing.md,
      borderTopLeftRadius: radii.pill, borderBottomLeftRadius: radii.pill,
      borderTopRightRadius: radii.sm, borderBottomRightRadius: radii.sm,
      shadowColor: '#1F548F', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    tagLocked: { backgroundColor: '#E3EAE8', shadowOpacity: 0, elevation: 0 },
    tagText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: TOKEN_TEXT },
    tagTextLocked: { color: '#7E938F' },

    tileIco: {
      width: 64, height: 64, borderRadius: 20, backgroundColor: '#EAF7F4',
      alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
    },
    tileIcoLocked: { backgroundColor: '#EDF3F1', opacity: 0.7 },
    tileEmoji: { fontSize: 34 },
    tileEmojiLocked: { opacity: 0.45 },

    tileTitle: {
      fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text,
      textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.md, minHeight: 42,
    },
    tileTitleLocked: { color: '#7E938F' },

    reqBtn: {
      width: '100%', backgroundColor: colors.primary,
      paddingVertical: spacing.md, borderRadius: radii.pill, alignItems: 'center', marginTop: 'auto',
      shadowColor: colors.primary, shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4,
    },
    reqText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: '#fff' },

    statPill: { width: '100%', paddingVertical: spacing.md, borderRadius: radii.pill, alignItems: 'center', marginTop: 'auto' },
    statPending: { backgroundColor: 'rgba(52,211,153,0.18)' },
    statPendingText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primaryDark },
    statApproved: { backgroundColor: colors.success },
    statApprovedText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#06382E' },

    needText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#9A8466', marginTop: 'auto', paddingVertical: spacing.md },
  });
