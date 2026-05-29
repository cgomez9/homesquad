import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { startDevicePairing } from '../lib/pairing';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';

type PairedPayload = { kid_id: string; device_name: string };

type Props = {
  kidId: string;
  visible: boolean;
  onClose: () => void;
  onPaired: (payload: PairedPayload) => void;
};

export function PairDeviceModal({ kidId, visible, onClose, onPaired }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setCode(null); setExpiresAt(null); return; }
    let cancelled = false;
    startDevicePairing(kidId)
      .then((res) => { if (!cancelled) { setCode(res.code); setExpiresAt(res.expiresAt); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to generate code'); });
    return () => { cancelled = true; };
  }, [visible, kidId]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const channel = supabase
      .channel(`pair-watch-${kidId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kid_devices', filter: `kid_id=eq.${kidId}` },
        (payload: { new: PairedPayload }) => onPaired(payload.new),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, kidId, onPaired]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0;
  const mm = Math.floor(remainingMs / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000).toString().padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.card}>
          <Text style={styles.title}>Pair this kid's device</Text>
          {!code && !error && <ActivityIndicator color={colors.primary} />}
          {code && (
            <>
              <QRCode value={code} size={180} backgroundColor="transparent" />
              <Text style={styles.code}>{code}</Text>
              <Text style={styles.timer}>{remainingMs > 0 ? `Code expires in ${mm}:${ss}` : 'Code expired'}</Text>
            </>
          )}
          {error && <Text style={styles.err}>{error}</Text>}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bg: { flex: 1, backgroundColor: 'rgba(6,40,38,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, alignItems: 'center', gap: spacing.lg, minWidth: 300 },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2 - 4, color: colors.text },
    code: { fontFamily: typography.fontFamilyBold, fontSize: 36, letterSpacing: 4, color: colors.text },
    timer: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.body },
    err: { color: colors.error, fontFamily: typography.fontFamilySemi, textAlign: 'center' },
    cancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.bg },
    cancelText: { fontFamily: typography.fontFamilyBold, color: colors.text },
  });
