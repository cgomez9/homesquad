import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  loading: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountModal({ visible, loading, error, onCancel, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!visible) setConfirmText('');
  }, [visible]);

  const canConfirm = confirmText === 'DELETE' && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>
            This permanently deletes your account and all your data. If you're the last parent in this family,
            the family, your kids' profiles, all chores, rewards, and history will be deleted too.
            This cannot be undone.
          </Text>
          <Text style={styles.label}>Type DELETE to confirm:</Text>
          <TextInput
            testID="delete-confirm-input"
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable testID="delete-cancel-button" onPress={onCancel} style={styles.cancelBtn} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="delete-confirm-button"
              onPress={() => canConfirm && onConfirm()}
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              disabled={!canConfirm}
            >
              {loading ? (
                <ActivityIndicator testID="delete-loading" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Delete forever</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  body: { fontSize: 14, color: '#374151', lineHeight: 20 },
  label: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#ef4444', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#ef4444' },
  confirmBtnDisabled: { backgroundColor: '#fca5a5' },
  confirmText: { color: '#fff', fontWeight: '600' },
});
