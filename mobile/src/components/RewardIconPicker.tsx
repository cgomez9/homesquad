import { View, Text, Pressable, StyleSheet } from 'react-native';
import { REWARD_ICONS, REWARD_ICON_IDS, type RewardIconId } from '../constants/rewardIcons';

type Props = {
  value: RewardIconId;
  onChange: (id: RewardIconId) => void;
};

export function RewardIconPicker({ value, onChange }: Props) {
  return (
    <View>
      <Text style={styles.label}>Icon</Text>
      <View style={styles.row}>
        {REWARD_ICON_IDS.map((id) => {
          const sel = id === value;
          const { emoji, label } = REWARD_ICONS[id];
          return (
            <Pressable
              key={id}
              testID={`reward-icon-${id}`}
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(id)}
              style={[styles.chip, sel && styles.chipSel]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={[styles.chipLabel, sel && styles.chipLabelSel]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', minWidth: 64 },
  chipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  emoji: { fontSize: 24 },
  chipLabel: { fontSize: 11, color: '#374151', marginTop: 2 },
  chipLabelSel: { color: '#fff' },
});
