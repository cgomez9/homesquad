// Pure, dependency-free celebration-queue builder. All scheduling/cap/
// summary logic lives here so it is fully unit-testable. The hook
// (useCelebrationCatchup) supplies already-fetched rows.

export type CelebrationItem =
  | { kind: 'chore_approved'; id: string; at: string; title: string; stars: number }
  | { kind: 'achievement'; id: string; at: string; achievementKey: string }
  | { kind: 'goal'; id: string; at: string; title: string }
  | { kind: 'summary'; moreCount: number; extraStars: number };

export type RawApproval = { id: string; approved_at: string; title: string; stars: number };
export type RawAchievement = { id: string; unlocked_at: string; achievement_key: string };
export type RawGoal = { id: string; completed_at: string; title: string };

export type BuildInput = {
  cursor: string | null;
  approvals: RawApproval[];
  achievements: RawAchievement[];
  goals: RawGoal[];
  windowStarTotal: number;
};

export type BuildResult = { items: CelebrationItem[]; maxAt: string | null };

export const CELEBRATION_CAP = 5;

const ts = (s: string) => new Date(s).getTime();

export function buildCelebrationQueue(input: BuildInput): BuildResult {
  const merged: Exclude<CelebrationItem, { kind: 'summary' }>[] = [
    ...input.approvals.map((a) => ({
      kind: 'chore_approved' as const, id: a.id, at: a.approved_at, title: a.title, stars: a.stars,
    })),
    ...input.achievements.map((a) => ({
      kind: 'achievement' as const, id: a.id, at: a.unlocked_at, achievementKey: a.achievement_key,
    })),
    ...input.goals.map((g) => ({
      kind: 'goal' as const, id: g.id, at: g.completed_at, title: g.title,
    })),
  ];

  if (merged.length === 0) return { items: [], maxAt: null };

  merged.sort((x, y) => ts(x.at) - ts(y.at));
  const maxAt = merged[merged.length - 1].at;

  if (merged.length <= CELEBRATION_CAP) {
    return { items: merged, maxAt };
  }

  const played = merged.slice(merged.length - CELEBRATION_CAP); // most recent CAP, still ascending
  const moreCount = merged.length - CELEBRATION_CAP;
  const items: CelebrationItem[] = [
    ...played,
    { kind: 'summary', moreCount, extraStars: input.windowStarTotal },
  ];
  return { items, maxAt };
}
