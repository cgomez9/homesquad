import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radii, spacing, typography } from '../theme';

type Props = {
  visible: boolean;
  loading: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountModal({ visible, loading, error, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!visible) setConfirmText('');
  }, [visible]);

  const canConfirm = confirmText === 'DELETE' && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('deleteModal.title')}</Text>
          <Text style={styles.body}>{t('deleteModal.body')}</Text>
          <Text style={styles.label}>{t('deleteModal.typeDelete')}</Text>
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
              <Text style={styles.cancelText}>{t('deleteModal.cancel')}</Text>
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
                <Text style={styles.confirmText}>{t('deleteModal.confirm')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.xl, width: '100%', maxWidth: 400, gap: spacing.md },
  title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
  body: { fontFamily: typography.fontFamily, fontSize: typography.body, color: colors.text, lineHeight: 22 },
  label: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: spacing.md, fontSize: typography.body, fontFamily: typography.fontFamily,
    color: colors.text, backgroundColor: colors.surface,
  },
  error: { color: colors.error, fontFamily: typography.fontFamily, fontSize: typography.small },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelText: { color: colors.text, fontFamily: typography.fontFamilySemi, fontSize: typography.body },
  confirmBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center', backgroundColor: colors.error },
  confirmBtnDisabled: { backgroundColor: '#fca5a5' },
  confirmText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
});
