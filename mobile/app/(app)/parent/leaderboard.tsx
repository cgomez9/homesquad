// mobile/app/(app)/parent/leaderboard.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
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

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('leaderboard.title')}</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:        { fontSize: typography.h1, fontFamily: typography.fontFamilyBold, color: colors.text,
                  marginBottom: spacing.md },
  tabs:         { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.pill,
                  padding: spacing.xs, marginBottom: spacing.md },
  tab:          { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.pill },
  tabActive:    { backgroundColor: colors.primary },
  tabText:      { color: colors.text, fontFamily: typography.fontFamily },
  tabTextActive:{ color: '#fff', fontFamily: typography.fontFamilyBold },
});
