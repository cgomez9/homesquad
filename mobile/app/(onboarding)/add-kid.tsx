import { useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

export default function AddKidScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [kidName, setKidName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(2);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addKid(then: 'another' | 'finish') {
    setError(null);
    if (kidName.trim().length === 0) return setError(t('auth.addKid.errorNameRequired'));
    if (pin.length > 0 && !/^\d{4}$/.test(pin)) return setError(t('auth.addKid.errorPinFormat'));
    setLoading(true);
    const { error: rpcErr } = await supabase.rpc('create_kid_profile', {
      kid_name: kidName.trim(),
      avatar,
      pin_hash: pin || undefined,
    });
    setLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    if (then === 'another') {
      setKidName('');
      setPin('');
    } else {
      router.replace('/(app)');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('auth.addKid.title')}</Text>
      <TextField
        label={t('auth.addKid.name')}
        value={kidName}
        onChangeText={setKidName}
        placeholder={t('auth.addKid.namePlaceholder')}
      />
      <Text style={styles.sectionLabel}>{t('auth.addKid.avatar')}</Text>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      <TextField
        label={t('auth.addKid.pin')}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        maxLength={4}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={t('auth.addKid.addAnother')} onPress={() => addKid('another')} loading={loading} />
      <Button
        label={t('auth.addKid.finish')}
        onPress={() => addKid('finish')}
        loading={loading}
        variant="secondary"
        style={{ marginTop: spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: 64, backgroundColor: colors.bg, flexGrow: 1 },
  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.h1,
    color: colors.text,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  sectionLabel: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: typography.small,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
});
