// mobile/src/components/GoalCard.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';
import type { ActiveGoal } from '../hooks/useActiveGoal';

type Props = {
  goal:    ActiveGoal;
  onPress?: () => void;
};

export function GoalCard({ goal, onPress }: Props) {
  const pct = Math.min(100, Math.round((goal.progress_stars / goal.target_stars) * 100));
  const done = goal.progress_stars >= goal.target_stars;

  const body = (
    <View style={styles.card}>
      <Text style={styles.label}>{i18n.t('goals.active')}</Text>
      <Text style={styles.title}>{goal.title}</Text>
      <View style={styles.barTrack}>
        <View testID="goal-progress-fill" style={StyleSheet.flatten([styles.barFill, { width: `${pct}%` }])} />
      </View>
      <Text style={styles.progressText}>
        {done
          ? i18n.t('goals.progressDone')
          : i18n.t('goals.progressRemaining', { count: goal.target_stars - goal.progress_stars })}
      </Text>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  card:       { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, gap: spacing.sm },
  label:      { fontSize: typography.tiny, color: colors.textMuted, textTransform: 'uppercase',
                fontFamily: typography.fontFamilyBold, letterSpacing: 1 },
  title:      { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
  barTrack:   { height: 10, backgroundColor: colors.border, borderRadius: radii.pill, overflow: 'hidden' },
  barFill:    { height: 10, backgroundColor: colors.primary, borderRadius: radii.pill },
  progressText: { fontSize: typography.small, color: colors.textMuted, fontFamily: typography.fontFamily },
});
