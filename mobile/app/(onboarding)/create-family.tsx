import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import { OnboardingStepper } from '../../src/components/OnboardingStepper';
import { TidePoolBackground } from '../../src/components/TidePool';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { refetchFamily } from '../../src/hooks/useFamily';
import { signOut } from '../../src/lib/auth';
import { spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function CreateFamilyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

    setLoading(false);
    router.replace('/(onboarding)/add-kid');
  }

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.stepperWrap}>
          <OnboardingStepper
            steps={[t('auth.steps.family'), t('auth.steps.kids'), t('auth.steps.chores')]}
            current={0}
          />
        </View>

        <Text style={styles.title}>{t('auth.createFamily.title')}</Text>

        <View style={styles.card}>
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
          <View style={styles.submitWrap}>
            <Button label={t('auth.createFamily.submit')} onPress={onSubmit} loading={loading} />
          </View>
        </View>

        <Pressable onPress={() => router.push('/(onboarding)/join-family' as never)} style={styles.joinLink}>
          <Text style={styles.joinLinkText}>{t('auth.createFamily.joinLink')}</Text>
        </Pressable>
        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>{t('auth.createFamily.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, paddingTop: TOP_INSET, flexGrow: 1 },
  stepperWrap: { alignItems: 'center', marginBottom: spacing.xl },
  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.lg,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    shadowColor: '#0F766E',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  sectionLabel: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  submitWrap: { marginTop: spacing.lg },
  joinLink: { paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.lg },
  joinLinkText: { color: colors.primary, fontSize: typography.body, fontFamily: typography.fontFamilyBold },
  signOut: { paddingVertical: spacing.md, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: typography.small, fontFamily: typography.fontFamilySemi },
});
