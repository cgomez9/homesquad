// mobile/src/components/QuietHoursPicker.tsx
import React, { useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, TextInput } from 'react-native';
import i18n from '../i18n';
import { colors, spacing, radii, typography } from '../theme';

type Props = {
  enabled:   boolean;
  start:     string;   // "HH:MM"
  end:       string;
  timezone:  string;
  onSave:   (values: { enabled: boolean; start: string; end: string; timezone: string }) => Promise<void> | void;
};

export function QuietHoursPicker({ enabled, start, end, timezone, onSave }: Props) {
  const [vEnabled,  setVEnabled]  = useState(enabled);
  const [vStart,    setVStart]    = useState(start);
  const [vEnd,      setVEnd]      = useState(end);
  const [vTimezone, setVTimezone] = useState(timezone);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({ enabled: vEnabled, start: vStart, end: vEnd, timezone: vTimezone });
    } catch (e: any) {
      setError(e?.message ?? i18n.t('notifications.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{i18n.t('notifications.quietHoursLabel')}</Text>
      <Text style={styles.help}>{i18n.t('notifications.quietHoursHelp')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{i18n.t('notifications.enabledLabel')}</Text>
        <Switch
          testID="quiet-hours-toggle"
          value={vEnabled}
          onValueChange={setVEnabled}
        />
      </View>

      {vEnabled && (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.startLabel')}</Text>
            <TextInput
              testID="quiet-hours-start-picker"
              style={styles.input}
              value={vStart}
              onChangeText={setVStart}
              placeholder="21:00"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.endLabel')}</Text>
            <TextInput
              testID="quiet-hours-end-picker"
              style={styles.input}
              value={vEnd}
              onChangeText={setVEnd}
              placeholder="07:00"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{i18n.t('notifications.timezoneLabel')}</Text>
            <TextInput
              testID="quiet-hours-timezone-picker"
              style={styles.input}
              value={vTimezone}
              onChangeText={setVTimezone}
              autoCapitalize="none"
              placeholder="UTC"
            />
          </View>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        testID="quiet-hours-save"
        style={[styles.button, saving && styles.buttonDisabled]}
        disabled={saving}
        onPress={submit}
      >
        <Text style={styles.buttonText}>{saving ? '…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, gap: spacing.sm },
  heading:    { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
  help:       { fontSize: typography.small, color: colors.textMuted },
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label:      { fontSize: typography.body, color: colors.text, fontFamily: typography.fontFamily },
  input:      { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minWidth: 120, fontFamily: typography.fontFamily, color: colors.text },
  button:     { backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonDisabled: { backgroundColor: colors.primaryDark },
  buttonText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  error:      { color: colors.error, fontSize: typography.small },
});
