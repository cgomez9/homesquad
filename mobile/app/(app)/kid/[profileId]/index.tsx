// mobile/app/(app)/kid/[profileId]/index.tsx
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { fireSmallFeedback, fireBigFeedback } from '../../../../src/lib/feedback';

type Instance = {
  id: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  due_at: string;
  rejection_reason: string | null;
  chore: { id: string; title: string; star_value: number; verification_mode: 'auto'|'photo'|'approval' } | null;
};

export default function KidHome() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const qc = useQueryClient();

  const { data: instances, isLoading, error } = useQuery({
    queryKey: ['kid-today', profileId],
    queryFn: async (): Promise<Instance[]> => {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('chore_instances')
        .select('id, status, due_at, rejection_reason, chore:chores(id,title,star_value,verification_mode)')
        .or(`assignee_profile_id.eq.${profileId},assignee_profile_id.is.null`)
        .gte('due_at', startOfDay.toISOString())
        .lt('due_at', endOfDay.toISOString())
        .in('status', ['pending', 'submitted', 'rejected'])
        .order('due_at');
      if (error) throw error;
      return (data ?? []) as unknown as Instance[];
    },
    enabled: !!profileId,
  });

  const { data: balance } = useQuery({
    queryKey: ['balance', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('star_ledger')
        .select('delta')
        .eq('profile_id', profileId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r as { delta: number }).delta, 0);
    },
    enabled: !!profileId,
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', profileId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('current_streak', { p: profileId });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!profileId,
  });

  const complete = useMutation({
    mutationFn: async (vars: { instanceId: string }) => {
      const { error } = await supabase.rpc('complete_chore', {
        instance_id: vars.instanceId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kid-today', profileId] }),
  });

  function onDone(inst: Instance) {
    if (!inst.chore) return;
    fireSmallFeedback();
    if (inst.chore.verification_mode === 'photo') {
      router.push(`/(app)/kid/${profileId}/chore/${inst.id}/photo` as never);
      return;
    }
    complete.mutate({ instanceId: inst.id });
  }

  useEffect(() => {
    if (!profileId) return;
    const choreChannel = supabase
      .channel(`kid-feedback-chore-${profileId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chore_instances',
        filter: `completed_by=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'approved' && oldStatus !== 'approved') fireBigFeedback();
      })
      .subscribe();
    const redChannel = supabase
      .channel(`kid-feedback-red-${profileId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'redemptions',
        filter: `kid_profile_id=eq.${profileId}`,
      }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'fulfilled' && oldStatus !== 'fulfilled') fireBigFeedback();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(choreChannel);
      supabase.removeChannel(redChannel);
    };
  }, [profileId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's chores</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => router.push(`/(app)/kid/${profileId}/badges` as never)}>
            <Text style={styles.switch}>Badges</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/(app)/kid/${profileId}/rewards` as never)}>
            <Text style={styles.switch}>Rewards</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/(app)/kid/${profileId}/leaderboard` as never)}>
            <Text style={styles.switch}>Leaderboard</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(app)')}>
            <Text style={styles.switch}>Switch</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>⭐ {balance ?? 0}</Text>
        </View>
        {(streak ?? 0) > 0 && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>🔥 {streak}</Text>
          </View>
        )}
      </View>

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {instances && instances.length === 0 && (
        <Text style={styles.empty}>All done — great job! 🌟</Text>
      )}

      <ScrollView contentContainerStyle={{ gap: 12 }}>
        {(instances ?? []).map((inst) => {
          const submitted = inst.status === 'submitted';
          const rejected = inst.status === 'rejected';
          const cardStyle = [styles.card, submitted && styles.cardWaiting, rejected && styles.cardRejected];
          return (
            <View key={inst.id} style={cardStyle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.choreTitle}>{inst.chore?.title}</Text>
                <Text style={styles.stars}>⭐ {inst.chore?.star_value}</Text>
                {submitted && <Text style={styles.waiting}>Waiting for parent ✋</Text>}
                {rejected && (
                  <Text style={styles.rejected}>
                    ✗ Rejected{inst.rejection_reason ? `: ${inst.rejection_reason}` : ''}
                  </Text>
                )}
              </View>
              {!submitted && !rejected && (
                <Pressable onPress={() => onDone(inst)} style={styles.doneBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  switch: { color: '#3b82f6', fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', fontSize: 18, marginTop: 64, color: '#6b7280' },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardWaiting: { opacity: 0.55 },
  cardRejected: { opacity: 0.55, backgroundColor: '#fee2e2' },
  choreTitle: { fontSize: 18, fontWeight: '600' },
  stars: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  waiting: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  rejected: { fontSize: 12, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' },
  doneBtn: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
