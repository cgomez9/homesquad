import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';
import { AVATARS, AvatarId } from '../constants/avatars';

export type ChoreCardInstance = {
  id: string;
  status: 'pending' | 'started' | 'finished' | 'approved' | 'rejected';
  assignee_profile_id: string | null;
  due_at: string;
  rejection_reason: string | null;
  chore: {
    id: string;
    title: string;
    kind: 'chore' | 'skill';
    star_value: number | null;
    token_value: number | null;
    current_skill_streak: number;
    verification_mode: 'auto' | 'photo' | 'approval';
    recurrence: { type: string; times?: string[] } | null;
  } | null;
  assignee: { id: string; display_name: string; avatar_id: number } | null;
};

export type ChoreAction =
  | { kind: 'claim'; instanceId: string }
  | { kind: 'release'; instanceId: string }
  | { kind: 'start'; instanceId: string }
  | { kind: 'finish'; instanceId: string };

type Props = {
  inst: ChoreCardInstance;
  viewerActorId: string;
  onAction: (action: ChoreAction) => void;
};

export function ChoreCard({ inst, viewerActorId, onAction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isMine = inst.assignee_profile_id === viewerActorId;
  const isUnassigned = inst.assignee_profile_id === null;
  const assigneeAvatar = inst.assignee ? AVATARS[inst.assignee.avatar_id as AvatarId] ?? AVATARS[1] : null;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.title}>{inst.chore?.title ?? '(untitled)'}</Text>
        {inst.chore?.kind === 'skill' ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaToken}>🪙 {inst.chore?.token_value ?? 0}</Text>
            {(inst.chore?.current_skill_streak ?? 0) > 0 && (
              <Text style={styles.metaStreak}>🔥 {inst.chore.current_skill_streak}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.meta}>★ {inst.chore?.star_value ?? 0}</Text>
        )}
      </View>
      <View style={styles.actions}>
        {isUnassigned && inst.status === 'pending' && (
          <Pressable testID="action-claim" onPress={() => onAction({ kind: 'claim', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Claim</Text>
          </Pressable>
        )}
        {isMine && inst.status === 'pending' && (
          <>
            <Pressable testID="action-start" onPress={() => onAction({ kind: 'start', instanceId: inst.id })} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Start</Text>
            </Pressable>
            <Pressable testID="action-release" onPress={() => onAction({ kind: 'release', instanceId: inst.id })} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Release</Text>
            </Pressable>
          </>
        )}
        {isMine && inst.status === 'started' && (
          <Pressable testID="action-finish" onPress={() => onAction({ kind: 'finish', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Finish</Text>
          </Pressable>
        )}
        {isMine && inst.status === 'rejected' && (
          <Pressable testID="action-start" onPress={() => onAction({ kind: 'start', instanceId: inst.id })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        )}
        {!isMine && !isUnassigned && inst.assignee && (
          <View style={styles.othersTag}>
            {assigneeAvatar && (
              <View style={[styles.avSmall, { backgroundColor: assigneeAvatar.bg }]}>
                <Text style={styles.avSmallEmoji}>{assigneeAvatar.emoji}</Text>
              </View>
            )}
            <Text style={styles.othersName}>{inst.assignee.display_name} · {inst.status}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
    },
    body: { gap: spacing.xs },
    title: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },
    meta: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
    metaRow: { flexDirection: 'row', gap: spacing.sm },
    metaToken: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#1F548F' },
    metaStreak: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#B45A1F' },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
    primaryBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.primary },
    primaryBtnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.surface },
    secondaryBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.bg },
    secondaryBtnText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.text },
    othersTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    avSmall: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avSmallEmoji: { fontSize: 14 },
    othersName: { fontFamily: typography.fontFamilySemi, fontSize: typography.tiny, color: colors.textMuted },
  });
