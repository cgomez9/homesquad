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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';
import { PRIVILEGE_PRESETS } from '../../../../src/constants/privilegePresets';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../../src/theme';

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

export default function PrivilegesList() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
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

  const archive = useMutation({
    mutationFn: async (privilegeId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('archive_privilege', { privilege_id: privilegeId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-privileges'] }),
  });

  function confirmArchive(p: Privilege) {
    Alert.alert(t('parent.archivePrivilegeTitle'), p.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: () => archive.mutate(p.id) },
    ]);
  }

  const privileges = data ?? [];
  const activePresetKeys = useMemo(
    () => new Set(privileges.map((p) => p.title.trim().toLowerCase())),
    [privileges]
  );

  const header = (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>{t('parent.privilegesTitle')}</Text>
        <Fab onPress={() => router.push('/(app)/parent/privileges/new' as never)} />
      </View>

      <Text style={styles.intro}>{t('parent.privilegesIntro')}</Text>

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
                {REWARD_ICONS[p.iconId as RewardIconId]?.emoji ?? '🎁'}
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

      {privileges.length > 0 && (
        <Text style={styles.section}>
          {t('parent.privilegesCount', { count: privileges.length })}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <FlatList
        data={privileges}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        renderItem={({ item }) => (
          <PrivilegeRow
            privilege={item}
            onPress={() => router.push(`/(app)/parent/privileges/${item.id}` as never)}
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
              <Text style={styles.emptyText}>{t('parent.privilegesEmpty')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

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
        accessibilityLabel={t('parent.newPrivilegeA11y')}
        style={styles.fab}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Animated.View>
  );
}

function PrivilegeRow({
  privilege,
  onPress,
  onLongPress,
}: {
  privilege: Privilege;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const emoji = REWARD_ICONS[privilege.icon_id as RewardIconId]?.emoji ?? '🎁';

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('parent.rowA11y', { title: privilege.title })}
        style={styles.row}
      >
        <View style={styles.ico}>
          <Text style={styles.icoEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.privilegeTitle} numberOfLines={1}>{privilege.title}</Text>
          {privilege.description ? (
            <Text style={styles.desc} numberOfLines={1}>{privilege.description}</Text>
          ) : null}
        </View>
        <View style={styles.cost}>
          <Text style={styles.costText}>🪙 {privilege.token_cost}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET, paddingBottom: spacing.xxl },

    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text, letterSpacing: -0.3 },
    intro: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: spacing.lg,
    },
    fab: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 6,
    },
    fabText: { color: '#fff', fontSize: 30, fontFamily: typography.fontFamilyBold, lineHeight: 34 },

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
    empty: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.xs },
    emptyEmoji: { fontSize: 48 },
    emptyText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted, textAlign: 'center' },

    row: {
      backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg,
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md,
      shadowColor: SHADOW, shadowOpacity: 0.11, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4,
    },
    ico: {
      width: 54, height: 54, borderRadius: 18, backgroundColor: '#EAF7F4',
      alignItems: 'center', justifyContent: 'center',
    },
    icoEmoji: { fontSize: 30 },
    rowMain: { flex: 1, minWidth: 0 },
    privilegeTitle: { fontFamily: typography.fontFamilyBold, fontSize: 17, color: colors.text },
    desc: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: 3 },
    cost: {
      backgroundColor: '#E8F4FF',
      paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill,
    },
    costText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#1F548F' },
  });
