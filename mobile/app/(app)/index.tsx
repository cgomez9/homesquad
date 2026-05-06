import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Button } from '../../src/components/Button';
import { supabase } from '../../src/lib/supabase';
import { signOut } from '../../src/lib/auth';
import { AVATARS, AvatarId } from '../../src/constants/avatars';

type Profile = { id: string; type: 'parent' | 'kid'; display_name: string; avatar_id: number };

export default function HomeScreen() {
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: families, error: e1 } = await supabase
        .from('families')
        .select('name')
        .limit(1)
        .maybeSingle();
      if (e1) return setError(e1.message);
      setFamilyName(families?.name ?? null);

      const { data: ps, error: e2 } = await supabase
        .from('profiles')
        .select('id, type, display_name, avatar_id');
      if (e2) return setError(e2.message);
      setProfiles(ps ?? []);
    })();
  }, []);

  if (error) return <View style={styles.container}><Text style={styles.error}>{error}</Text></View>;
  if (!profiles) return <View style={styles.container}><ActivityIndicator /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{familyName ?? 'Family'}</Text>
      <Text style={styles.subtitle}>{profiles.length} profile{profiles.length === 1 ? '' : 's'}</Text>
      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const a = AVATARS[item.avatar_id as AvatarId];
          return (
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: a.bg }]}>
                <Text style={styles.emoji}>{a.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.display_name}</Text>
                <Text style={styles.kind}>{item.type}</Text>
              </View>
            </View>
          );
        }}
      />
      <Button label="Sign out" onPress={signOut} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { textAlign: 'center', color: '#6b7280', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28 },
  name: { fontSize: 18, fontWeight: '500' },
  kind: { fontSize: 13, color: '#6b7280' },
  error: { color: '#ef4444', textAlign: 'center', marginTop: 64 },
});
