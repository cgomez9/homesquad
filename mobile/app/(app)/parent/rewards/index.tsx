import { useMemo, useRef, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';
import { PRIVILEGE_ICONS, type PrivilegeIconId } from '../../../../src/constants/privilegeIcons';
import { PRIVILEGE_PRESETS } from '../../../../src/constants/privilegePresets';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

type Mode = 'rewards' | 'privileges';

type Reward = {
  id: string;
  title: string;
  star_cost: number;
  icon_id: number;
  description: string | null;
};

type Privilege = {
  id: string;
  title: string;
  token_cost: number;
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

  const [mode, setMode] = useState<Mode>('rewards');

  const rewardsQuery = useQuery({
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

  const privilegesQuery = useQuery({
    queryKey: ['parent-privileges'],
    queryFn: async (): Promise<Privilege[]> => {
      const { data, error } = await supabase
        .from('privileges')
        .select('id, title, token_cost, icon_id, description')
        .eq('active', true)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Privilege[];
    },
  });

  const archiveReward = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase.rpc('archive_reward', { reward_id: rewardId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-rewards'] }),
  });

  const archivePrivilege = useMutation({
    mutationFn: async (privilegeId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('archive_privilege', { privilege_id: privilegeId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-privileges'] }),
  });

  function confirmArchiveReward(r: Reward) {
    Alert.alert(t('parent.archiveRewardTitle'), r.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: () => archiveReward.mutate(r.id) },
    ]);
  }

  function confirmArchivePrivilege(p: Privilege) {
    Alert.alert(t('parent.archivePrivilegeTitle'), p.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: () => archivePrivilege.mutate(p.id) },
    ]);
  }

  const rewards = rewardsQuery.data ?? [];
  const privileges = privilegesQuery.data ?? [];
  const isPriv = mode === 'privileges';

  const activePresetKeys = useMemo(
    () => new Set(privileges.map((p) => p.title.trim().toLowerCase())),
    [privileges]
  );

  const header = (
    <View>
      <View style={styles.head}>
        <Toggle mode={mode} onChange={setMode} />
        <Fab
          accessibilityLabel={isPriv ? t('parent.newPrivilegeA11y') : t('parent.newRewardA11y')}
          onPress={() =>
            router.push(
              (isPriv ? '/(app)/parent/privileges/new' : '/(app)/parent/rewards/new') as never
            )
          }
        />
      </View>

      {isPriv && <Text style={styles.intro}>{t('parent.privilegesIntro')}</Text>}

      {isPriv && (
        <>
          <Text style={styles.section}>{t('parent.privilegePresetsHeader')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetRow}
          >
            {PRIVILEGE_PRESETS.map((p) => {
              const presetTitle = t(p.titleKey);
              const alreadyActive = activePresetKeys.has(presetTitle.trim().toLowerCase());
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole="button"
                  onPress={() => {
                    router.push({
                      pathname: '/(app)/parent/privileges/new',
                      params: {
                        preset_title: presetTitle,
                        preset_description: t(p.descriptionKey),
                        preset_token_cost: String(p.tokenCost),
                        preset_icon_id: String(p.iconId),
                      },
                    } as never);
                  }}
                  style={[styles.presetChip, alreadyActive && styles.presetChipUsed]}
                >
                  <Text style={styles.presetEmoji}>
                    {PRIVILEGE_ICONS[p.iconId as PrivilegeIconId]?.emoji ?? '🪙'}
                  </Text>
                  <Text style={styles.presetTitle} numberOfLines={1}>
                    {presetTitle}
                  </Text>
                  <Text style={styles.presetCost}>🪙 {p.tokenCost}</Text>
                  {alreadyActive && <Text style={styles.presetCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {(isPriv ? privileges.length > 0 : rewards.length > 0) && (
        <Text style={styles.section}>
          {isPriv
            ? t('parent.privilegesCount', { count: privileges.length })
            : t('parent.rewardsCount', { count: rewards.length })}
        </Text>
      )}
    </View>
  );

  const isLoading = isPriv ? privilegesQuery.isLoading : rewardsQuery.isLoading;
  const error = isPriv ? privilegesQuery.error : rewardsQuery.error;

  const empty = isLoading ? (
    <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
  ) : error ? (
    <Text style={styles.err}>{(error as Error).message}</Text>
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🌊</Text>
      <Text style={styles.emptyText}>
        {isPriv ? t('parent.privilegesEmpty') : t('parent.rewardsEmpty')}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      {isPriv ? (
        <FlatList
          key="privileges"
          data={privileges}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          renderItem={({ item }) => (
            <CatalogRow
              emoji={PRIVILEGE_ICONS[item.icon_id as PrivilegeIconId]?.emoji ?? '🪙'}
              title={item.title}
              description={item.description}
              cost={item.token_cost}
              costEmoji="🪙"
              costStyle="token"
              a11y={t('parent.rowA11y', { title: item.title })}
              onPress={() => router.push(`/(app)/parent/privileges/${item.id}` as never)}
              onLongPress={() => confirmArchivePrivilege(item)}
            />
          )}
          ListEmptyComponent={empty}
        />
      ) : (
        <FlatList
          key="rewards"
          data={rewards}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          renderItem={({ item }) => (
            <CatalogRow
              emoji={REWARD_ICONS[item.icon_id as RewardIconId]?.emoji ?? '🎁'}
              title={item.title}
              description={item.description}
              cost={item.star_cost}
              costEmoji="⭐"
              costStyle="star"
              a11y={t('parent.rowA11y', { title: item.title })}
              onPress={() => router.push(`/(app)/parent/rewards/${item.id}` as never)}
              onLongPress={() => confirmArchiveReward(item)}
            />
          )}
          ListEmptyComponent={empty}
        />
      )}
    </View>
  );
}

/* ---------- segmented toggle ---------- */

function Toggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {(['rewards', 'privileges'] as Mode[]).map((m) => {
        const sel = m === mode;
        return (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(m)}
            style={[styles.segment, sel && styles.segmentSel]}
          >
            <Text style={[styles.segmentText, sel && styles.segmentTextSel]} numberOfLines={1}>
              {m === 'rewards' ? `⭐ ${t('parent.rewardsTitle')}` : `🪙 ${t('parent.privilegesTitle')}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- add (FAB) ---------- */

function Fab({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
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
        accessibilityLabel={accessibilityLabel}
        style={styles.fab}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- catalog row (rewards + privileges share the shape) ---------- */

function CatalogRow({
  emoji,
  title,
  description,
  cost,
  costEmoji,
  costStyle,
  a11y,
  onPress,
  onLongPress,
}: {
  emoji: string;
  title: string;
  description: string | null;
  cost: number;
  costEmoji: string;
  costStyle: 'star' | 'token';
  a11y: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { scale, onPressIn, onPressOut } = usePressScale();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={styles.row}
      >
        <View style={styles.ico}>
          <Text style={styles.icoEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rewardTitle} numberOfLines={1}>{title}</Text>
          {description ? (
            <Text style={styles.desc} numberOfLines={1}>{description}</Text>
          ) : null}
        </View>
        <View style={[styles.cost, costStyle === 'token' ? styles.costToken : styles.costStar]}>
          <Text style={[styles.costText, costStyle === 'token' ? styles.costTextToken : styles.costTextStar]}>
            {costEmoji} {cost}
          </Text>
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
      gap: spacing.md,
    },

    toggle: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      padding: 4,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    segment: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentSel: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small,
      color: colors.textMuted,
    },
    segmentTextSel: { color: '#fff' },

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

    intro: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: spacing.lg,
    },

    section: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      color: colors.textMuted,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },

    presetRow: { gap: spacing.sm, paddingVertical: 4, paddingRight: spacing.xl },
    presetChip: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      minWidth: 140,
      gap: 2,
      borderWidth: 1.5,
      borderColor: colors.border,
      shadowColor: SHADOW, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    },
    presetChipUsed: { opacity: 0.55, borderStyle: 'dashed' },
    presetEmoji: { fontSize: 22 },
    presetTitle: { fontFamily: typography.fontFamilyBold, fontSize: typography.small + 1, color: colors.text, marginTop: 2 },
    presetCost: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.textMuted, marginTop: 2 },
    presetCheck: { position: 'absolute', top: 6, right: 8, fontSize: 14, color: colors.primary, fontFamily: typography.fontFamilyBold },

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
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    costStar: { backgroundColor: '#FFF1C9' },
    costToken: { backgroundColor: '#E8F4FF' },
    costText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small },
    costTextStar: { color: '#7A5200' },
    costTextToken: { color: '#1F548F' },
  });
