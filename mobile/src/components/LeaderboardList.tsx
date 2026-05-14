// mobile/src/components/LeaderboardList.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';
import type { LeaderboardRow } from '../hooks/useLeaderboard';

type Props = {
  rows:  LeaderboardRow[];
  scope: 'week' | 'allTime';
};

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function LeaderboardList({ rows, scope }: Props) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{i18n.t('leaderboard.emptyState')}</Text>
      </View>
    );
  }

  const isSolo = rows.length === 1;
  const sorted = [...rows].sort((a, b) =>
    scope === 'week' ? a.week_rank - b.week_rank : a.all_time_rank - b.all_time_rank,
  );

  return (
    <View>
      {isSolo && <Text style={styles.solo}>{i18n.t('leaderboard.soloFallback')}</Text>}
      <FlatList
        data={sorted}
        keyExtractor={(r) => r.profile_id}
        renderItem={({ item }) => {
          const rank = scope === 'week' ? item.week_rank : item.all_time_rank;
          const stars = scope === 'week' ? item.week_stars : item.all_time_stars;
          return (
            <View style={styles.row}>
              {!isSolo && (
                <Text testID="leaderboard-medal" style={styles.medal}>
                  {MEDALS[rank] ?? `#${rank}`}
                </Text>
              )}
              <Text testID="leaderboard-name" style={styles.name}>{item.display_name}</Text>
              <Text style={styles.stars}>
                {i18n.t(scope === 'week' ? 'leaderboard.starsThisWeek' : 'leaderboard.starsAllTime',
                        { count: stars })}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
            padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.sm, gap: spacing.md },
  medal:  { fontSize: typography.h1 },
  name:   { flex: 1, fontSize: typography.body, fontFamily: typography.fontFamilyBold, color: colors.text },
  stars:  { fontSize: typography.body, color: colors.textMuted, fontFamily: typography.fontFamily },
  solo:   { fontSize: typography.body, color: colors.textMuted, textAlign: 'center',
            padding: spacing.md, fontFamily: typography.fontFamily },
  empty:  { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: typography.body, color: colors.textMuted, textAlign: 'center',
               fontFamily: typography.fontFamily },
});
