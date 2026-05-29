import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../../../../../src/lib/supabase';
import { finishChore } from '../../../../../../src/lib/chores';

const MAX_RETRIES = 3;

export default function PhotoCapture() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profileId, instanceId } = useLocalSearchParams<{ profileId: string; instanceId: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('photo.permissionTitle'), t('photo.permissionBody'));
        router.back();
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
      if (result.canceled) router.back();
      else {
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
        );
        setUri(compressed.uri);
      }
    })();
  }, []);

  async function send() {
    if (!uri) return;
    setBusy(true); setError(null);

    const { data: inst, error: instErr } = await supabase
      .from('chore_instances')
      .select('family_id')
      .eq('id', instanceId)
      .single();
    if (instErr || !inst) { setError(instErr?.message ?? 'instance not found'); setBusy(false); return; }
    const path = `family/${inst.family_id}/chore-proofs/${instanceId}.jpg`;

    const arrayBuffer = await (await fetch(uri)).arrayBuffer();
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { error: upErr } = await supabase.storage
        .from('chore-proofs')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) { lastErr = null; break; }
      lastErr = upErr.message;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(3, attempt)));
    }
    if (lastErr) { setError(t('photo.uploadFailed', { error: lastErr })); setBusy(false); return; }

    const { data: { publicUrl } } = supabase.storage.from('chore-proofs').getPublicUrl(path);
    try {
      await finishChore(instanceId, profileId, publicUrl);
    } catch (rpcErr) {
      setError((rpcErr as Error).message);
      setBusy(false);
      return;
    }

    setBusy(false);
    router.replace(`/(app)/kid/${profileId}` as never);
  }

  if (!uri) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
      {error && <Text style={styles.err}>{error}</Text>}
      <View style={styles.row}>
        <Pressable onPress={async () => {
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
          if (!result.canceled) {
            const compressed = await ImageManipulator.manipulateAsync(
              result.assets[0].uri,
              [{ resize: { width: 1280 } }],
              { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
            );
            setUri(compressed.uri);
            setError(null);
          }
        }} style={[styles.btn, styles.btnSecondary]}>
          <Text style={styles.btnTextSecondary}>{t('photo.retake')}</Text>
        </Pressable>
        <Pressable onPress={send} disabled={busy} style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.5 }]}>
          <Text style={styles.btnText}>{busy ? t('photo.sending') : t('photo.send')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  preview: { flex: 1, marginBottom: 16, borderRadius: 12, backgroundColor: '#1f2937' },
  err: { color: '#fca5a5', textAlign: 'center', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#10b981' },
  btnSecondary: { backgroundColor: '#374151' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnTextSecondary: { color: '#fff', fontWeight: '500', fontSize: 16 },
});
