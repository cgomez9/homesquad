// mobile/tests/leaderboardList.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { LeaderboardList } from '../src/components/LeaderboardList';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string, v?: any) => (v?.count != null ? `${k}:${v.count}` : k) },
}));

const ROWS = [
  { profile_id: 'a', display_name: 'Sara', avatar_id: 1,
    week_stars: 30, all_time_stars: 80, week_rank: 1, all_time_rank: 2 },
  { profile_id: 'b', display_name: 'Lev', avatar_id: 2,
    week_stars: 20, all_time_stars: 120, week_rank: 2, all_time_rank: 1 },
];

describe('LeaderboardList', () => {
  it('renders rows sorted by week_rank when scope=week', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="week" />,
    );
    const names = getAllByTestId('leaderboard-name').map((n) => n.props.children);
    expect(names).toEqual(['Sara', 'Lev']);
  });

  it('renders rows sorted by all_time_rank when scope=allTime', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="allTime" />,
    );
    const names = getAllByTestId('leaderboard-name').map((n) => n.props.children);
    expect(names).toEqual(['Lev', 'Sara']);
  });

  it('renders gold medal for rank 1 only', () => {
    const { getAllByTestId } = render(
      <LeaderboardList rows={ROWS} scope="week" />,
    );
    const medals = getAllByTestId('leaderboard-medal');
    expect(medals[0].props.children).toBe('🥇');
    expect(medals[1].props.children).toBe('🥈');
  });

  it('hides medals for single-row data', () => {
    const { queryAllByTestId } = render(
      <LeaderboardList rows={[ROWS[0]]} scope="week" />,
    );
    expect(queryAllByTestId('leaderboard-medal').length).toBe(0);
  });

  it('shows solo fallback copy for single-row data', () => {
    const { getByText } = render(
      <LeaderboardList rows={[ROWS[0]]} scope="week" />,
    );
    expect(getByText('leaderboard.soloFallback')).toBeTruthy();
  });

  it('shows empty-state copy for zero rows', () => {
    const { getByText } = render(
      <LeaderboardList rows={[]} scope="week" />,
    );
    expect(getByText('leaderboard.emptyState')).toBeTruthy();
  });
});
