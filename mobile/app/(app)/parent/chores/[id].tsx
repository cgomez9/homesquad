import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Animated, Platform, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography } from '../../../../src/theme';
import type { Recurrence } from '../../../../src/lib/recurrence';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function EditChore() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [originalAssignee, setOriginalAssignee] = useState<string | null>(null);

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_id').eq('type', 'kid').order('created_at');
      if (error) throw error;
      return (data ?? []) as Assignee[];
    },
  });

  const { data: chore, isLoading } = useQuery({
    queryKey: ['chore', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chores')
        .select('id,title,description,star_value,assignee_profile_id,verification_mode,recurrence')
        .eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!chore) return;
    setTitle(chore.title);
    setDescription(chore.description ?? '');
    setStars(String(chore.star_value));
    setAssigneeId(chore.assignee_profile_id);
    setOriginalAssignee(chore.assignee_profile_id);
    setMode(chore.verification_mode as VerificationMode);
    setRecurrence(chore.recurrence as unknown as Recurrence);
  }, [chore]);

  const update = useMutation({
    mutationFn: async () => {
      const sv = parseInt(stars, 10);
      if (!Number.isFinite(sv) || sv < 1 || sv > 999) throw new Error(t('forms.errStarValue'));
      // Cast nullable RPC params to satisfy generated supabase-js types (same pattern as Task 23).
      const { error } = await supabase.rpc('update_chore', {
        chore_id: id,
        title: title.trim(),
        description: (description.trim() || null) as unknown as string,
        star_value: sv,
        clear_assignee: originalAssignee !== null && assigneeId === null,
        assignee_profile_id: assigneeId as unknown as string,
        verification_mode: mode,
        recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      qc.invalidateQueries({ queryKey: ['chore', id] });
      router.back();
    },
    onError: (e) => Alert.alert(t('forms.couldNotUpdateChore'), (e as Error).message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('archive_chore', { chore_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
  });

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{t('forms.editChore')}</Text>
        </View>
        {isLoading || !chore ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : (
          <View style={styles.card}>
            <TextField label={t('forms.title')} value={title} onChangeText={setTitle} />
            <TextField label={t('forms.descriptionOptional')} value={description} onChangeText={setDescription} />
            <TextField label={t('forms.stars')} value={stars} onChangeText={setStars} keyboardType="number-pad" />
            <VerificationModePicker value={mode} onChange={setMode} />
            <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
            <RecurrencePicker value={recurrence} onChange={setRecurrence} />
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
