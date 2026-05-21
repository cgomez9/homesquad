import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import { OnboardingStepper } from '../../src/components/OnboardingStepper';
import { TidePoolBackground } from '../../src/components/TidePool';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function AddKidScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      router.replace('/(onboarding)/add-chores');
    }
  }

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.stepperWrap}>
          <OnboardingStepper
            steps={[t('auth.steps.family'), t('auth.steps.kids'), t('auth.steps.chores')]}
            current={1}
          />
        </View>

        <Text style={styles.title}>{t('auth.addKid.title')}</Text>

        <View style={styles.card}>
          <TextField
            label={t('auth.addKid.name')}
            value={kidName}
            onChangeText={setKidName}
            placeholder={t('auth.addKid.namePlaceholder')}
          />
          <Text style={styles.sectionLabel}>{t('auth.addKid.avatar')}</Text>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          <View style={styles.pinWrap}>
            <TextField
              label={t('auth.addKid.pin')}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.submitWrap}>
            <Button label={t('auth.addKid.addAnother')} onPress={() => addKid('another')} loading={loading} />
            <Button
              label={t('auth.addKid.finish')}
              onPress={() => addKid('finish')}
              loading={loading}
              variant="secondary"
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </View>
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
  pinWrap: { marginTop: spacing.md },
  error: {
    color: colors.error,
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  submitWrap: { marginTop: spacing.lg },
});
