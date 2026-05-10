import { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { RewardIconPicker } from '../../../../src/components/RewardIconPicker';
import type { RewardIconId } from '../../../../src/constants/rewardIcons';

export default function EditReward() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('50');
  const [iconId, setIconId] = useState<RewardIconId>(1);

  const { data: reward, isLoading } = useQuery({
    queryKey: ['reward', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, title, description, star_cost, icon_id')
        .eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!reward) return;
    setTitle(reward.title);
    setDescription(reward.description ?? '');
    setCost(String(reward.star_cost));
    setIconId(reward.icon_id as RewardIconId);
  }, [reward]);

  const update = useMutation({
    mutationFn: async () => {
      const sc = parseInt(cost, 10);
      if (!Number.isFinite(sc) || sc < 1 || sc > 9999) throw new Error('star cost must be 1–9999');
      const { error } = await supabase.rpc('update_reward', {
        reward_id: id,
        title: title.trim(),
        description: (description.trim() || null) as unknown as string,
        star_cost: sc,
        icon_id: iconId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-rewards'] });
      qc.invalidateQueries({ queryKey: ['reward', id] });
      router.back();
    },
    onError: (e) => Alert.alert('Could not update reward', (e as Error).message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('archive_reward', { reward_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-rewards'] });
      router.back();
    },
  });

  if (isLoading || !reward) return <ActivityIndicator style={{ marginTop: 64 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit reward</Text>
      <TextField label="Title" value={title} onChangeText={setTitle} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} />
      <TextField label="Star cost" value={cost} onChangeText={setCost} keyboardType="number-pad" />
      <RewardIconPicker value={iconId} onChange={setIconId} />
      <Button label="Save changes" loading={update.isPending} onPress={() => update.mutate()} />
      <Button label="Archive" variant="secondary" onPress={() => archive.mutate()} style={{ marginTop: 8 }} />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
