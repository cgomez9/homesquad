import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Animated, Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { VerificationModePicker, VerificationMode } from '../../../../src/components/VerificationModePicker';
import { AssigneePicker, Assignee } from '../../../../src/components/AssigneePicker';
import { RecurrencePicker } from '../../../../src/components/RecurrencePicker';
import { TaskKindPicker, TaskKind } from '../../../../src/components/TaskKindPicker';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography } from '../../../../src/theme';
import type { Recurrence } from '../../../../src/lib/recurrence';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function NewChore() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [kind, setKind] = useState<TaskKind>('chore');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stars, setStars] = useState('10');
  const [tokens, setTokens] = useState('1');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [mode, setMode] = useState<VerificationMode>('approval');
  const [recurrence, setRecurrence] = useState<Recurrence>({ type: 'daily' });
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [skillIntroDismissed, setSkillIntroDismissed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('homesquad.skill_tip_seen').then((v) => {
      setSkillIntroDismissed(v === '1');
    });
  }, []);

  async function dismissSkillIntro() {
    setSkillIntroDismissed(true);
    await AsyncStorage.setItem('homesquad.skill_tip_seen', '1');
  }

  const { data: kids } = useQuery({
    queryKey: ['kids'],
    queryFn: async (): Promise<Assignee[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_id, family_id')
        .eq('type', 'kid')
        .order('created_at');
      if (error) throw error;
      if (data && data.length > 0) setFamilyId((data[0] as { family_id: string }).family_id);
      return (data ?? []) as Assignee[];
    },
  });

  // Fallback: derive family_id from a parent profile if there are no kids yet.
  useEffect(() => {
    if (familyId) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('family_id').eq('type', 'parent').limit(1).maybeSingle();
      if (data) setFamilyId((data as { family_id: string }).family_id);
    })();
  }, [familyId]);

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error(t('forms.errNoFamily'));
      const isSkill = kind === 'skill';
      const sv = isSkill ? null : parseInt(stars, 10);
      const tv = isSkill ? parseInt(tokens, 10) : null;
      if (!isSkill && (!Number.isFinite(sv as number) || (sv as number) < 1 || (sv as number) > 999)) {
        throw new Error(t('forms.errStarValue'));
      }
      if (isSkill && (!Number.isFinite(tv as number) || (tv as number) < 1 || (tv as number) > 999)) {
        throw new Error(t('forms.errTokenValue'));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('create_chore', {
        family_id: familyId as string,
        title: title.trim(),
        description: (description.trim() || null) as string,
        star_value: sv,
        assignee_profile_id: assigneeId as string,
        verification_mode: mode,
        recurrence,
        kind,
        token_value: tv,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-chores'] });
      router.back();
    },
    onError: (e) => Alert.alert(t('forms.couldNotCreateChore'), (e as Error).message),
  });

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{t('forms.newChore')}</Text>
        </View>
        <View style={styles.card}>
          <TaskKindPicker value={kind} onChange={setKind} />
          {kind === 'skill' && !skillIntroDismissed && (
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>{t('forms.skillIntro.title')}</Text>
              <Text style={styles.introBody}>{t('forms.skillIntro.body')}</Text>
              <Pressable onPress={dismissSkillIntro} style={styles.introBtn} accessibilityRole="button">
                <Text style={styles.introBtnText}>{t('forms.skillIntro.gotIt')}</Text>
              </Pressable>
            </View>
          )}
          <TextField
            label={t('forms.title')}
            value={title}
            onChangeText={setTitle}
            placeholder={kind === 'skill' ? t('forms.skillTitlePlaceholder') : t('forms.choreTitlePlaceholder')}
          />
          <TextField label={t('forms.descriptionOptional')} value={description} onChangeText={setDescription} />
          {kind === 'chore' ? (
            <TextField label={t('forms.stars')} value={stars} onChangeText={setStars} keyboardType="number-pad" />
          ) : (
            <>
              <TextField label={t('forms.tokens')} value={tokens} onChangeText={setTokens} keyboardType="number-pad" />
              <Text style={styles.kindHint}>{t('forms.skillTaskHint')}</Text>
            </>
          )}
          <VerificationModePicker value={mode} onChange={setMode} />
          <AssigneePicker kids={kids ?? []} value={assigneeId} onChange={setAssigneeId} />
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
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
    kindHint: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.tiny,
      color: colors.textMuted,
      lineHeight: 16,
      marginTop: -spacing.xs,
    },
    introCard: {
      backgroundColor: '#EAF3FF',
      borderRadius: 16,
      padding: spacing.lg,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: '#C7DBF4',
    },
    introTitle: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.body,
      color: '#1F548F',
    },
    introBody: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: '#2C5E8E',
      lineHeight: 18,
    },
    introBtn: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      backgroundColor: '#1F548F',
      marginTop: spacing.xs,
    },
    introBtnText: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.small,
      color: '#fff',
    },
  });
