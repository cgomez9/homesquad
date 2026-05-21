import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingStepper } from '../../src/components/OnboardingStepper';
import { TidePoolBackground } from '../../src/components/TidePool';
import { supabase } from '../../src/lib/supabase';
import type { Recurrence } from '../../src/lib/recurrence';
import { radii, spacing, typography, useTheme, type Palette } from '../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

type PackChore = {
  emoji: string;
  titleKey: string; // resolves under auth.addChores.chores.<titleKey>
  starValue: number;
  recurrence: Recurrence;
};

type Pack = {
  id: 'morning' | 'tidy' | 'pet' | 'school';
  emoji: string;
  bg: string;
  chores: PackChore[];
};

// Pack and chore content is fixed; titles + pack names live in i18n.
const PACKS: Pack[] = [
  {
    id: 'morning',
    emoji: '🌅',
    bg: '#FDE68A',
    chores: [
      { emoji: '🛏', titleKey: 'makeBed', starValue: 10, recurrence: { type: 'daily' } },
      { emoji: '🪥', titleKey: 'brushTeeth', starValue: 10, recurrence: { type: 'daily' } },
      { emoji: '🚿', titleKey: 'takeShower', starValue: 10, recurrence: { type: 'daily' } },
    ],
  },
  {
    id: 'tidy',
    emoji: '🧺',
    bg: '#BBF7D0',
    chores: [
      { emoji: '🧺', titleKey: 'tidyRoom', starValue: 10, recurrence: { type: 'daily' } },
      { emoji: '🧦', titleKey: 'putClothesAway', starValue: 10, recurrence: { type: 'daily' } },
    ],
  },
  {
    id: 'pet',
    emoji: '🐶',
    bg: '#FDBA74',
    chores: [
      { emoji: '🐶', titleKey: 'feedPet', starValue: 10, recurrence: { type: 'daily' } },
      { emoji: '🦴', titleKey: 'walkPet', starValue: 10, recurrence: { type: 'daily' } },
    ],
  },
  {
    id: 'school',
    emoji: '📚',
    bg: '#C4B5FD',
    chores: [
      // Mon-Fri = days [1..5] (0=Sun in our Recurrence schema).
      { emoji: '📚', titleKey: 'homework', starValue: 15, recurrence: { type: 'weekly', days: [1, 2, 3, 4, 5] } },
      { emoji: '🍽', titleKey: 'setTable', starValue: 10, recurrence: { type: 'daily' } },
      // Once a week — Saturday.
      { emoji: '🗑', titleKey: 'takeOutTrash', starValue: 15, recurrence: { type: 'weekly', days: [6] } },
    ],
  },
];

export default function AddChoresScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Pack['id']>>(new Set());
  const [loading, setLoading] = useState(false);

  const totalChores = useMemo(
    () => PACKS.filter((p) => selected.has(p.id)).reduce((sum, p) => sum + p.chores.length, 0),
    [selected],
  );

  function togglePack(id: Pack['id']) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSelected(new Set());
  }

  async function submit() {
    if (totalChores === 0) {
      router.replace('/(app)');
      return;
    }
    setLoading(true);

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('type', 'parent')
      .maybeSingle();
    if (profileErr || !profile) {
      setLoading(false);
      router.replace('/(app)');
      return;
    }
    const familyId = (profile as { family_id: string }).family_id;

    const choresToCreate = PACKS.filter((p) => selected.has(p.id)).flatMap((p) =>
      p.chores.map((c) => ({
        title: t(`auth.addChores.chores.${c.titleKey}`),
        starValue: c.starValue,
        recurrence: c.recurrence,
      })),
    );

    let failed = 0;
    for (const c of choresToCreate) {
      const { error } = await supabase.rpc('create_chore', {
        family_id: familyId,
        title: c.title,
        description: null as unknown as string,
        star_value: c.starValue,
        assignee_profile_id: null as unknown as string,
        verification_mode: 'approval',
        recurrence: c.recurrence,
      });
      if (error) failed += 1;
    }

    setLoading(false);
    if (failed > 0) {
      Alert.alert(t('auth.addChores.errorPartial'));
    }
    router.replace('/(app)');
  }

  const counterText =
    selected.size === 0
      ? t('auth.addChores.counterEmpty')
      : t('auth.addChores.counter', {
          packsText: t('auth.addChores.packsCount', { count: selected.size }),
          choresText: t('auth.addChores.choresCount', { count: totalChores }),
        });

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.stepperWrap}>
          <OnboardingStepper
            steps={[t('auth.steps.family'), t('auth.steps.kids'), t('auth.steps.chores')]}
            current={2}
          />
        </View>

        <Text style={styles.title}>{t('auth.addChores.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.addChores.subtitle')}</Text>

        <View style={styles.counter}>
          <Text style={styles.counterTxt}>{counterText}</Text>
          {selected.size > 0 ? (
            <Pressable onPress={reset} hitSlop={8} accessibilityRole="button">
              <Text style={styles.counterReset}>{t('auth.addChores.reset')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.packs}>
          {PACKS.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              selected={selected.has(p.id)}
              onToggle={() => togglePack(p.id)}
            />
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={loading}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              pressed && !loading && { backgroundColor: colors.primaryDark },
              loading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.ctaText}>
              {t('auth.addChores.submit', { count: totalChores })}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(app)')} style={styles.skipBtn} hitSlop={8}>
            <Text style={styles.skipText}>{t('auth.addChores.skip')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function PackCard({
  pack,
  selected,
  onToggle,
}: {
  pack: Pack;
  selected: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const scale = useMemo(() => new Animated.Value(1), []);

  return (
    <Pressable
      onPress={onToggle}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()
      }
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t(`auth.addChores.packs.${pack.id}`)}
    >
      <Animated.View style={[styles.pack, selected && styles.packOn, { transform: [{ scale }] }]}>
        <View style={styles.packTop}>
          <View style={[styles.packEmoji, { backgroundColor: pack.bg }]}>
            <Text style={styles.packEmojiTxt}>{pack.emoji}</Text>
          </View>
          <View style={styles.packMain}>
            <Text style={styles.packTitle}>{t(`auth.addChores.packs.${pack.id}`)}</Text>
            <Text style={styles.packSub}>
              {t('auth.addChores.choresCount', { count: pack.chores.length })}
            </Text>
          </View>
          <View style={[styles.packBtn, selected && styles.packBtnOn]}>
            <Text style={[styles.packBtnTxt, selected && styles.packBtnTxtOn]}>
              {selected ? '✓' : '+'}
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          {pack.chores.map((c) => (
            <View key={c.titleKey} style={[styles.chip, selected && styles.chipOn]}>
              <Text style={styles.chipEmoji}>{c.emoji}</Text>
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {t(`auth.addChores.chores.${c.titleKey}`)}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </Pressable>
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
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.small,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: spacing.md,
  },

  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(14,165,164,0.10)',
    borderRadius: radii.lg,
    marginTop: spacing.md,
  },
  counterTxt: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small,
    color: colors.primaryDark,
    flex: 1,
  },
  counterReset: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.small,
    color: colors.primary,
  },

  packs: { marginTop: spacing.md, gap: spacing.md },
  pack: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.md + 2,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#0F766E',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  packOn: { borderColor: 'rgba(14,165,164,0.45)', backgroundColor: '#F2FBFA' },

  packTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  packEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packEmojiTxt: { fontSize: 24 },
  packMain: { flex: 1, minWidth: 0 },
  packTitle: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 16,
    color: colors.text,
  },
  packSub: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  packBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  packBtnOn: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(14,165,164,0.45)',
    shadowOpacity: 0,
    elevation: 0,
  },
  packBtnTxt: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 18,
    color: '#fff',
    marginTop: -2,
  },
  packBtnTxtOn: { color: colors.primary, fontSize: 14, marginTop: 0 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.md - 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1ECE0',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  chipOn: { backgroundColor: 'rgba(14,165,164,0.12)' },
  chipEmoji: { fontSize: 12 },
  chipText: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny + 0.5,
    color: colors.text,
  },
  chipTextOn: { color: colors.primaryDark },

  footer: { marginTop: spacing.lg },
  cta: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ctaText: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 16,
    color: '#fff',
  },
  skipBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  skipText: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.body,
    color: colors.textMuted,
  },
});
