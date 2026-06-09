import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Animated, Platform, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { RewardIconPicker } from '../../../../src/components/RewardIconPicker';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography } from '../../../../src/theme';
import type { RewardIconId } from '../../../../src/constants/rewardIcons';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function NewPrivilege() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    preset_title?: string;
    preset_description?: string;
    preset_token_cost?: string;
    preset_icon_id?: string;
  }>();

  const [title, setTitle] = useState(params.preset_title ?? '');
  const [description, setDescription] = useState(params.preset_description ?? '');
  const [cost, setCost] = useState(params.preset_token_cost ?? '3');
  const [iconId, setIconId] = useState<RewardIconId>(
    ((parseInt(params.preset_icon_id ?? '1', 10) || 1) as RewardIconId)
  );
  const [familyId, setFamilyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('family_id').eq('type', 'parent').limit(1).maybeSingle();
      if (data) setFamilyId((data as { family_id: string }).family_id);
    })();
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error(t('forms.errNoFamily'));
      const tc = parseInt(cost, 10);
      if (!Number.isFinite(tc) || tc < 1 || tc > 9999) throw new Error(t('forms.errTokenCost'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('create_privilege', {
        family_id: familyId,
        title: title.trim(),
        description: (description.trim() || null) as unknown as string,
        token_cost: tc,
        icon_id: iconId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-privileges'] });
      router.back();
    },
    onError: (e) => Alert.alert(t('forms.couldNotCreatePrivilege'), (e as Error).message),
  });

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{t('forms.newPrivilege')}</Text>
        </View>
        <View style={styles.card}>
          <TextField label={t('forms.title')} value={title} onChangeText={setTitle} placeholder={t('forms.privilegeTitlePlaceholder')} />
          <TextField label={t('forms.descriptionOptional')} value={description} onChangeText={setDescription} />
          <TextField label={t('forms.tokenCost')} value={cost} onChangeText={setCost} keyboardType="number-pad" />
          <RewardIconPicker value={iconId} onChange={setIconId} />
          <View style={styles.actions}>
            <Button label={t('forms.save')} loading={create.isPending} onPress={() => create.mutate()} />
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
    topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    back: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#0F766E', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    },
    backIcon: { fontSize: 19, color: colors.text, fontFamily: typography.fontFamilyBold },
    h1: { fontFamily: typography.fontFamilyBold, fontSize: 26, color: colors.text, letterSpacing: -0.3 },
    card: {
      backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, gap: spacing.md,
      shadowColor: '#0F766E', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5,
    },
    actions: { marginTop: spacing.md },
  });
