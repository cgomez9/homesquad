import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { PairCodeInput } from '../../src/components/PairCodeInput';
import { signInAnonymouslyAndPair } from '../../src/lib/pairing';
import { TidePoolBackground } from '../../src/components/TidePool';
import { useTheme, type Palette, spacing, typography, radii } from '../../src/theme';

export default function PairThisDevice() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedOnce, setScannedOnce] = useState(false);

  async function submitCode(pairCode: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const kidId = await signInAnonymouslyAndPair(pairCode);
      router.replace(`/(app)/kid/${kidId}` as never);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code. Ask a parent for a new one.');
      setCode('');
      setScannedOnce(false);
      setSubmitting(false);
    }
  }

  function onBarCodeScanned({ data }: { data: string }) {
    if (scannedOnce) return;
    const cleaned = data.replace(/\D/g, '');
    if (cleaned.length === 6) {
      setScannedOnce(true);
      setCode(cleaned);
      submitCode(cleaned);
    }
  }

  return (
    <View style={styles.screen}>
      <TidePoolBackground />
      <View style={styles.content}>
        <Text style={styles.title}>Pair this device</Text>
        <Text style={styles.subtitle}>Ask a parent to open Settings → Kids → Pair a device.</Text>

        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={submitting ? undefined : onBarCodeScanned}
          />
        ) : (
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Enable camera to scan</Text>
          </Pressable>
        )}

        <View style={styles.divider}>
          <Text style={styles.dividerText}>or type the code</Text>
        </View>

        <PairCodeInput value={code} onChange={setCode} onSubmit={submitCode} />

        {submitting && <ActivityIndicator color={colors.primary} style={styles.spinner} />}
        {error && <Text style={styles.err}>{error}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: Platform.OS === 'android' ? 80 : 60,
      gap: spacing.lg,
    },
    title: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    subtitle: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },
    camera: { height: 240, borderRadius: radii.lg, overflow: 'hidden', marginTop: spacing.md },
    permBtn: {
      height: 240,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    permBtnText: { fontFamily: typography.fontFamilySemi, color: colors.primary },
    divider: { alignItems: 'center', marginTop: spacing.md },
    dividerText: { fontFamily: typography.fontFamilySemi, color: colors.textMuted, fontSize: typography.tiny, letterSpacing: 1.4, textTransform: 'uppercase' },
    spinner: { marginTop: spacing.md },
    err: { color: colors.error, fontFamily: typography.fontFamilySemi, textAlign: 'center', marginTop: spacing.md },
  });
