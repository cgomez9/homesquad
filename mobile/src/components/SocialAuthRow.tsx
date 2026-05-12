import { Platform, View, Text, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '../lib/auth';

export function SocialAuthRow() {
  async function onApplePress() {
    try {
      await signInWithApple();
    } catch (e: any) {
      const msg = e?.message ?? '';
      // User cancelled the Apple sheet — silently dismiss.
      if (msg.includes('ERR_REQUEST_CANCELED') || msg.includes('canceled')) return;
      Alert.alert('Sign-in failed', msg || 'Try again.');
    }
  }

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
      {Platform.OS === 'ios' && (
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  or: { color: '#6b7280', fontSize: 13 },
});
