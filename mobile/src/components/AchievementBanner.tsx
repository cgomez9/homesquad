import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { on } from '../lib/events';
import { setCelebrationEnqueue } from '../lib/celebrations';
import type { CelebrationItem } from '../lib/celebrationQueue';
import { ACHIEVEMENTS, type AchievementKey } from '../constants/achievements';
import { fireAchievementFeedback } from '../lib/feedback';

type Queued = (CelebrationItem & { _id: number });

const DISPLAY_MS = 4000;

export function AchievementBanner() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<Queued | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const counter = useRef(0);

  // Live realtime path is still gated to kid mode (parent who approved
  // does not get a banner). Programmatic batches come from the kid
  // screen hook and are already kid-context, so they bypass the gate.
  const segments = useSegments();
  const inKidMode = segments.some((s) => s === 'kid');
  const inKidModeRef = useRef(inKidMode);
  inKidModeRef.current = inKidMode;

  const push = (items: CelebrationItem[]) => {
    setQueue((q) => [
      ...q,
      ...items.map((it) => ({ ...it, _id: (counter.current += 1) })),
    ]);
  };

  // Programmatic batch enqueue (catch-up replay).
  useEffect(() => {
    setCelebrationEnqueue(push);
    return () => setCelebrationEnqueue(() => {});
  }, []);

  // Live realtime listeners (in-session wins) — unchanged behavior.
  useEffect(() => {
    const unsubA = on('achievement_unlocked', (p) => {
      if (!inKidModeRef.current) return;
      push([{ kind: 'achievement', id: '', at: '', achievementKey: p.key }]);
    });
    const unsubG = on('goal_completed', (p) => {
      if (!inKidModeRef.current) return;
      push([{ kind: 'goal', id: '', at: '', title: p.title }]);
    });
    return () => { unsubA(); unsubG(); };
  }, []);

  // Drain.
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    fireAchievementFeedback();
    const timer = setTimeout(() => setCurrent(null), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable onPress={() => setCurrent(null)} style={styles.card}>
        {renderBody(current, t)}
      </Pressable>
    </View>
  );
}

function renderBody(item: Queued, t: (k: string, o?: any) => string) {
  if (item.kind === 'chore_approved') {
    return (
      <>
        <Text style={styles.heading}>{t('celebration.choreApproved')}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>+{item.stars} ⭐</Text>
      </>
    );
  }
  if (item.kind === 'approval_group') {
    return (
      <>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>
          {t('celebration.choresApproved', { count: item.count })}
        </Text>
        <Text style={styles.description}>+{item.stars} ⭐</Text>
      </>
    );
  }
  if (item.kind === 'goal') {
    return (
      <>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>{t('goals.completedBanner', { title: item.title })}</Text>
      </>
    );
  }
  if (item.kind === 'summary') {
    return (
      <>
        <Text style={styles.emoji}>🌟</Text>
        <Text style={styles.title}>{t('celebration.summary', { count: item.moreCount })}</Text>
        <Text style={styles.description}>+{item.extraStars} ⭐</Text>
      </>
    );
  }
  // achievement → Confetti-Burst reveal (medallion pop; confetti already
  // fired by fireAchievementFeedback in the drain effect).
  const a = ACHIEVEMENTS[item.achievementKey as AchievementKey];
  if (!a) return null;
  return (
    <BadgeReveal
      heading={t('celebration.newAchievement')}
      emoji={a.emoji}
      title={t(`achievements.${item.achievementKey}.title`)}
      description={t(`achievements.${item.achievementKey}.desc`)}
    />
  );
}

function BadgeReveal({ heading, emoji, title, description }: { heading: string; emoji: string; title: string; description: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.18, useNativeDriver: true, friction: 4, tension: 120 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  }, [scale]);
  return (
    <>
      <Text style={styles.heading}>{heading}</Text>
      <Animated.Text style={[styles.emoji, { transform: [{ scale }] }]}>{emoji}</Animated.Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 999,
  },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', minWidth: 280, gap: 8 },
  heading: { fontSize: 14, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 },
  emoji: { fontSize: 64, marginVertical: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  description: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
