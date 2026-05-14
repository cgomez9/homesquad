type AchievementUnlockedPayload = { key: string; profile_id: string };
type GoalCompletedPayload = { title: string };

type EventMap = {
  achievement_unlocked: AchievementUnlockedPayload;
  goal_completed: GoalCompletedPayload;
};

type EventName = keyof EventMap;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listeners = new Map<EventName, Set<(p: any) => void>>();

export function on<K extends EventName>(name: K, fn: (p: EventMap[K]) => void): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(fn);
  return () => { listeners.get(name)?.delete(fn); };
}

export function emit<K extends EventName>(name: K, payload: EventMap[K]): void {
  listeners.get(name)?.forEach((fn) => fn(payload));
}
