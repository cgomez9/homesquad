import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import i18n from '../../../../src/i18n';
import { supabase } from '../../../../src/lib/supabase';
import { colors, spacing, radii, typography } from '../../../../src/theme';

export default function CreateGoalScreen() {
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
    const { error } = await supabase.rpc('create_family_goal', {
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
    <SafeAreaView style={styles.root}>
      <Text style={styles.heading}>{i18n.t('goals.createTitle')}</Text>

      <Text style={styles.label}>{i18n.t('goals.titleLabel')}</Text>
      <TextInput
        testID="goal-title-input"
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={i18n.t('goals.titlePlaceholder')}
      />

      <Text style={styles.label}>{i18n.t('goals.targetLabel')}</Text>
      <TextInput
        testID="goal-target-input"
        style={styles.input}
        value={targetStr}
        onChangeText={setTargetStr}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>{i18n.t('goals.descriptionLabel')}</Text>
      <TextInput
        testID="goal-description-input"
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={i18n.t('goals.descriptionPlaceholder')}
        multiline
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  heading:        { fontSize: typography.h1, fontFamily: typography.fontFamilyBold,
                    color: colors.text, marginBottom: spacing.lg },
  label:          { fontSize: typography.small, color: colors.textMuted,
                    marginTop: spacing.md, marginBottom: spacing.xs,
                    fontFamily: typography.fontFamilyBold },
  input:          { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
                    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                    backgroundColor: colors.surface, color: colors.text,
                    fontFamily: typography.fontFamily, fontSize: typography.body },
  multiline:      { minHeight: 80, textAlignVertical: 'top' },
  error:          { color: colors.error, fontSize: typography.small,
                    fontFamily: typography.fontFamily, marginTop: spacing.sm },
  button:         { backgroundColor: colors.primary, borderRadius: radii.pill,
                    paddingVertical: spacing.md, alignItems: 'center',
                    marginTop: spacing.xl },
  buttonDisabled: { backgroundColor: colors.primaryDark, opacity: 0.5 },
  buttonText:     { color: colors.surface, fontFamily: typography.fontFamilyBold,
                    fontSize: typography.body },
});
