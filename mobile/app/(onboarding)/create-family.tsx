import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';

export default function CreateFamilyScreen() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (familyName.trim().length === 0) return setError('Family name required');
    if (parentName.trim().length === 0) return setError('Your name is required');
    setLoading(true);
    const { error } = await supabase.rpc('create_family', {
      family_name: familyName.trim(),
      parent_name: parentName.trim(),
      parent_avatar: avatar,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/(onboarding)/add-kid');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create your family</Text>
      <TextField label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="The Smiths" />
      <TextField label="Your name (parent)" value={parentName} onChangeText={setParentName} placeholder="Alex" />
      <Text style={styles.label}>Pick your avatar</Text>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Create family" onPress={onSubmit} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  error: { color: '#ef4444', marginBottom: 12, textAlign: 'center' },
});
