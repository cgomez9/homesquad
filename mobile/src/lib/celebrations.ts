// Module-level bridge so the kid-screen hook can push a batch of
// celebrations into the app-global AchievementBanner without prop
// drilling. Mirrors feedback.ts setConfettiFire (Task 13 pattern).
import type { CelebrationItem } from './celebrationQueue';

let enqueueFn: ((items: CelebrationItem[]) => void) | null = null;

export function setCelebrationEnqueue(fn: (items: CelebrationItem[]) => void) {
  enqueueFn = fn;
}

export function enqueueCelebrations(items: CelebrationItem[]): void {
  if (items.length === 0) return;
  try { enqueueFn?.(items); } catch {}
}
