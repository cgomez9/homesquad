import { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Modal,
  Image,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { REWARD_ICONS, type RewardIconId } from '../../../src/constants/rewardIcons';
import { RejectModal } from '../../../src/components/RejectModal';
import { TidePoolBackground } from '../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../src/theme';

type ChoreRow = {
  kind: 'chore';
  id: string;
  completed_at: string;
  photo_url: string | null;
  family_id: string;
  completed_by: string | null;
  kid: { display_name: string; avatar_id: number } | null;
  chore: { title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

type RedemptionPendingRow = {
  kind: 'redemption-pending';
  id: string;
  requested_at: string;
  star_cost_snapshot: number;
  kid_profile_id: string;
  kid: { display_name: string; avatar_id: number } | null;
  reward: { title: string; icon_id: number } | null;
};

type RedemptionFulfillRow = {
  kind: 'redemption-fulfill';
  id: string;
  resolved_at: string | null;
  star_cost_snapshot: number;
  kid_profile_id: string;
  kid: { display_name: string; avatar_id: number } | null;
  reward: { title: string; icon_id: number } | null;
};

type DecisionRow = ChoreRow | RedemptionPendingRow;

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function Approvals() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [rejectChoreTarget, setRejectChoreTarget] = useState<ChoreRow | null>(null);
  const [denyTarget, setDenyTarget] = useState<RedemptionPendingRow | null>(null);

  const [chores, redPending, redApproved] = useQueries({
    queries: [
      {
        queryKey: ['approvals-chores'],
        queryFn: async (): Promise<ChoreRow[]> => {
          const { data, error } = await supabase
            .from('chore_instances')
            .select('id,completed_at,photo_url,family_id,completed_by,kid:profiles!chore_instances_completed_by_fkey(display_name,avatar_id),chore:chores(title,star_value,verification_mode)')
            .eq('status', 'submitted')
            .order('completed_at', { ascending: true })
            .limit(100);
          if (error) throw error;
          return (data ?? []).map((d) => ({ ...(d as object), kind: 'chore' })) as unknown as ChoreRow[];
        },
      },
      {
        queryKey: ['approvals-redemptions-pending'],
        queryFn: async (): Promise<RedemptionPendingRow[]> => {
          const { data, error } = await supabase
            .from('redemptions')
            .select('id,requested_at,star_cost_snapshot,kid_profile_id,kid:profiles!redemptions_kid_profile_id_fkey(display_name,avatar_id),reward:rewards(title,icon_id)')
            .eq('status', 'pending')
            .order('requested_at', { ascending: true })
            .limit(100);
          if (error) throw error;
          return (data ?? []).map((d) => ({ ...(d as object), kind: 'redemption-pending' })) as unknown as RedemptionPendingRow[];
        },
      },
      {
        queryKey: ['approvals-redemptions-approved'],
        queryFn: async (): Promise<RedemptionFulfillRow[]> => {
          const { data, error } = await supabase
            .from('redemptions')
            .select('id,resolved_at,star_cost_snapshot,kid_profile_id,kid:profiles!redemptions_kid_profile_id_fkey(display_name,avatar_id),reward:rewards(title,icon_id)')
            .eq('status', 'approved')
            .order('resolved_at', { ascending: false })
            .limit(100);
          if (error) throw error;
          return (data ?? []).map((d) => ({ ...(d as object), kind: 'redemption-fulfill' })) as unknown as RedemptionFulfillRow[];
        },
      },
    ],
  });

  const isLoading = chores.isLoading || redPending.isLoading || redApproved.isLoading;
  const errorAny = (chores.error ?? redPending.error ?? redApproved.error) as Error | undefined;

  const decisions: DecisionRow[] = [
    ...(chores.data ?? []),
    ...(redPending.data ?? []),
  ].sort((a, b) => {
    const ta = a.kind === 'chore' ? a.completed_at : a.requested_at;
    const tb = b.kind === 'chore' ? b.completed_at : b.requested_at;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  const fulfill: RedemptionFulfillRow[] = redApproved.data ?? [];

  function invalidateAfterDecision(kidId?: string | null) {
    qc.invalidateQueries({ queryKey: ['approvals-chores'] });
    qc.invalidateQueries({ queryKey: ['approvals-redemptions-pending'] });
    qc.invalidateQueries({ queryKey: ['approvals-redemptions-approved'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
    if (kidId) {
      qc.invalidateQueries({ queryKey: ['kid-today', kidId] });
      qc.invalidateQueries({ queryKey: ['balance', kidId] });
      qc.invalidateQueries({ queryKey: ['streak', kidId] });
      qc.invalidateQueries({ queryKey: ['kid-rewards', kidId] });
    }
  }

  const approveChore = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase.rpc('approve_chore', { instance_id: instanceId });
      if (error) throw error;
    },
    onSuccess: (_d, instanceId) => {
      const row = chores.data?.find((r) => r.id === instanceId);
      invalidateAfterDecision(row?.completed_by);
    },
  });

  const rejectChore = useMutation({
    mutationFn: async (vars: { instanceId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_chore', { instance_id: vars.instanceId, reason: vars.reason });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const row = chores.data?.find((r) => r.id === vars.instanceId);
      invalidateAfterDecision(row?.completed_by);
    },
  });

  const approveRedemption = useMutation({
    mutationFn: async (redemptionId: string) => {
      const { error } = await supabase.rpc('approve_redemption', { redemption_id: redemptionId });
      if (error) throw error;
    },
    onSuccess: (_d, redemptionId) => {
      const row = redPending.data?.find((r) => r.id === redemptionId);
      invalidateAfterDecision(row?.kid_profile_id);
    },
  });

  const denyRedemption = useMutation({
    mutationFn: async (vars: { redemptionId: string; note: string }) => {
      const { error } = await supabase.rpc('deny_redemption', { redemption_id: vars.redemptionId, parent_note: vars.note });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const row = redPending.data?.find((r) => r.id === vars.redemptionId);
      invalidateAfterDecision(row?.kid_profile_id);
    },
  });

  const fulfillRedemption = useMutation({
    mutationFn: async (redemptionId: string) => {
      const { error } = await supabase.rpc('fulfill_redemption', { redemption_id: redemptionId });
      if (error) throw error;
    },
    onSuccess: (_d, redemptionId) => {
      const row = redApproved.data?.find((r) => r.id === redemptionId);
      invalidateAfterDecision(row?.kid_profile_id);
    },
  });

  async function openPhoto(row: ChoreRow) {
    if (!row.photo_url) return;
    const path = `family/${row.family_id}/chore-proofs/${row.id}.jpg`;
    const { data } = await supabase.storage.from('chore-proofs').createSignedUrl(path, 60);
    setPhotoUrl(data?.signedUrl ?? null);
  }

  const sections = [
    { title: t('approvals.sectionDecisions'), data: decisions as DecisionRow[] },
    { title: t('approvals.sectionFulfillment'), data: fulfill as unknown as DecisionRow[] },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.header}>
        <Text style={styles.title}>{t('approvals.title')}</Text>
        {!isLoading && !errorAny && decisions.length > 0 && (
          <Text style={styles.subtitle}>
            {t('approvals.waiting', { count: decisions.length })}
          </Text>
        )}
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />}
      {errorAny && <Text style={styles.err}>{errorAny.message}</Text>}
      {!isLoading && !errorAny && sections.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🌊</Text>
          <Text style={styles.emptyText}>{t('approvals.empty')}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'chore') {
            const a = item.kid ? AVATARS[item.kid.avatar_id as AvatarId] : null;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={[styles.av, { backgroundColor: a?.bg ?? '#EDF3F1' }]}>
                    <Text style={styles.avEmoji}>{a?.emoji ?? '👤'}</Text>
                  </View>
                  <View style={styles.who}>
                    <Text style={styles.kn}>{item.kid?.display_name}</Text>
                    <Text style={styles.it} numberOfLines={1}>{item.chore?.title}</Text>
                  </View>
                  <View style={styles.cost}>
                    <Text style={styles.costText}>⭐ {item.chore?.star_value}</Text>
                  </View>
                </View>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>{t('approvals.submitted', { time: timeAgo(item.completed_at, t) })}</Text>
                  {item.chore?.verification_mode === 'photo' && (
                    <Pressable onPress={() => openPhoto(item)} style={styles.photoChip}>
                      <Text style={styles.photoChipText}>{t('approvals.viewPhoto')}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.acts}>
                  <ActBtn label={t('approvals.approve')} variant="approve" onPress={() => approveChore.mutate(item.id)} />
                  <ActBtn label={t('approvals.reject')} variant="reject" onPress={() => setRejectChoreTarget(item)} />
                </View>
              </View>
            );
          }
          if (item.kind === 'redemption-pending') {
            const a = item.kid ? AVATARS[item.kid.avatar_id as AvatarId] : null;
            const icon = item.reward ? REWARD_ICONS[item.reward.icon_id as RewardIconId]?.emoji : '🎁';
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <View style={[styles.av, { backgroundColor: a?.bg ?? '#EDF3F1' }]}>
                    <Text style={styles.avEmoji}>{a?.emoji ?? '👤'}</Text>
                  </View>
                  <View style={styles.who}>
                    <Text style={styles.kn}>{t('approvals.wants', { name: item.kid?.display_name })}</Text>
                    <Text style={styles.it} numberOfLines={1}>{icon} {item.reward?.title}</Text>
                  </View>
                  <View style={styles.cost}>
                    <Text style={styles.costText}>⭐ {item.star_cost_snapshot}</Text>
                  </View>
                </View>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>{t('approvals.requested', { time: timeAgo(item.requested_at, t) })}</Text>
                </View>
                <View style={styles.acts}>
                  <ActBtn label={t('approvals.approve')} variant="approve" onPress={() => approveRedemption.mutate(item.id)} />
                  <ActBtn label={t('approvals.deny')} variant="reject" onPress={() => setDenyTarget(item)} />
                </View>
              </View>
            );
          }
          // redemption-fulfill (Pending fulfillment section)
          const fulfillItem = item as unknown as RedemptionFulfillRow;
          const a = fulfillItem.kid ? AVATARS[fulfillItem.kid.avatar_id as AvatarId] : null;
          const icon = fulfillItem.reward ? REWARD_ICONS[fulfillItem.reward.icon_id as RewardIconId]?.emoji : '🎁';
          return (
            <View style={styles.ffCard}>
              <View style={[styles.av, { backgroundColor: a?.bg ?? '#EDF3F1' }]}>
                <Text style={styles.avEmoji}>{a?.emoji ?? '👤'}</Text>
              </View>
              <View style={styles.who}>
                <Text style={styles.ffTitle} numberOfLines={1}>
                  {icon} {fulfillItem.reward?.title} · {fulfillItem.kid?.display_name}
                </Text>
                <Text style={styles.ffSub}>{t('approvals.approvedAgo', { time: timeAgo(fulfillItem.resolved_at ?? new Date().toISOString(), t) })}</Text>
              </View>
              <ActBtn label={t('approvals.markGiven')} variant="give" onPress={() => fulfillRedemption.mutate(fulfillItem.id)} />
            </View>
          );
        }}
      />

      <Modal visible={!!photoUrl} transparent animationType="fade" onRequestClose={() => setPhotoUrl(null)}>
        <Pressable style={styles.photoBg} onPress={() => setPhotoUrl(null)}>
          {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photoImg} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <RejectModal
        visible={!!rejectChoreTarget}
        onCancel={() => setRejectChoreTarget(null)}
        onConfirm={(reason) => {
          if (rejectChoreTarget) rejectChore.mutate({ instanceId: rejectChoreTarget.id, reason });
          setRejectChoreTarget(null);
        }}
      />

      <RejectModal
        visible={!!denyTarget}
        onCancel={() => setDenyTarget(null)}
        onConfirm={(note) => {
          if (denyTarget) denyRedemption.mutate({ redemptionId: denyTarget.id, note });
          setDenyTarget(null);
        }}
      />
    </View>
  );
}

/* ---------- action button ---------- */

function ActBtn({
  label,
  variant,
  onPress,
}: {
  label: string;
  variant: 'approve' | 'reject' | 'give';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[variant === 'give' ? undefined : styles.actFlex, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.btn,
          variant === 'approve' && styles.btnApprove,
          variant === 'reject' && styles.btnReject,
          variant === 'give' && styles.btnGive,
        ]}
      >
        <Text
          style={[
            styles.btnText,
            variant === 'approve' && styles.btnTextApprove,
            variant === 'reject' && styles.btnTextReject,
            variant === 'give' && styles.btnTextGive,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function timeAgo(ts: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('common.timeAgo.justNow');
  if (m < 60) return t('common.timeAgo.minAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.timeAgo.hrAgo', { count: h });
  return t('common.timeAgo.dayAgo', { count: Math.floor(h / 24) });
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET },
  title: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: 2 },

  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.xl, gap: spacing.xs },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },

  sectionHeader: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: SHADOW,
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  av: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avEmoji: { fontSize: 23 },
  who: { flex: 1, minWidth: 0 },
  kn: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
  it: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: colors.text, marginTop: 1 },
  cost: { backgroundColor: '#FFF1C9', paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  costText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#7A5200' },

  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  metaText: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted },
  photoChip: {
    backgroundColor: '#EAF7F4',
    paddingVertical: 5,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
  },
  photoChipText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.primaryDark },

  acts: { flexDirection: 'row', gap: spacing.md },
  actFlex: { flex: 1 },
  btn: { paddingVertical: spacing.md + 1, borderRadius: radii.pill, alignItems: 'center' },
  btnApprove: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnReject: { backgroundColor: colors.surface, borderWidth: 2, borderColor: '#FBD5DD' },
  btnGive: { backgroundColor: colors.success, paddingHorizontal: spacing.lg },
  btnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  btnTextApprove: { color: '#fff' },
  btnTextReject: { color: colors.error },
  btnTextGive: { color: '#06382E' },

  ffCard: {
    backgroundColor: 'rgba(52,211,153,0.13)',
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ffTitle: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.primaryDark },
  ffSub: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: '#5C9B8E', marginTop: 2 },

  photoBg: { flex: 1, backgroundColor: 'rgba(6,40,38,0.92)', justifyContent: 'center', alignItems: 'center' },
  photoImg: { width: '100%', height: '80%' },
  });
