import { buildCelebrationQueue, CELEBRATION_CAP } from '../src/lib/celebrationQueue';

const approval = (id: string, at: string, title = 'Dishes', stars = 3) =>
  ({ id, approved_at: at, title, stars });
const ach = (id: string, at: string, key = 'stargazer') =>
  ({ id, unlocked_at: at, achievement_key: key });
const goal = (id: string, at: string, title = 'Pizza Night') =>
  ({ id, completed_at: at, title });
const day = (n: number) => new Date(Date.UTC(2026, 4, n, 10, 0, 0)).toISOString();

describe('buildCelebrationQueue', () => {
  it('returns empty + null maxAt when there are no wins', () => {
    const r = buildCelebrationQueue({
      approvals: [], achievements: [], goals: [], windowStarTotal: 0,
    });
    expect(r.items).toEqual([]);
    expect(r.maxAt).toBeNull();
  });

  it('merges all three sources sorted ascending by timestamp', () => {
    const r = buildCelebrationQueue({
      approvals: [approval('a1', '2026-05-02T10:00:00Z')],
      achievements: [ach('b1', '2026-05-02T09:00:00Z')],
      goals: [goal('g1', '2026-05-02T11:00:00Z')],
      windowStarTotal: 9,
    });
    expect(r.items.map((i) => i.kind)).toEqual(['achievement', 'chore_approved', 'goal']);
    expect(r.maxAt).toBe('2026-05-02T11:00:00Z');
  });

  it('plays the CAP most-recent items and appends a summary when over cap', () => {
    const achievements = Array.from({ length: CELEBRATION_CAP + 3 }, (_, i) =>
      ach(`b${i}`, day(10 + i), 'stargazer'));
    const r = buildCelebrationQueue({
      approvals: [], achievements, goals: [], windowStarTotal: 42,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP + 1);
    expect(r.items.slice(0, CELEBRATION_CAP).every((i) => i.kind === 'achievement')).toBe(true);
    const summary = r.items[CELEBRATION_CAP];
    expect(summary).toEqual({ kind: 'summary', moreCount: 3, extraStars: 42 });
    expect((r.items[0] as any).id).toBe('b3');
    expect((r.items[CELEBRATION_CAP - 1] as any).id).toBe(`b${CELEBRATION_CAP + 2}`);
  });

  it('does not append a summary at exactly the cap', () => {
    const achievements = Array.from({ length: CELEBRATION_CAP }, (_, i) =>
      ach(`b${i}`, day(i + 1), 'stargazer'));
    const r = buildCelebrationQueue({
      approvals: [], achievements, goals: [], windowStarTotal: 0,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP);
    expect(r.items.some((i) => i.kind === 'summary')).toBe(false);
  });

  it('preserves source order for equal timestamps (stable sort)', () => {
    const sameAt = '2026-05-02T10:00:00Z';
    const r = buildCelebrationQueue({
      approvals: [approval('a1', sameAt)],
      achievements: [ach('b1', sameAt)],
      goals: [goal('g1', sameAt)],
      windowStarTotal: 0,
    });
    expect(r.items.map((i) => i.kind)).toEqual(['chore_approved', 'achievement', 'goal']);
  });

  it('groups 2+ approvals into a single approval_group item', () => {
    const r = buildCelebrationQueue({
      approvals: [
        approval('a1', '2026-05-02T09:00:00Z', 'Dishes', 3),
        approval('a2', '2026-05-02T10:00:00Z', 'Trash', 5),
      ],
      achievements: [],
      goals: [],
      windowStarTotal: 0,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toEqual({
      kind: 'approval_group',
      count: 2,
      stars: 8,
      at: '2026-05-02T10:00:00Z',
    });
    expect(r.maxAt).toBe('2026-05-02T10:00:00Z');
  });

  it('keeps single approval as chore_approved (no group)', () => {
    const r = buildCelebrationQueue({
      approvals: [approval('a1', '2026-05-02T10:00:00Z', 'Dishes', 3)],
      achievements: [],
      goals: [],
      windowStarTotal: 0,
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kind).toBe('chore_approved');
  });

  it('intermixes approval_group with achievements and goals by timestamp', () => {
    const r = buildCelebrationQueue({
      approvals: [
        approval('a1', '2026-05-02T09:00:00Z', 'Dishes', 3),
        approval('a2', '2026-05-02T11:00:00Z', 'Trash', 5),
      ],
      achievements: [ach('b1', '2026-05-02T10:00:00Z', 'stargazer')],
      goals: [goal('g1', '2026-05-02T12:00:00Z')],
      windowStarTotal: 0,
    });
    // approval_group sits at the latest approval (11:00), then goal at 12:00.
    // achievement at 10:00 fires before the group's anchor timestamp.
    expect(r.items.map((i) => i.kind)).toEqual(['achievement', 'approval_group', 'goal']);
  });
});
