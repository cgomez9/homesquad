import { Platform, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, signInWithGoogle } from '../lib/auth';

export function SocialAuthRow() {
  const googleConfigured =
    !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
    !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  async function onApplePress() {
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('canceled')) return;
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

  async function onGooglePress() {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const msg = e?.message ?? '';
      const code = e?.code ?? '';
      if (code === 'SIGN_IN_CANCELLED' || msg.includes('cancelled')) return;
      if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        Alert.alert('Sign-in failed', 'Google sign-in requires Google Play services.');
        return;
      }
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

  const hasAnySocial = Platform.OS === 'ios' || googleConfigured;

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleBtn}
          onPress={onApplePress}
        />
      )}
      {googleConfigured && (
        <Pressable onPress={onGooglePress} style={styles.googleBtn}>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>
      )}
      {hasAnySocial && (
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>or</Text>
          <View style={styles.line} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12, marginBottom: 12 },
  appleBtn: { height: 48 },
  googleBtn: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleText: { fontSize: 16, color: '#1f2937', fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  or: { color: '#6b7280', fontSize: 13 },
});
