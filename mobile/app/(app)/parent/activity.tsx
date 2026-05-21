import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { REWARD_ICONS, type RewardIconId } from '../../../src/constants/rewardIcons';
import { TidePoolBackground } from '../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../src/theme';

type ChoreRow = {
  kind: 'chore';
  id: string;
  status: 'approved' | 'rejected';
  approved_at: string | null;
  completed_at: string | null;
  photo_url: string | null;
  family_id: string;
  rejection_reason: string | null;
  kid: { display_name: string; avatar_id: number } | null;
  chore: { title: string; verification_mode: 'auto'|'photo'|'approval' } | null;
};

type RedemptionRow = {
  kind: 'redemption';
  id: string;
  status: 'fulfilled' | 'denied';
  resolved_at: string | null;
  parent_note: string | null;
  kid: { display_name: string; avatar_id: number } | null;
  reward: { title: string; icon_id: number } | null;
};

type ActivityRow = (ChoreRow | RedemptionRow) & { eventAt: string };

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function Activity() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const [chores, redemptions] = useQueries({
    queries: [
      {
        queryKey: ['activity-chores'],
        queryFn: async (): Promise<ChoreRow[]> => {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from('chore_instances')
            .select('id,status,approved_at,completed_at,photo_url,family_id,rejection_reason,kid:profiles!chore_instances_completed_by_fkey(display_name,avatar_id),chore:chores(title,verification_mode)')
            .in('status', ['approved', 'rejected'])
            .gte('completed_at', since)
            .order('approved_at', { ascending: false, nullsFirst: false })
            .limit(50);
          if (error) throw error;
          return (data ?? []).map((d) => ({ ...(d as object), kind: 'chore' })) as unknown as ChoreRow[];
        },
      },
      {
        queryKey: ['activity-redemptions'],
        queryFn: async (): Promise<RedemptionRow[]> => {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from('redemptions')
            .select('id,status,resolved_at,parent_note,kid:profiles!redemptions_kid_profile_id_fkey(display_name,avatar_id),reward:rewards(title,icon_id)')
            .in('status', ['fulfilled', 'denied'])
            .gte('resolved_at', since)
            .order('resolved_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          return (data ?? []).map((d) => ({ ...(d as object), kind: 'redemption' })) as unknown as RedemptionRow[];
        },
      },
    ],
  });

  const merged: ActivityRow[] | undefined = useMemo(() => {
    if (!chores.data || !redemptions.data) return undefined;
    const all: ActivityRow[] = [
      ...chores.data.map((r) => ({ ...r, eventAt: r.approved_at ?? r.completed_at ?? '' })),
      ...redemptions.data.map((r) => ({ ...r, eventAt: r.resolved_at ?? '' })),
    ];
    return all
      .filter((r) => r.eventAt !== '')
      .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())
      .slice(0, 100);
  }, [chores.data, redemptions.data]);

  async function openPhoto(r: ChoreRow) {
    if (!r.photo_url) return;
    const path = `family/${r.family_id}/chore-proofs/${r.id}.jpg`;
    const { data } = await supabase.storage.from('chore-proofs').createSignedUrl(path, 60);
    setSignedUrl(data?.signedUrl ?? null);
  }

  const loading = chores.isLoading || redemptions.isLoading;

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <FlatList
        data={merged ?? []}
        keyExtractor={(r) => `${r.kind}-${r.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{t('activity.title')}</Text>
            <Text style={styles.subtitle}>{t('activity.last30')}</Text>
          </View>
        }
        renderItem={({ item }) => <EventRow item={item} onPhoto={openPhoto} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : chores.error || redemptions.error ? (
            <Text style={styles.err}>
              {((chores.error ?? redemptions.error) as Error).message}
            </Text>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🌊</Text>
              <Text style={styles.emptyText}>{t('activity.empty')}</Text>
            </View>
          )
        }
      />

      <Modal visible={!!signedUrl} transparent animationType="fade" onRequestClose={() => setSignedUrl(null)}>
        <Pressable style={styles.modalBg} onPress={() => setSignedUrl(null)}>
          {signedUrl && <Image source={{ uri: signedUrl }} style={styles.modalImg} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------- event row ---------- */

function EventRow({
  item,
  onPhoto,
}: {
  item: ActivityRow;
  onPhoto: (r: ChoreRow) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const a = item.kid ? AVATARS[item.kid.avatar_id as AvatarId] : null;
  const name = item.kid?.display_name ?? t('activity.someone');

  // badge variant + content per event type
  let badgeStyle = styles.badgeOk;
  let badgeIcon = '✓';
  let body: React.ReactNode = null;
  let extra: React.ReactNode = null;

  if (item.kind === 'chore') {
    if (item.status === 'rejected') {
      badgeStyle = styles.badgeNo;
      badgeIcon = '✗';
      body = (
        <Text style={styles.body}>
          <Text style={styles.bodyStrong}>{item.chore?.title}</Text> {t('activity.sentBack')}
        </Text>
      );
      if (item.rejection_reason && item.rejection_reason.length > 0) {
        extra = <Text style={styles.reason}>“{item.rejection_reason}”</Text>;
      }
    } else {
      badgeStyle = styles.badgeOk;
      badgeIcon = '✓';
      body = (
        <Text style={styles.body}>
          {t('activity.completed')} <Text style={styles.bodyStrong}>{item.chore?.title}</Text>
        </Text>
      );
      if (item.chore?.verification_mode === 'photo') {
        extra = (
          <Pressable
            onPress={() => onPhoto(item)}
            accessibilityRole="button"
            accessibilityLabel={t('activity.viewPhotoA11y')}
            style={styles.photoChip}
          >
            <Text style={styles.photoChipText}>{t('activity.viewPhoto')}</Text>
          </Pressable>
        );
      }
    }
  } else {
    const rewardEmoji = item.reward ? REWARD_ICONS[item.reward.icon_id as RewardIconId]?.emoji : '🎁';
    if (item.status === 'fulfilled') {
      badgeStyle = styles.badgeGift;
      badgeIcon = '🎁';
      body = (
        <Text style={styles.body}>
          {t('activity.got')} <Text style={styles.bodyStrong}>{rewardEmoji} {item.reward?.title}</Text>
        </Text>
      );
    } else {
      badgeStyle = styles.badgeNo;
      badgeIcon = '✗';
      body = (
        <Text style={styles.body}>
          <Text style={styles.bodyStrong}>{rewardEmoji} {item.reward?.title}</Text> {t('activity.denied')}
        </Text>
      );
      if (item.parent_note && item.parent_note.length > 0) {
        extra = <Text style={styles.reason}>“{item.parent_note}”</Text>;
      }
    }
  }

  return (
    <View style={styles.ev}>
      <View style={styles.rail} />
      <View style={[styles.badge, badgeStyle]}>
        <Text style={styles.badgeText}>{badgeIcon}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.av, { backgroundColor: a?.bg ?? '#EDF3F1' }]}>
            <Text style={styles.avEmoji}>{a?.emoji ?? '👤'}</Text>
          </View>
          <Text style={styles.kn} numberOfLines={1}>{name}</Text>
          <Text style={styles.tm}>{timeAgo(item.eventAt, t)}</Text>
        </View>
        {body}
        {extra}
      </View>
    </View>
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
  scroll: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET, paddingBottom: spacing.xxl },

  title: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text, letterSpacing: -0.3 },
  subtitle: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.xl,
  },

  err: { color: colors.error, fontFamily: typography.fontFamilySemi, marginTop: spacing.lg },
  empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.lg, gap: spacing.xs },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },

  ev: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  rail: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: -spacing.md,
    width: 2,
    backgroundColor: '#DCEBE7',
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  badgeOk: { backgroundColor: colors.primary },
  badgeNo: { backgroundColor: '#FFE4E8' },
  badgeGift: { backgroundColor: '#FFE3A0' },
  badgeText: { fontFamily: typography.fontFamilyBold, fontSize: 15, color: '#fff' },

  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md + 1,
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  av: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avEmoji: { fontSize: 14 },
  kn: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.text, flexShrink: 1 },
  tm: { marginLeft: 'auto', fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#94A8A4' },

  body: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, marginTop: spacing.xs + 1 },
  bodyStrong: { fontFamily: typography.fontFamilyBold, color: colors.text },
  reason: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.error,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  photoChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF7F4',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
  photoChipText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.primaryDark },

  modalBg: { flex: 1, backgroundColor: 'rgba(6,40,38,0.92)', justifyContent: 'center', alignItems: 'center' },
  modalImg: { width: '100%', height: '80%' },
  });
