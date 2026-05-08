import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
};

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ onSubmit, onCancel, error }: Props) {
  const [pin, setPin] = useState('');

  function press(k: string) {
    if (k === '') return;
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>
      <View style={styles.dots}>
        {[0,1,2,3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <Pressable key={i} style={styles.key} onPress={() => press(k)}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: 'center', gap: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#9ca3af' },
  dotFilled: { backgroundColor: '#111827', borderColor: '#111827' },
  error: { color: '#ef4444', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
  key: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontWeight: '500' },
  cancel: { paddingVertical: 8 },
  cancelText: { color: '#6b7280', fontSize: 16 },
});
