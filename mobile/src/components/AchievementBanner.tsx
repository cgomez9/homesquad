import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { on } from '../lib/events';
import { ACHIEVEMENTS, type AchievementKey } from '../constants/achievements';
import { fireAchievementFeedback } from '../lib/feedback';

type AchievementBannerItem = { id: number; kind: 'achievement'; key: AchievementKey };
type GoalBannerItem = { id: number; kind: 'goal'; emoji: string; title: string; description: string };
type QueuedBanner = AchievementBannerItem | GoalBannerItem;

const DISPLAY_MS = 4000;

export function AchievementBanner() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<QueuedBanner | null>(null);
  const [queue, setQueue] = useState<QueuedBanner[]>([]);

  // Track current route so we only fire when the user is in kid mode.
  // The banner is for the kid celebrating their own win — not for the parent
  // who just approved on the Approvals tab.
  const segments = useSegments();
  const inKidMode = segments.some((s) => s === 'kid');
  const inKidModeRef = useRef(inKidMode);
  inKidModeRef.current = inKidMode;

  // Subscribe once.
  useEffect(() => {
    let counter = 0;

    const unsubAchievement = on('achievement_unlocked', (p) => {
      // Drop events when not in kid mode — the parent doesn't need a banner
      // when they themselves triggered the unlock.
      if (!inKidModeRef.current) return;
      counter += 1;
      const entry: AchievementBannerItem = { id: counter, kind: 'achievement', key: p.key as AchievementKey };
      setQueue((q) => [...q, entry]);
    });

    const unsubGoal = on('goal_completed', (p) => {
      if (!inKidModeRef.current) return;
      counter += 1;
      const entry: GoalBannerItem = {
        id: counter,
        kind: 'goal',
        emoji: '🎉',
        title: t('goals.completedBanner', { title: p.title }),
        description: '',
      };
      setQueue((q) => [...q, entry]);
    });

    return () => {
      unsubAchievement();
      unsubGoal();
    };
  }, [t]);

  // Drain the queue.
  useEffect(() => {
    if (current !== null) return;
    if (queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent(next);
    fireAchievementFeedback();
    const t = setTimeout(() => setCurrent(null), DISPLAY_MS);
    return () => clearTimeout(t);
  }, [current, queue]);

  if (!current) return null;

  if (current.kind === 'goal') {
    return (
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable onPress={() => setCurrent(null)} style={styles.card}>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Text style={styles.title}>{current.title}</Text>
        </Pressable>
      </View>
    );
  }

  const a = ACHIEVEMENTS[current.key];
  if (!a) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable onPress={() => setCurrent(null)} style={styles.card}>
        <Text style={styles.heading}>🏅 New Achievement!</Text>
        <Text style={styles.emoji}>{a.emoji}</Text>
        <Text style={styles.title}>{a.title}</Text>
        <Text style={styles.description}>{a.description}</Text>
      </Pressable>
    </View>
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
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  description: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});
