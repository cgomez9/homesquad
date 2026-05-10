// mobile/app/(app)/kid/[profileId]/rewards.tsx
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';

type Reward = {
  id: string;
  title: string;
  description: string | null;
  star_cost: number;
  icon_id: number;
};

type OpenRedemption = {
  reward_id: string;
  status: 'pending' | 'approved';
};

export default function KidRewards() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [rewards, openRed, balanceQ] = useQueries({
    queries: [
      {
        queryKey: ['kid-rewards', profileId],
        queryFn: async (): Promise<Reward[]> => {
          const { data, error } = await supabase
            .from('rewards')
            .select('id, title, description, star_cost, icon_id')
            .eq('active', true)
            .order('created_at');
          if (error) throw error;
          return (data ?? []) as Reward[];
        },
        enabled: !!profileId,
      },
      {
        queryKey: ['kid-open-redemptions', profileId],
        queryFn: async (): Promise<OpenRedemption[]> => {
          const { data, error } = await supabase
            .from('redemptions')
            .select('reward_id, status')
            .eq('kid_profile_id', profileId)
            .in('status', ['pending', 'approved']);
          if (error) throw error;
          return (data ?? []) as OpenRedemption[];
        },
        enabled: !!profileId,
      },
      {
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
      },
    ],
  });

  const balance = balanceQ.data ?? 0;
  const openByReward = new Map<string, OpenRedemption['status']>();
  (openRed.data ?? []).forEach((r) => openByReward.set(r.reward_id, r.status));

  const requestMut = useMutation({
    mutationFn: async (vars: { rewardId: string }) => {
      const { error } = await supabase.rpc('request_redemption', {
        reward_id: vars.rewardId,
        kid_profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kid-rewards', profileId] });
      qc.invalidateQueries({ queryKey: ['kid-open-redemptions', profileId] });
    },
    onError: (e) => Alert.alert('Could not request', (e as Error).message),
  });

  function onRequest(r: Reward) {
    Alert.alert(
      `Spend ⭐${r.star_cost} on ${r.title}?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spend', onPress: () => requestMut.mutate({ rewardId: r.id }) },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rewards</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View style={styles.pill}><Text style={styles.pillText}>⭐ {balance}</Text></View>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.switch}>Back</Text>
          </Pressable>
        </View>
      </View>

      {(rewards.isLoading || openRed.isLoading) && <ActivityIndicator />}
      {rewards.error && <Text style={styles.err}>{(rewards.error as Error).message}</Text>}
      {rewards.data && rewards.data.length === 0 && (
        <Text style={styles.empty}>No rewards yet.</Text>
      )}

      <ScrollView contentContainerStyle={{ gap: 12 }}>
        {(rewards.data ?? []).map((r) => {
          const openStatus = openByReward.get(r.id);
          const affordable = balance >= r.star_cost;
          const emoji = REWARD_ICONS[r.icon_id as RewardIconId]?.emoji ?? '🎁';

          let label: string | null = null;
          let buttonNode: React.ReactNode = null;
          let cardStyle: object[] = [styles.card];

          if (openStatus === 'pending') {
            label = '✋ Requested';
            cardStyle = [styles.card, styles.cardWaiting];
          } else if (openStatus === 'approved') {
            label = '🎁 Coming soon';
            cardStyle = [styles.card, styles.cardWaiting];
          } else if (!affordable) {
            label = `🔒 Need ${r.star_cost - balance} more ⭐`;
            cardStyle = [styles.card, styles.cardLocked];
          } else {
            buttonNode = (
              <Pressable onPress={() => onRequest(r)} style={styles.requestBtn}>
                <Text style={styles.requestText}>Request</Text>
              </Pressable>
            );
          }

          return (
            <View key={r.id} style={cardStyle}>
              <Text style={styles.emoji}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardTitle}>{r.title}</Text>
                <Text style={styles.cost}>⭐ {r.star_cost}</Text>
                {label && <Text style={styles.statusLabel}>{label}</Text>}
              </View>
              {buttonNode}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  switch: { color: '#3b82f6', fontWeight: '500' },
  pill: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 64 },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardWaiting: { opacity: 0.55 },
  cardLocked: { backgroundColor: '#f3f4f6', opacity: 0.7 },
  emoji: { fontSize: 36 },
  rewardTitle: { fontSize: 18, fontWeight: '600' },
  cost: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  statusLabel: { fontSize: 12, color: '#6b7280', marginTop: 4, fontStyle: 'italic' },
  requestBtn: { backgroundColor: '#10b981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999 },
  requestText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
