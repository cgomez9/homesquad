import { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, AccessibilityInfo, Easing } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type Palette, spacing, typography, radii } from '../theme';
import { AVATARS, AvatarId } from '../constants/avatars';
import { fireSmallFeedback, fireBigFeedback } from '../lib/feedback';

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

// "Squad Missions" card — state-aware (accent bar + label + actions) with
// tactile press-springs, a finish celebration, and haptics. Honors the
// reduce-motion accessibility setting.
type Mode = 'open' | 'ready' | 'onit' | 'tryagain' | 'done' | 'approved' | 'others';

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setRm(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return rm;
}

export function ChoreCard({ inst, viewerActorId, onAction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();

  const isMine = inst.assignee_profile_id === viewerActorId;
  const isUnassigned = inst.assignee_profile_id === null;
  const status = inst.status;
  const isSkill = inst.chore?.kind === 'skill';

  const mode: Mode =
    status === 'approved' ? 'approved'
    : status === 'finished' ? (isMine ? 'done' : 'others')
    : isUnassigned && status === 'pending' ? 'open'
    : isMine && status === 'pending' ? 'ready'
    : isMine && status === 'started' ? 'onit'
    : isMine && status === 'rejected' ? 'tryagain'
    : 'others';

  const accent =
    mode === 'open' ? colors.accent
    : mode === 'ready' || mode === 'onit' ? colors.primary
    : mode === 'tryagain' ? colors.warning
    : mode === 'done' || mode === 'approved' ? colors.success
    : colors.border;

  const label =
    mode === 'open' ? t('choreCard.stateUpForGrabs')
    : mode === 'ready' ? t('choreCard.stateReady')
    : mode === 'onit' ? t('choreCard.stateOnIt')
    : mode === 'tryagain' ? t('choreCard.stateTryAgain')
    : mode === 'done' ? t('choreCard.stateDone')
    : mode === 'approved' ? t('choreCard.approved')
    : null;

  const isActive = mode === 'onit';
  const assigneeAvatar = inst.assignee ? AVATARS[inst.assignee.avatar_id as AvatarId] ?? AVATARS[1] : null;

  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      {mode === 'done' && <DoneStamp reduceMotion={reduceMotion} />}

      <View style={styles.headRow}>
        <View style={styles.main}>
          {label && <Text style={[styles.stateLabel, { color: accent }]} numberOfLines={1}>{label}</Text>}
          <Text style={styles.title} numberOfLines={2}>{inst.chore?.title ?? '(untitled)'}</Text>
          {mode === 'open' && (
            <View style={styles.subRow}>
              <View style={styles.newChip}><Text style={styles.newChipText}>✦ {t('choreCard.new')}</Text></View>
            </View>
          )}
          {mode === 'tryagain' && inst.rejection_reason ? (
            <Text style={styles.reason} numberOfLines={2}>{inst.rejection_reason}</Text>
          ) : null}
        </View>
        <RewardBadge isSkill={isSkill} chore={inst.chore} />
      </View>

      {isActive && <Shimmer reduceMotion={reduceMotion} />}

      <View style={styles.actions}>
        {mode === 'open' && (
          <ActionButton testID="action-claim" variant="coral" emoji="🙋" feedback="small"
            label={t('choreCard.claim')} reduceMotion={reduceMotion}
            onPress={() => onAction({ kind: 'claim', instanceId: inst.id })} />
        )}

        {mode === 'ready' && (
          <View style={styles.btnRow}>
            <ActionButton testID="action-release" variant="ghost" feedback="small" basis={104}
              label={t('choreCard.release')} reduceMotion={reduceMotion}
              onPress={() => onAction({ kind: 'release', instanceId: inst.id })} />
            <ActionButton testID="action-start" variant="teal" emoji="▸" feedback="small" grow
              label={t('choreCard.start')} reduceMotion={reduceMotion}
              onPress={() => onAction({ kind: 'start', instanceId: inst.id })} />
          </View>
        )}

        {mode === 'onit' && (
          <ActionButton testID="action-finish" variant="success" emoji="✓" feedback="big"
            label={t('choreCard.finish')} reduceMotion={reduceMotion}
            onPress={() => onAction({ kind: 'finish', instanceId: inst.id })} />
        )}

        {mode === 'tryagain' && (
          <ActionButton testID="action-start" variant="coral" emoji="↻" feedback="small"
            label={t('choreCard.tryAgain')} reduceMotion={reduceMotion}
            onPress={() => onAction({ kind: 'start', instanceId: inst.id })} />
        )}

        {mode === 'done' && <Text style={styles.awaiting}>{t('choreCard.awaitingApproval')}</Text>}

        {mode === 'others' && inst.assignee && (
          <View style={styles.othersTag}>
            {assigneeAvatar && (
              <View style={[styles.avSmall, { backgroundColor: assigneeAvatar.bg }]}>
                <Text style={styles.avSmallEmoji}>{assigneeAvatar.emoji}</Text>
              </View>
            )}
            <Text style={styles.othersName}>
              {t('choreCard.assignee', { name: inst.assignee.display_name, status: statusWord(status, t) })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function statusWord(status: ChoreCardInstance['status'], t: (k: string) => string): string {
  if (status === 'finished') return t('choreCard.statusDone');
  if (status === 'started') return t('choreCard.statusOnIt');
  return t('choreCard.statusWaiting');
}

/* ---------- reward badge (chore=star / skill=token + streak) ---------- */

function RewardBadge({ isSkill, chore }: { isSkill: boolean; chore: ChoreCardInstance['chore'] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();

  if (isSkill) {
    const streak = chore?.current_skill_streak ?? 0;
    return (
      <View style={styles.rewardWrap}>
        <View style={[styles.reward, styles.rewardToken]}>
          <Text style={styles.rewardValToken}>🪙 {chore?.token_value ?? 0}</Text>
          <Text style={styles.rewardLbl}>{t('choreCard.reward')}</Text>
        </View>
        {streak > 0 && <Text style={styles.streak}>🔥 {streak}</Text>}
      </View>
    );
  }
  return (
    <View style={[styles.reward, styles.rewardStar]}>
      <Text style={styles.rewardVal}>★ {chore?.star_value ?? 0}</Text>
      <Text style={styles.rewardLbl}>{t('choreCard.reward')}</Text>
    </View>
  );
}

/* ---------- action button (press-spring + haptic) ---------- */

type BtnVariant = 'coral' | 'teal' | 'success' | 'ghost';
function ActionButton({
  testID, variant, emoji, label, onPress, feedback, reduceMotion, grow, basis,
}: {
  testID: string; variant: BtnVariant; emoji?: string; label: string;
  onPress: () => void; feedback: 'small' | 'big'; reduceMotion: boolean;
  grow?: boolean; basis?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => { if (!reduceMotion) Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start(); };
  const pressOut = () => { if (!reduceMotion) Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start(); };
  const handle = () => {
    (feedback === 'big' ? fireBigFeedback() : fireSmallFeedback()).catch(() => {});
    onPress();
  };

  const variantStyle = variant === 'coral' ? styles.btnCoral
    : variant === 'teal' ? styles.btnTeal
    : variant === 'success' ? styles.btnSuccess
    : styles.btnGhost;
  const isGhost = variant === 'ghost';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, grow && { flex: 1 }, basis != null && { flexBasis: basis, flexGrow: 0 }]}>
      <Pressable
        testID={testID}
        onPress={handle}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.btn, variantStyle]}
      >
        {emoji ? <Text style={styles.btnEmoji}>{emoji}</Text> : null}
        <Text style={isGhost ? styles.btnGhostText : styles.btnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- in-progress shimmer ---------- */

function Shimmer({ reduceMotion }: { reduceMotion: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-90, 280] });

  return (
    <View style={styles.shimmerTrack}>
      <View style={styles.shimmerFill} />
      {!reduceMotion && <Animated.View style={[styles.shimmerGlow, { transform: [{ translateX }] }]} />}
    </View>
  );
}

/* ---------- DONE stamp (scale-in on completion) ---------- */

function DoneStamp({ reduceMotion }: { reduceMotion: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 130, delay: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true, delay: 60 }),
    ]).start();
  }, [reduceMotion, scale, opacity]);

  return (
    <>
      <Animated.View style={[styles.stamp, { opacity, transform: [{ rotate: '-13deg' }, { scale }] }]} pointerEvents="none">
        <Text style={styles.stampText}>{t('choreCard.doneStamp')}</Text>
      </Animated.View>
      <Animated.Text style={[styles.sparkle, { top: 14, right: 96, opacity }]} pointerEvents="none">✦</Animated.Text>
      <Animated.Text style={[styles.sparkleSm, { top: 42, right: 120, opacity }]} pointerEvents="none">✦</Animated.Text>
    </>
  );
}

/* ---------- styles ---------- */

const FINISH_GREEN = '#10B981';
const SHADOW = '#0F766E';

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingTop: spacing.md + 2,
      paddingBottom: spacing.md + 2,
      paddingLeft: spacing.lg + 6,
      paddingRight: spacing.md + 2,
      marginBottom: spacing.sm + 2,
      borderWidth: 1.5,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 3,
    },
    cardActive: {
      borderColor: colors.primary,
      borderWidth: 2,
      shadowColor: colors.primary,
      shadowOpacity: 0.32,
      shadowRadius: 16,
      elevation: 6,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 14,
      bottom: 14,
      width: 6,
      borderTopRightRadius: 6,
      borderBottomRightRadius: 6,
    },

    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    main: { flex: 1, minWidth: 0 },
    stateLabel: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    title: { fontFamily: typography.fontFamilyBold, fontSize: 19, color: colors.text, letterSpacing: -0.2, lineHeight: 23 },
    subRow: { flexDirection: 'row', marginTop: 8 },
    newChip: { backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 9 },
    newChipText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: 10, letterSpacing: 1 },
    reason: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.warning, marginTop: 7 },

    rewardWrap: { alignItems: 'center', gap: 4 },
    reward: { borderRadius: 14, paddingVertical: 7, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1.5 },
    rewardStar: { backgroundColor: '#FFF7E0', borderColor: '#F6E4B0' },
    rewardToken: { backgroundColor: '#EAF4FF', borderColor: '#CFE4F8' },
    rewardVal: { fontFamily: typography.fontFamilyBold, fontSize: 18, color: '#7A5200', lineHeight: 20 },
    rewardValToken: { fontFamily: typography.fontFamilyBold, fontSize: 18, color: '#1F548F', lineHeight: 20 },
    rewardLbl: { fontFamily: typography.fontFamilyBold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted, marginTop: 3 },
    streak: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: '#B45A1F' },

    shimmerTrack: { height: 10, borderRadius: radii.pill, backgroundColor: '#E7F4F1', overflow: 'hidden', marginTop: spacing.md + 2, position: 'relative' },
    shimmerFill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '46%', borderRadius: radii.pill, backgroundColor: colors.primary },
    shimmerGlow: { position: 'absolute', top: 0, bottom: 0, width: 70, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: radii.pill },

    actions: { marginTop: spacing.md + 2 },
    btnRow: { flexDirection: 'row', gap: spacing.sm + 2 },
    btn: {
      borderRadius: 14, paddingVertical: 14, paddingHorizontal: spacing.md,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: 16, letterSpacing: 0.3 },
    btnGhostText: { color: colors.textMuted, fontFamily: typography.fontFamilyBold, fontSize: 15 },
    btnEmoji: { fontSize: 17 },
    btnCoral: { backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    btnTeal: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    btnSuccess: { backgroundColor: FINISH_GREEN, shadowColor: FINISH_GREEN, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    btnGhost: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.border },

    awaiting: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted },

    stamp: {
      position: 'absolute', top: 16, right: 14, zIndex: 5,
      borderWidth: 3, borderColor: colors.success, borderRadius: 10,
      paddingVertical: 4, paddingHorizontal: 12, backgroundColor: 'transparent',
    },
    stampText: { color: colors.success, fontFamily: typography.fontFamilyBold, fontSize: 20, letterSpacing: 3 },
    sparkle: { position: 'absolute', zIndex: 4, fontSize: 16, color: colors.warning },
    sparkleSm: { position: 'absolute', zIndex: 4, fontSize: 11, color: colors.warning },

    othersTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    avSmall: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    avSmallEmoji: { fontSize: 15 },
    othersName: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted },
  });
