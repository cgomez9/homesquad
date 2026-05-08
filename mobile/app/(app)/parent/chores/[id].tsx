import { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import type { Recurrence } from '../../../../src/lib/recurrence';

export default function EditChore() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [originalAssignee, setOriginalAssignee] = useState<string | null>(null);

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_id').eq('type', 'kid').order('created_at');
      if (error) throw error;
      return (data ?? []) as Assignee[];
    },
  });

  const { data: chore, isLoading } = useQuery({
    queryKey: ['chore', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chores')
        .select('id,title,description,star_value,assignee_profile_id,verification_mode,recurrence')
        .eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!chore) return;
    setTitle(chore.title);
    setDescription(chore.description ?? '');
    setStars(String(chore.star_value));
    setAssigneeId(chore.assignee_profile_id);
    setOriginalAssignee(chore.assignee_profile_id);
    setMode(chore.verification_mode as VerificationMode);
    setRecurrence(chore.recurrence as unknown as Recurrence);
  }, [chore]);

  const update = useMutation({
    mutationFn: async () => {
      const sv = parseInt(stars, 10);
      if (!Number.isFinite(sv) || sv < 1 || sv > 999) throw new Error('star value must be 1–999');
      // Cast nullable RPC params to satisfy generated supabase-js types (same pattern as Task 23).
      const { error } = await supabase.rpc('update_chore', {
        chore_id: id,
        title: title.trim(),
        description: (description.trim() || null) as unknown as string,
        star_value: sv,
        clear_assignee: originalAssignee !== null && assigneeId === null,
        assignee_profile_id: assigneeId as unknown as string,
        verification_mode: mode,
        recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      qc.invalidateQueries({ queryKey: ['chore', id] });
      router.back();
    },
    onError: (e) => Alert.alert('Could not update chore', (e as Error).message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
  });

  if (isLoading || !chore) return <ActivityIndicator style={{ marginTop: 64 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit chore</Text>
      <TextField label="Title" value={title} onChangeText={setTitle} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} />
      <TextField label="Stars" value={stars} onChangeText={setStars} keyboardType="number-pad" />
      <VerificationModePicker value={mode} onChange={setMode} />
      <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
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
