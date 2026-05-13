import { useState } from 'react';
import { Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { refetchFamily } from '../../src/hooks/useFamily';
import { signOut } from '../../src/lib/auth';
import { colors, spacing, typography } from '../../src/theme';

export default function CreateFamilyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (familyName.trim().length === 0) return setError(t('auth.createFamily.errorFamilyNameRequired'));
    if (parentName.trim().length === 0) return setError(t('auth.createFamily.errorParentNameRequired'));
    setLoading(true);
    const { error: rpcErr } = await supabase.rpc('create_family', {
      family_name: familyName.trim(),
      parent_name: parentName.trim(),
      parent_avatar: avatar,
    });
    if (rpcErr) {
      setLoading(false);
      setError(rpcErr.message);
      return;
    }
    refetchFamily();

    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('type', 'parent')
      .maybeSingle();
    if (profile) {
      const { error: seedErr } = await supabase.rpc('seed_starter_chores', {
        family_id: (profile as { family_id: string }).family_id,
      });
      if (seedErr) console.warn('seed_starter_chores failed:', seedErr.message);
    }

    setLoading(false);
    router.replace('/(onboarding)/add-kid');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('auth.createFamily.title')}</Text>
      <TextField
        label={t('auth.createFamily.familyName')}
        value={familyName}
        onChangeText={setFamilyName}
        placeholder={t('auth.createFamily.familyNamePlaceholder')}
      />
      <TextField
        label={t('auth.createFamily.parentName')}
        value={parentName}
        onChangeText={setParentName}
        placeholder={t('auth.createFamily.parentNamePlaceholder')}
      />
      <Text style={styles.sectionLabel}>{t('auth.createFamily.pickAvatar')}</Text>
      <AvatarPicker value={avatar} onChange={setAvatar} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={t('auth.createFamily.submit')} onPress={onSubmit} loading={loading} />
      <Pressable onPress={() => router.push('/(onboarding)/join-family' as never)} style={styles.joinLink}>
        <Text style={styles.joinLinkText}>{t('auth.createFamily.joinLink')}</Text>
      </Pressable>
      <Pressable onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutText}>{t('auth.createFamily.signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: 64, gap: spacing.xs, backgroundColor: colors.bg, flexGrow: 1 },
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
  },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamily,
    fontSize: typography.small,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  signOut: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  signOutText: { color: colors.textMuted, fontSize: typography.small, fontFamily: typography.fontFamily },
  joinLink: { paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  joinLinkText: { color: colors.primary, fontSize: typography.body, fontFamily: typography.fontFamilySemi },
});
