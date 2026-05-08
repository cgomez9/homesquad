import { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import type { Recurrence } from '../../../../src/lib/recurrence';

export default function NewChore() {
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [familyId, setFamilyId] = useState<string | null>(null);

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_id, family_id')
        .eq('type', 'kid')
        .order('created_at');
      if (error) throw error;
      if (data && data.length > 0) setFamilyId((data[0] as { family_id: string }).family_id);
      return (data ?? []) as Assignee[];
    },
  });

  // Fallback: derive family_id from a parent profile if there are no kids yet.
  useEffect(() => {
    if (familyId) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('family_id').eq('type', 'parent').limit(1).maybeSingle();
      if (data) setFamilyId((data as { family_id: string }).family_id);
    })();
  }, [familyId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error('no family loaded');
      const sv = parseInt(stars, 10);
      if (!Number.isFinite(sv) || sv < 1 || sv > 999) throw new Error('star value must be 1–999');
      const { error } = await supabase.rpc('create_chore', {
        family_id: familyId as string,
        title: title.trim(),
        description: (description.trim() || null) as string,
        star_value: sv,
        assignee_profile_id: assigneeId as string,
        verification_mode: mode,
        recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
    onError: (e) => Alert.alert('Could not create chore', (e as Error).message),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New chore</Text>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Make bed" />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} />
      <TextField label="Stars" value={stars} onChangeText={setStars} keyboardType="number-pad" />
      <VerificationModePicker value={mode} onChange={setMode} />
      <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <Button label="Save" loading={create.isPending} onPress={() => create.mutate()} />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
});
