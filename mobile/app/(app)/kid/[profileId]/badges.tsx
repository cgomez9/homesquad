// mobile/app/(app)/kid/[profileId]/badges.tsx
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, type AchievementKey } from '../../../../src/constants/achievements';

type Unlocked = { achievement_key: string; unlocked_at: string };

export default function KidBadges() {
  const router = useRouter();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();

  const [unlockedQ, balanceQ] = useQueries({
    queries: [
      {
        queryKey: ['kid-badges', profileId],
        queryFn: async (): Promise<Unlocked[]> => {
          const { data, error } = await supabase
            .from('achievements')
            .select('achievement_key, unlocked_at')
            .eq('profile_id', profileId);
          if (error) throw error;
          return (data ?? []) as Unlocked[];
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
          return (data ?? []).reduce((s, r) => s + (r as { delta: number }).delta, 0);
        },
        enabled: !!profileId,
      },
    ],
  });

  const balance = balanceQ.data ?? 0;
  const unlockedByKey = new Map<string, string>();
  (unlockedQ.data ?? []).forEach((u) => unlockedByKey.set(u.achievement_key, u.unlocked_at));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Badges</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View style={styles.pill}><Text style={styles.pillText}>⭐ {balance}</Text></View>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.switch}>Back</Text>
          </Pressable>
        </View>
      </View>

      {unlockedQ.isLoading && <ActivityIndicator />}
      {unlockedQ.error && <Text style={styles.err}>{(unlockedQ.error as Error).message}</Text>}

      <ScrollView contentContainerStyle={styles.grid}>
        {ACHIEVEMENT_KEYS.map((key: AchievementKey) => {
          const a = ACHIEVEMENTS[key];
          const unlockedAt = unlockedByKey.get(key);
          const unlocked = !!unlockedAt;
          return (
            <View key={key} style={[styles.card, !unlocked && styles.cardLocked]}>
              <Text style={[styles.emoji, !unlocked && styles.emojiLocked]}>{a.emoji}</Text>
              <Text style={[styles.cardTitle, !unlocked && styles.cardTitleLocked]}>{a.title}</Text>
              {unlocked ? (
                <Text style={styles.cardDate}>Unlocked {new Date(unlockedAt!).toLocaleDateString()}</Text>
              ) : (
                <Text style={styles.cardDesc}>{a.description}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  switch: { color: '#3b82f6', fontWeight: '500' },
  pill: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  err: { color: '#ef4444' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  card: { width: '48%', backgroundColor: '#fef3c7', borderRadius: 16, padding: 16, alignItems: 'center', gap: 4, marginBottom: 12 },
  cardLocked: { backgroundColor: '#f3f4f6', opacity: 0.55 },
  emoji: { fontSize: 48 },
  emojiLocked: { opacity: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#92400e', textAlign: 'center' },
  cardTitleLocked: { color: '#6b7280' },
  cardDate: { fontSize: 11, color: '#6b7280' },
  cardDesc: { fontSize: 11, color: '#6b7280', textAlign: 'center', fontStyle: 'italic' },
});
