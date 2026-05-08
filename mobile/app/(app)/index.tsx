import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../src/constants/avatars';
import { PinPad } from '../../src/components/PinPad';

type Profile = {
  id: string;
  type: 'parent' | 'kid';
  display_name: string;
  avatar_id: number;
  pin_hash: string | null;
};

export default function AvatarLockScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,type,display_name,avatar_id,pin_hash')
        .order('type', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) setError(error.message);
      else setProfiles((data as Profile[]) ?? []);
    })();
  }, []);

  function selectProfile(p: Profile) {
    if (p.type === 'parent') {
      router.replace('/(app)/parent' as never);
      return;
    }
    if (p.pin_hash && p.pin_hash.length > 0) {
      setPinError(null);
      setPinTarget(p);
      return;
    }
    router.replace(`/(app)/kid/${p.id}` as never);
  }

  function onPinSubmit(entered: string) {
    if (!pinTarget) return;
    if (entered === pinTarget.pin_hash) {
      setPinTarget(null);
      router.replace(`/(app)/kid/${pinTarget.id}` as never);
    } else {
      setPinError('Wrong PIN');
    }
  }

  if (error) return <View style={styles.center}><Text style={styles.err}>{error}</Text></View>;
  if (!profiles) return <View style={styles.center}><ActivityIndicator /></View>;

  const parents = profiles.filter((p) => p.type === 'parent');
  const kids = profiles.filter((p) => p.type === 'kid');

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Who's playing?</Text>
      <Text style={styles.subtitle}>Tap your tile</Text>

      <Text style={styles.section}>Parents</Text>
      <View style={styles.row}>
        {parents.map((p) => (
          <Tile key={p.id} profile={p} small onPress={() => selectProfile(p)} />
        ))}
      </View>

      <View style={styles.divider} />

      <Text style={styles.section}>Kids</Text>
      <View style={styles.row}>
        {kids.map((p) => (
          <Tile key={p.id} profile={p} onPress={() => selectProfile(p)} />
        ))}
      </View>

      <Modal visible={!!pinTarget} transparent animationType="fade" onRequestClose={() => setPinTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <PinPad
              onSubmit={onPinSubmit}
              onCancel={() => setPinTarget(null)}
              error={pinError ?? undefined}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Tile({ profile, small, onPress }: { profile: Profile; small?: boolean; onPress: () => void }) {
  const a = AVATARS[profile.avatar_id as AvatarId];
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={[styles.av, small && styles.avSm, { backgroundColor: a.bg }]}>
        <Text style={small ? styles.emojiSm : styles.emoji}>{a.emoji}</Text>
      </View>
      <Text style={styles.name}>{profile.display_name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: '#ef4444', textAlign: 'center' },
  greeting: { fontSize: 24, fontWeight: '700', textAlign: 'center', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  section: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tile: { alignItems: 'center', gap: 6 },
  av: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avSm: { width: 56, height: 56, borderRadius: 28 },
  emoji: { fontSize: 44 },
  emojiSm: { fontSize: 28 },
  name: { fontSize: 14, fontWeight: '500', color: '#111827' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 20 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, minWidth: 280 },
});
