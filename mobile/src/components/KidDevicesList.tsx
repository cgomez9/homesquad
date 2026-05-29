import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';
import { revokeKidDevice } from '../lib/pairing';

export type KidDevice = { id: string; device_name: string; last_seen_at: string };

type Props = {
  kidId: string;
  devices: KidDevice[];
  onPair: (kidId: string) => void;
  onChanged: () => void;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function KidDevicesList({ kidId, devices, onPair, onChanged }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function confirmRevoke(d: KidDevice) {
    Alert.alert(
      'Unpair this device?',
      `${d.device_name} will be signed out and need a new code to use HomeSquad again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeKidDevice(d.id);
              onChanged();
            } catch (e) {
              Alert.alert('Could not unpair', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Devices</Text>
      {devices.length === 0 && <Text style={styles.empty}>No devices paired yet.</Text>}
      {devices.map((d) => (
        <View key={d.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{d.device_name}</Text>
            <Text style={styles.meta}>Last seen {formatRelative(d.last_seen_at)}</Text>
          </View>
          <Pressable testID={`revoke-${d.id}`} onPress={() => confirmRevoke(d)} style={styles.revokeBtn}>
            <Text style={styles.revokeText}>Unpair</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onPair(kidId)} style={styles.pairBtn}>
        <Text style={styles.pairBtnText}>+ Pair a new device</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, gap: spacing.sm },
    label: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      color: colors.textMuted,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    empty: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.body },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    name: { fontFamily: typography.fontFamilyBold, color: colors.text, fontSize: typography.body },
    meta: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.tiny, marginTop: 2 },
    revokeBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.bg },
    revokeText: { fontFamily: typography.fontFamilyBold, color: colors.error, fontSize: typography.tiny },
    pairBtn: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
    pairBtnText: { fontFamily: typography.fontFamilyBold, color: colors.primary, fontSize: typography.body },
  });
