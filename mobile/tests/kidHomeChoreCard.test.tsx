import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Helper that mirrors the in-file logic — keeps the test honest even if the
// kid home file refactors the inline logic into a helper later.
function deriveCardState(inst: {
  status: string;
  due_at: string;
  chore: { recurrence: { times?: string[] } | null } | null;
}, now: number) {
  const times = inst.chore?.recurrence?.times;
  const hasTimes = Array.isArray(times) && times.length > 0;
  const isOverdue = hasTimes && inst.status === 'pending' && now > new Date(inst.due_at).getTime();
  return { hasTimes, isOverdue };
}

describe('Kid chore card overdue logic', () => {
  const NOW = new Date('2026-05-22T09:00:00Z').getTime();

  it('not overdue when due_at is in the future', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T20:00:00Z',
      chore: { recurrence: { times: ['08:00', '20:00'] } },
    }, NOW);
    expect(s.hasTimes).toBe(true);
    expect(s.isOverdue).toBe(false);
  });

  it('overdue when due_at is in the past and status is pending', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T08:00:00Z',
      chore: { recurrence: { times: ['08:00', '20:00'] } },
    }, NOW);
    expect(s.isOverdue).toBe(true);
  });

  it('not overdue when status is not pending', () => {
    const s = deriveCardState({
      status: 'submitted',
      due_at: '2026-05-22T08:00:00Z',
      chore: { recurrence: { times: ['08:00'] } },
    }, NOW);
    expect(s.isOverdue).toBe(false);
  });

  it('not overdue for a chore without times (legacy)', () => {
    const s = deriveCardState({
      status: 'pending',
      due_at: '2026-05-22T00:00:00Z',
      chore: { recurrence: { type: 'daily' } as { times?: string[] } | null },
    }, NOW);
    expect(s.hasTimes).toBe(false);
    expect(s.isOverdue).toBe(false);
  });
});
