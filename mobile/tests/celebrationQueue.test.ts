import { buildCelebrationQueue, CELEBRATION_CAP } from '../src/lib/celebrationQueue';

const approval = (id: string, at: string, title = 'Dishes', stars = 3) =>
  ({ id, approved_at: at, title, stars });
const ach = (id: string, at: string, key = 'first_star') =>
  ({ id, unlocked_at: at, achievement_key: key });
const goal = (id: string, at: string, title = 'Pizza Night') =>
  ({ id, completed_at: at, title });

describe('buildCelebrationQueue', () => {
  it('returns empty + null maxAt when there are no wins', () => {
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals: [], achievements: [], goals: [], windowStarTotal: 0,
    });
    expect(r.items).toEqual([]);
    expect(r.maxAt).toBeNull();
  });

  it('merges all three sources sorted ascending by timestamp', () => {
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z',
      approvals: [approval('a1', '2026-05-02T10:00:00Z')],
      achievements: [ach('b1', '2026-05-02T09:00:00Z')],
      goals: [goal('g1', '2026-05-02T11:00:00Z')],
      windowStarTotal: 9,
    });
    expect(r.items.map((i) => i.kind)).toEqual(['achievement', 'chore_approved', 'goal']);
    expect(r.maxAt).toBe('2026-05-02T11:00:00Z');
  });

  it('plays the CAP most-recent items and appends a summary when over cap', () => {
    const approvals = Array.from({ length: CELEBRATION_CAP + 3 }, (_, i) =>
      approval(`a${i}`, `2026-05-1${i}T10:00:00Z`, 'Chore', 2));
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals, achievements: [], goals: [], windowStarTotal: 42,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP + 1);
    expect(r.items.slice(0, CELEBRATION_CAP).every((i) => i.kind === 'chore_approved')).toBe(true);
    const summary = r.items[CELEBRATION_CAP];
    expect(summary).toEqual({ kind: 'summary', moreCount: 3, extraStars: 42 });
    expect((r.items[0] as any).id).toBe('a3');
    expect((r.items[CELEBRATION_CAP - 1] as any).id).toBe(`a${CELEBRATION_CAP + 2}`);
  });

  it('does not append a summary at exactly the cap', () => {
    const approvals = Array.from({ length: CELEBRATION_CAP }, (_, i) =>
      approval(`a${i}`, `2026-05-0${i + 1}T10:00:00Z`));
    const r = buildCelebrationQueue({
      cursor: '2026-05-01T00:00:00Z', approvals, achievements: [], goals: [], windowStarTotal: 0,
    });
    expect(r.items.length).toBe(CELEBRATION_CAP);
    expect(r.items.some((i) => i.kind === 'summary')).toBe(false);
  });
});
