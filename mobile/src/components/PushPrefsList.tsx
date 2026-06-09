// mobile/src/components/PushPrefsList.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import i18n from '../i18n';
import { spacing, radii, typography, useTheme, type Palette } from '../theme';

export const EVENT_TYPES = [
  'chore_submitted',
  'chore_approved',
  'chore_rejected',
  'redemption_requested',
  'redemption_approved',
  'redemption_denied',
  'redemption_fulfilled',
  'privilege_redemption_requested',
  'privilege_redemption_approved',
  'privilege_redemption_denied',
  'privilege_redemption_fulfilled',
  'achievement_unlocked',
  'streak_milestone',
  'skill_streak_milestone',
  'goal_completed',
  'chore_reminder',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

type Props = {
  prefs: Partial<Record<EventType, boolean>>;
  onTogglePref: (event: EventType, next: boolean) => Promise<void> | void;
};

export function PushPrefsList({ prefs, onTogglePref }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const isEnabled = (e: EventType) => prefs[e] !== false; // missing = true

  const handle = async (e: EventType, next: boolean) => {
    setPending((p) => ({ ...p, [e]: true }));
    try {
      await onTogglePref(e, next);
    } finally {
      setPending((p) => {
        const { [e]: _, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{i18n.t('notifications.muteSectionTitle')}</Text>
      <Text style={styles.help}>{i18n.t('notifications.muteSectionHelp')}</Text>
      {EVENT_TYPES.map((e) => (
        <View key={e} style={styles.row}>
          <Text style={styles.label}>{i18n.t(`notifications.events.${e}`)}</Text>
          <Switch
            testID={`push-pref-toggle-${e}`}
            disabled={!!pending[e]}
            value={isEnabled(e)}
            onValueChange={(next) => handle(e, next)}
          />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root:    { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, marginTop: spacing.lg },
    heading: { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text },
    help:    { fontSize: typography.small, color: colors.textMuted, marginBottom: spacing.md },
    row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    label:   { fontSize: typography.body, color: colors.text, fontFamily: typography.fontFamily, flex: 1 },
  });
