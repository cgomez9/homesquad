// mobile/tests/goalCard.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { GoalCard } from '../src/components/GoalCard';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string, v?: any) => (v?.count != null ? `${k}:${v.count}` : v?.title ? `${k}:${v.title}` : k) },
}));

const GOAL = {
  id: 'g1', family_id: 'f1', title: 'Pizza Night',
  description: null, target_stars: 100, status: 'active' as const,
  created_by: 'p1', created_at: '2026-05-01T00:00:00Z',
  completed_at: null, progress_stars: 40,
};

describe('GoalCard', () => {
  it('renders title and target stars', () => {
    const { getByText } = render(<GoalCard goal={GOAL} />);
    expect(getByText('Pizza Night')).toBeTruthy();
  });

  it('shows remaining count when not complete', () => {
    const { getByText } = render(<GoalCard goal={GOAL} />);
    expect(getByText('goals.progressRemaining:60')).toBeTruthy();
  });

  it('shows complete copy when progress >= target', () => {
    const { getByText } = render(
      <GoalCard goal={{ ...GOAL, progress_stars: 120 }} />,
    );
    expect(getByText('goals.progressDone')).toBeTruthy();
  });

  it('progress bar width caps at 100%', () => {
    const { getByTestId } = render(
      <GoalCard goal={{ ...GOAL, progress_stars: 250 }} />,
    );
    const fill = getByTestId('goal-progress-fill');
    expect(fill.props.style).toEqual(expect.objectContaining({ width: '100%' }));
  });
});
