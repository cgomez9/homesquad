import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Animated, Platform, StatusBar } from 'react-native';
import { router } from 'expo-router';
import i18n from '../../../../src/i18n';
import { supabase } from '../../../../src/lib/supabase';
import { TidePoolBackground } from '../../../../src/components/TidePool';
import { useTheme, type Palette, spacing, radii, typography } from '../../../../src/theme';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function CreateGoalScreen() {
  const { colors, effective } = useTheme();
  const isDark = effective === 'dark';
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [title,       setTitle]       = useState('');
  const [targetStr,   setTargetStr]   = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [errorKey,    setErrorKey]    = useState<string | null>(null);

  const targetStars = parseInt(targetStr, 10);
  const canSubmit = title.trim().length > 0 && Number.isFinite(targetStars) && targetStars > 0;

  const submit = async () => {
    setSubmitting(true);
    setErrorKey(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('create_family_goal', {
      p_title: title.trim(),
      p_target_stars: targetStars,
      p_description: description.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setErrorKey(
        error.message === 'already_active'
          ? 'goals.errors.alreadyActive'
          : 'goals.errors.createFailed',
      );
      return;
    }
    router.back();
  };

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.h1}>{i18n.t('goals.createTitle')}</Text>
        </View>

        <Text style={styles.blurb}>{i18n.t('goals.purposeBlurb')}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{i18n.t('goals.titleLabel')}</Text>
          <TextInput
            testID="goal-title-input"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={i18n.t('goals.titlePlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoComplete="off"
            textContentType="none"
          />

          <Text style={styles.label}>{i18n.t('goals.targetLabel')}</Text>
          <TextInput
            testID="goal-target-input"
            style={styles.input}
            value={targetStr}
            onChangeText={setTargetStr}
            keyboardType="number-pad"
            autoComplete="off"
            textContentType="none"
          />

          <Text style={styles.label}>{i18n.t('goals.descriptionLabel')}</Text>
          <TextInput
            testID="goal-description-input"
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder={i18n.t('goals.descriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            autoComplete="off"
            textContentType="none"
          />

          {errorKey ? <Text style={styles.error}>{i18n.t(errorKey)}</Text> : null}

          <Pressable
            testID="goal-create-button"
            accessibilityState={{ disabled: !canSubmit || submitting }}
            disabled={!canSubmit || submitting}
            onPress={submit}
            style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {submitting ? '…' : i18n.t('goals.createButton')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, effective } = useTheme();
  const isDark = effective === 'dark';
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('common.back')}
        style={styles.back}
      >
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette, isDark: boolean) =>
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
    blurb: {
      fontFamily: typography.fontFamilySemi,
      fontSize: typography.small,
      color: colors.textMuted,
      marginBottom: spacing.lg,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl,
      shadowColor: '#0F766E', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5,
    },
    label: {
      fontSize: typography.small, color: colors.textMuted,
      marginTop: spacing.md, marginBottom: spacing.xs + 2,
      fontFamily: typography.fontFamilyBold,
    },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FBFDFC', color: colors.text,
      fontFamily: typography.fontFamilySemi, fontSize: typography.body,
    },
    multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: spacing.sm + 2 },
    error: {
      color: colors.error, fontSize: typography.small,
      fontFamily: typography.fontFamilySemi, marginTop: spacing.md,
    },
    button: {
      backgroundColor: colors.primary, borderRadius: radii.pill,
      paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl,
      shadowColor: colors.primary, shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4,
    },
    buttonDisabled: { backgroundColor: colors.primaryDark, opacity: 0.45, shadowOpacity: 0, elevation: 0 },
    buttonText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  });
