import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { AchievementBanner } from '../src/components/AchievementBanner';
import { enqueueCelebrations } from '../src/lib/celebrations';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: any) =>
      o == null ? k : (o.title ?? `${k} ${Object.values(o).join(' ')}`),
  }),
}));
jest.mock('expo-router', () => ({ useSegments: () => ['(app)', 'kid', '[profileId]'] }));
jest.mock('../src/lib/feedback', () => ({ fireAchievementFeedback: jest.fn() }));

describe('AchievementBanner programmatic queue', () => {
  it('renders a chore_approved card then an achievement card in order', async () => {
    const { getByText, queryByText } = render(<AchievementBanner />);
    act(() => {
      enqueueCelebrations([
        { kind: 'chore_approved', id: 'a1', at: 'x', title: 'Dishes', stars: 3 },
        { kind: 'achievement', id: 'b1', at: 'y', achievementKey: 'stargazer' },
      ]);
    });
    await waitFor(() => expect(getByText(/Dishes/)).toBeTruthy());
    expect(queryByText('First Star')).toBeNull(); // queued, not yet shown
  });

  it('renders a summary card', async () => {
    const { getByText } = render(<AchievementBanner />);
    act(() => {
      enqueueCelebrations([{ kind: 'summary', moreCount: 3, extraStars: 12 }]);
    });
    await waitFor(() => expect(getByText(/3/)).toBeTruthy());
  });
});
