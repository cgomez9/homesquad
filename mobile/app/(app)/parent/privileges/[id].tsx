import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Animated, Platform, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { RewardIconPicker } from '../../../../src/components/RewardIconPicker';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography } from '../../../../src/theme';
import type { RewardIconId } from '../../../../src/constants/rewardIcons';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function EditPrivilege() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('3');
  const [iconId, setIconId] = useState<RewardIconId>(1);

  const { data: privilege, isLoading } = useQuery({
    queryKey: ['privilege', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('privileges')
        .select('id, title, description, token_cost, icon_id')
        .eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!privilege) return;
    setTitle(privilege.title);
    setDescription(privilege.description ?? '');
    setCost(String(privilege.token_cost));
    setIconId(privilege.icon_id as RewardIconId);
  }, [privilege]);

  const update = useMutation({
    mutationFn: async () => {
      const tc = parseInt(cost, 10);
      if (!Number.isFinite(tc) || tc < 1 || tc > 9999) throw new Error(t('forms.errTokenCost'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('update_privilege', {
        privilege_id: id,
        title: title.trim(),
        description: (description.trim() || null) as unknown as string,
        token_cost: tc,
        icon_id: iconId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-privileges'] });
      qc.invalidateQueries({ queryKey: ['privilege', id] });
      router.back();
    },
    onError: (e) => Alert.alert(t('forms.couldNotUpdatePrivilege'), (e as Error).message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('archive_privilege', { privilege_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-privileges'] });
      router.back();
    },
  });

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{t('forms.editPrivilege')}</Text>
        </View>
        {isLoading || !privilege ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : (
          <View style={styles.card}>
            <TextField label={t('forms.title')} value={title} onChangeText={setTitle} />
            <TextField label={t('forms.descriptionOptional')} value={description} onChangeText={setDescription} />
            <TextField label={t('forms.tokenCost')} value={cost} onChangeText={setCost} keyboardType="number-pad" />
            <RewardIconPicker value={iconId} onChange={setIconId} />
            <View style={styles.actions}>
              <Button label={t('forms.saveChanges')} loading={update.isPending} onPress={() => update.mutate()} />
              <Button label={t('common.archive')} variant="secondary" onPress={() => archive.mutate()} style={{ marginTop: spacing.sm }} />
              <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
        )}
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
