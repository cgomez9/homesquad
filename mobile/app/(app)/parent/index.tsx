import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { formatRecurrence, Recurrence } from '../../../src/lib/recurrence';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { useActiveGoal } from '../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../src/components/GoalCard';

type Chore = {
  id: string;
  title: string;
  star_value: number;
  recurrence: Recurrence;
  assignee: { id: string; display_name: string; avatar_id: number } | null;
};

export default function ChoresList() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-home'],
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

  const activeGoal = useActiveGoal(familyId ?? undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['parent-chores'],
    queryFn: async (): Promise<Chore[]> => {
      const { data, error } = await supabase
        .from('chores')
        .select('id, title, star_value, recurrence, assignee:profiles!chores_assignee_profile_id_fkey(id,display_name,avatar_id)')
        .eq('active', true)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Chore[];
    },
  });

  const archive = useMutation({
    mutationFn: async (choreId: string) => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: choreId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-chores'] }),
  });

  function confirmArchive(c: Chore) {
    Alert.alert('Archive chore?', c.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate(c.id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chores</Text>
        <Pressable onPress={() => router.push('/(app)/parent/chores/new' as never)} style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      {activeGoal.data && (
        <Pressable
          onPress={() => router.push('/(app)/parent/goals' as never)}
          style={styles.goalCardWrapper}
        >
          <GoalCard goal={activeGoal.data} />
        </Pressable>
      )}

      {isLoading && <ActivityIndicator />}
      {error && <Text style={styles.err}>{(error as Error).message}</Text>}
      {data && data.length === 0 && (
        <Text style={styles.empty}>No chores yet — tap + to add one.</Text>
      )}

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/parent/chores/${item.id}` as never)}
            onLongPress={() => confirmArchive(item)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.choreTitle}>{item.title}</Text>
              <Text style={styles.meta}>
                {formatRecurrence(item.recurrence)} · ⭐ {item.star_value}
              </Text>
            </View>
            <Text style={styles.assignee}>
              {item.assignee
                ? `${AVATARS[item.assignee.avatar_id as AvatarId].emoji} ${item.assignee.display_name}`
                : 'Anyone'}
            </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  choreTitle: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  assignee: { fontSize: 13 },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
  goalCardWrapper: { marginBottom: 12 },
});
