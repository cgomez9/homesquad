import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import { TidePoolBackground } from '../../src/components/TidePool';
import type { AvatarId } from '../../src/constants/avatars';
import { supabase } from '../../src/lib/supabase';
import { refetchFamily } from '../../src/hooks/useFamily';
import { spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function JoinFamilyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!/^[0-9]{6}$/.test(code.trim())) return setError(t('auth.joinFamily.errCode'));
    if (name.trim().length === 0) return setError(t('auth.createFamily.errorParentNameRequired'));
    setLoading(true);
    const { error } = await supabase.rpc('accept_invite', {
      code: code.trim(),
      display_name: name.trim(),
      avatar_id: avatar,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    refetchFamily();
    router.replace('/(app)' as never);
  }

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{t('auth.joinFamily.title')}</Text>
        </View>
        <Text style={styles.sub}>{t('auth.joinFamily.subtitle')}</Text>

        <View style={styles.card}>
          <TextField label={t('auth.joinFamily.codeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder={t('auth.joinFamily.codePlaceholder')} />
          <TextField label={t('auth.joinFamily.nameLabel')} value={name} onChangeText={setName} placeholder={t('auth.joinFamily.namePlaceholder')} />
          <Text style={styles.label}>{t('auth.createFamily.pickAvatar')}</Text>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button label={t('auth.joinFamily.submit')} onPress={onSubmit} loading={loading} />
            <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, paddingTop: TOP_INSET, flexGrow: 1 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  back: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F766E', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  backIcon: { fontSize: 19, color: colors.text, fontFamily: typography.fontFamilyBold },
  h1: { fontFamily: typography.fontFamilyBold, fontSize: 26, color: colors.text, letterSpacing: -0.3 },
  sub: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, gap: spacing.md,
    shadowColor: '#0F766E', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5,
  },
  label: {
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
  actions: { marginTop: spacing.md },
});
