import { useMemo } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { AVATAR_IDS, AVATARS, AvatarId } from '../constants/avatars';
import { useTheme, type Palette, spacing, radii } from '../theme';

type Props = { value: AvatarId; onChange: (id: AvatarId) => void };

export function AvatarPicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {AVATAR_IDS.map((id) => {
        const a = AVATARS[id];
        const selected = id === value;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.tile, { backgroundColor: a.bg }, selected && styles.selected]}
          >
            <Text style={styles.emoji}>{a.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginVertical: spacing.lg },
    tile: { width: 64, height: 64, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
    selected: { borderColor: colors.primary },
    emoji: { fontSize: 32 },
  });
