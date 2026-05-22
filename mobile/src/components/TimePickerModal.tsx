import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet, type ListRenderItem } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, radii, typography } from '../theme';

type Props = {
  visible: boolean;
  initial?: string;
  onCancel: () => void;
  onConfirm: (hhmm: string) => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const ROW_H = 44;
const VISIBLE_ROWS = 5;

function parse(initial: string | undefined): { h: number; m: number } {
  const raw = (initial ?? '08:00').trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return { h: 8, m: 0 };
  const h = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const m = Math.min(55, Math.round(minute / 5) * 5);
  return { h, m };
}

export function TimePickerModal({ visible, initial, onCancel, onConfirm }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [{ h, m }, setHM] = useState(() => parse(initial));
  const hourRef = useRef<FlatList<number>>(null);
  const minRef = useRef<FlatList<number>>(null);

  useEffect(() => {
    if (!visible) return;
    const next = parse(initial);
    setHM(next);
    requestAnimationFrame(() => {
      hourRef.current?.scrollToIndex({ index: next.h, animated: false });
      minRef.current?.scrollToIndex({ index: MINUTES.indexOf(next.m), animated: false });
    });
  }, [visible, initial]);

  const onHourScrollEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW_H);
    setHM((s) => ({ ...s, h: Math.max(0, Math.min(23, i)) }));
  };
  const onMinScrollEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW_H);
    const m = MINUTES[Math.max(0, Math.min(MINUTES.length - 1, i))];
    setHM((s) => ({ ...s, m }));
  };

  const renderHour: ListRenderItem<number> = ({ item }) => (
    <View style={[styles.row, item === h && styles.rowSel]}>
      <Text style={[styles.rowText, item === h && styles.rowTextSel]}>
        {item.toString().padStart(2, '0')}
      </Text>
    </View>
  );
  const renderMin: ListRenderItem<number> = ({ item }) => (
    <View style={[styles.row, item === m && styles.rowSel]}>
      <Text style={[styles.rowText, item === m && styles.rowTextSel]}>
        {item.toString().padStart(2, '0')}
      </Text>
    </View>
  );

  const hhmm = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay} testID="time-picker-modal">
        <View style={styles.card}>
          <Text style={styles.title}>{t('forms.pickTimeTitle')}</Text>
          <View style={styles.wheels}>
            <FlatList
              ref={hourRef}
              data={HOURS}
              keyExtractor={(item) => `h-${item}`}
              renderItem={renderHour}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_H}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
              contentContainerStyle={{ paddingVertical: ROW_H * Math.floor(VISIBLE_ROWS / 2) }}
              style={styles.wheel}
              onMomentumScrollEnd={onHourScrollEnd}
              initialScrollIndex={h}
            />
            <Text style={styles.colon}>:</Text>
            <FlatList
              ref={minRef}
              data={MINUTES}
              keyExtractor={(item) => `m-${item}`}
              renderItem={renderMin}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_H}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
              contentContainerStyle={{ paddingVertical: ROW_H * Math.floor(VISIBLE_ROWS / 2) }}
              style={styles.wheel}
              onMomentumScrollEnd={onMinScrollEnd}
              initialScrollIndex={MINUTES.indexOf(m)}
            />
          </View>
          <View style={styles.actions}>
            <Pressable testID="time-picker-cancel" onPress={onCancel} style={[styles.btn, styles.btnCancel]}>
              <Text style={styles.btnCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable testID="time-picker-confirm" onPress={() => onConfirm(hhmm)} style={[styles.btn, styles.btnOk]}>
              <Text style={styles.btnOkText}>{t('common.ok')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,40,38,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, width: 320, gap: spacing.md },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text, textAlign: 'center' },
    wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ROW_H * VISIBLE_ROWS, gap: spacing.sm },
    wheel: { flex: 1, height: ROW_H * VISIBLE_ROWS },
    colon: { fontFamily: typography.fontFamilyBold, fontSize: 28, color: colors.text },
    row: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
    rowSel: { backgroundColor: 'rgba(14,165,164,0.12)', borderRadius: radii.md },
    rowText: { fontFamily: typography.fontFamilySemi, fontSize: 22, color: colors.textMuted },
    rowTextSel: { color: colors.primaryDark, fontFamily: typography.fontFamilyBold },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.pill, alignItems: 'center' },
    btnCancel: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
    btnCancelText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
    btnOk: { backgroundColor: colors.primary },
    btnOkText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: '#fff' },
  });
