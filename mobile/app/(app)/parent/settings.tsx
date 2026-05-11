// mobile/app/(app)/parent/settings.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Pressable, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../src/lib/supabase';
import { Button } from '../../../src/components/Button';
import { signOut } from '../../../src/lib/auth';
import { isEnabled, setEnabled } from '../../../src/lib/feedback';

export default function Settings() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedbackOn, setFeedbackOn] = useState(true);

  useEffect(() => {
    isEnabled().then(setFeedbackOn);
  }, []);

  async function onToggleFeedback(v: boolean) {
    setFeedbackOn(v);
    await setEnabled(v);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['family-summary'],
    queryFn: async () => {
      const { data: fam } = await supabase.from('families').select('name').limit(1).maybeSingle();
      const { data: profs } = await supabase.from('profiles').select('id, type');
      return {
        familyName: (fam as { name: string } | null)?.name ?? 'Family',
        memberCount: profs?.length ?? 0,
      };
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_family_invite');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (c) => { setCopied(false); setCode(c); },
    onError: (e) => Alert.alert('Could not generate code', (e as Error).message),
  });

  async function onCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {isLoading ? <ActivityIndicator /> : (
        <View style={styles.section}>
          <Text style={styles.label}>Family</Text>
          <Text style={styles.value}>{data?.familyName} · {data?.memberCount} member{data?.memberCount === 1 ? '' : 's'}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Co-parents</Text>
        <Button label="Invite a co-parent" onPress={() => invite.mutate()} loading={invite.isPending} variant="secondary" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Feedback</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Sounds & haptics on this device</Text>
          <Switch value={feedbackOn} onValueChange={onToggleFeedback} />
        </View>
      </View>

      <View style={styles.stub}><Text style={styles.stubText}>Notifications — coming soon</Text></View>
      <View style={styles.stub}><Text style={styles.stubText}>Subscription — coming soon</Text></View>

      <Button label="Switch profile" variant="secondary" onPress={() => router.replace('/(app)')} />
      <Button label="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: 8 }} />

      <Modal visible={!!code} transparent animationType="fade" onRequestClose={() => setCode(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Co-parent invite code</Text>
            <Text style={styles.codeBig}>{code}</Text>
            <Text style={styles.modalSub}>Expires in 24 hours. Share it with your co-parent — they enter it on the join-family screen when they sign up.</Text>
            <Pressable onPress={onCopy} style={styles.copyBtn}>
              <Text style={styles.copyText}>{copied ? '✓ Copied' : 'Copy code'}</Text>
            </Pressable>
            <Pressable onPress={() => setCode(null)} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  section: { paddingVertical: 8 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' },
  value: { fontSize: 16, marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleLabel: { fontSize: 15, flex: 1 },
  stub: { padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 },
  stubText: { color: '#6b7280' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, gap: 12, alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  codeBig: { fontSize: 36, fontWeight: '700', letterSpacing: 8, color: '#111827', marginVertical: 8 },
  modalSub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  copyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#3b82f6' },
  copyText: { color: '#fff', fontWeight: '600' },
  doneBtn: { paddingVertical: 8 },
  doneText: { color: '#6b7280', fontWeight: '500' },
});
