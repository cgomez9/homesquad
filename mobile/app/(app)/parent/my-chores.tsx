import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { ChoreCard, type ChoreCardInstance, type ChoreAction } from '../../../src/components/ChoreCard';
import { claimChore, releaseChore, startChore, finishChore } from '../../../src/lib/chores';
import { useTheme, type Palette, spacing, typography } from '../../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function ParentMyChores() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const qc = useQueryClient();

  const { data: identity } = useQuery({
    queryKey: ['parent-actor-identity'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, family_id')
        .eq('user_id', user.id)
        .eq('type', 'parent')
        .maybeSingle();
      return profile as { id: string; family_id: string } | null;
    },
  });

  const familyId = identity?.family_id;
  const actorId = identity?.id;

  const { data: instances, isLoading } = useQuery({
    queryKey: ['parent-my-chores', actorId, familyId],
    queryFn: async (): Promise<ChoreCardInstance[]> => {
      if (!familyId || !actorId) return [];
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, assignee_profile_id, rejection_reason, chore:chores(id,title,star_value,verification_mode,recurrence), assignee:profiles!chore_instances_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('family_id', familyId)
        .in('status', ['pending', 'started', 'finished', 'rejected'])
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .order('due_at');
      if (error) throw error;
      const rows = (data ?? []) as unknown as ChoreCardInstance[];
      return rows.sort((a, b) => {
        const sa = a.assignee_profile_id === actorId ? 0 : a.assignee_profile_id === null ? 1 : 2;
        const sb = b.assignee_profile_id === actorId ? 0 : b.assignee_profile_id === null ? 1 : 2;
        if (sa !== sb) return sa - sb;
        return a.due_at.localeCompare(b.due_at);
      });
    },
    enabled: !!actorId && !!familyId,
  });

  const choreAction = useMutation({
    mutationFn: async (action: ChoreAction) => {
      if (!actorId) throw new Error('no actor');
      switch (action.kind) {
        case 'claim':   return claimChore(action.instanceId, actorId);
        case 'release': return releaseChore(action.instanceId, actorId);
        case 'start':   return startChore(action.instanceId, actorId);
        case 'finish':  return finishChore(action.instanceId, actorId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-my-chores', actorId, familyId] }),
  });

  if (isLoading || !actorId) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>My Chores</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {(instances ?? []).length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌊</Text>
            <Text style={styles.emptyText}>No chores for today.</Text>
          </View>
        ) : (
          (instances ?? []).map((inst) => (
            <ChoreCard
              key={inst.id}
              inst={inst}
              viewerActorId={actorId}
              onAction={(a) => choreAction.mutate(a)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET },
    title: {
      fontFamily: typography.fontFamilyBold,
      fontSize: 30,
      color: colors.text,
      letterSpacing: -0.3,
    },
    scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
    empty: { alignItems: 'center', marginTop: spacing.xxl + spacing.xl, gap: spacing.xs },
    emptyEmoji: { fontSize: 48 },
    emptyText: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.body,
      color: colors.textMuted,
    },
  });
