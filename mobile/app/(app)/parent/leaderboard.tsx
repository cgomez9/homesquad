// mobile/app/(app)/parent/leaderboard.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import i18n from '../../../src/i18n';
import { supabase } from '../../../src/lib/supabase';
import { useLeaderboard } from '../../../src/hooks/useLeaderboard';
import { LeaderboardList } from '../../../src/components/LeaderboardList';
import { colors, spacing, typography, radii } from '../../../src/theme';

export default function ParentLeaderboardScreen() {
  const [scope, setScope] = useState<'week' | 'allTime'>('week');

  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-leaderboard'],
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

  const { data, isLoading } = useLeaderboard(familyId ?? undefined);

  function onBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/parent/settings');
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('common.back', 'Back')}
        >
          <Text style={styles.back}>‹ {i18n.t('common.back', 'Back')}</Text>
        </Pressable>
        <Text style={styles.title}>{i18n.t('leaderboard.title')}</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setScope('week')}
          style={[styles.tab, scope === 'week' && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === 'week' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabThisWeek')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setScope('allTime')}
          style={[styles.tab, scope === 'allTime' && styles.tabActive]}
        >
          <Text style={[styles.tabText, scope === 'allTime' && styles.tabTextActive]}>
            {i18n.t('leaderboard.tabAllTime')}
          </Text>
        </Pressable>
      </View>

      {!isLoading && <LeaderboardList rows={data ?? []} scope={scope} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg,
                  paddingTop: 48, paddingBottom: spacing.lg },
  header:       { marginBottom: spacing.md },
  back:         { fontSize: typography.body, color: colors.primary,
                  fontFamily: typography.fontFamilyBold, marginBottom: spacing.sm },
  title:        { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text },
  tabs:         { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill,
                  padding: spacing.xs, marginBottom: spacing.md },
  tab:          { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.pill },
  tabActive:    { backgroundColor: colors.primary },
  tabText:      { color: colors.text, fontFamily: typography.fontFamily },
  tabTextActive:{ color: '#fff', fontFamily: typography.fontFamilyBold },
});
