type EventName = 'achievement_unlocked';
type Payload = { key: string; profile_id: string };

const listeners = new Map<EventName, Set<(p: Payload) => void>>();

export function on(name: EventName, fn: (p: Payload) => void): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(fn);
  return () => { listeners.get(name)?.delete(fn); };
}

export function emit(name: EventName, payload: Payload): void {
  listeners.get(name)?.forEach((fn) => fn(payload));
}
