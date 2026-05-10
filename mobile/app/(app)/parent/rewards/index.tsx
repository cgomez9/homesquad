import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { REWARD_ICONS, type RewardIconId } from '../../../../src/constants/rewardIcons';

type Reward = {
  id: string;
  title: string;
  star_cost: number;
  icon_id: number;
  description: string | null;
};

export default function RewardsList() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
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

  const archive = useMutation({
    mutationFn: async (rewardId: string) => {
      const { error } = await supabase.rpc('archive_reward', { reward_id: rewardId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-rewards'] }),
  });

  function confirmArchive(r: Reward) {
    Alert.alert('Archive reward?', r.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate(r.id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rewards</Text>
        <Pressable onPress={() => router.push('/(app)/parent/rewards/new' as never)} style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {data && data.length === 0 && (
        <Text style={styles.empty}>No rewards yet — tap + to add one.</Text>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/parent/rewards/${item.id}` as never)}
            onLongPress={() => confirmArchive(item)}
            style={styles.row}
          >
            <Text style={styles.emoji}>{REWARD_ICONS[item.icon_id as RewardIconId]?.emoji ?? '🎁'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>{item.title}</Text>
              {item.description && <Text style={styles.desc}>{item.description}</Text>}
            </View>
            <Text style={styles.cost}>⭐ {item.star_cost}</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  fab: { backgroundColor: '#3b82f6', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  err: { color: '#ef4444' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 64 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  emoji: { fontSize: 28 },
  rewardTitle: { fontSize: 17, fontWeight: '600' },
  desc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cost: { fontSize: 15, fontWeight: '500' },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
});
