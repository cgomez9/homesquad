// mobile/tests/pushPrefsList.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PushPrefsList, EVENT_TYPES } from '../src/components/PushPrefsList';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

describe('PushPrefsList', () => {
  it('renders one toggle per event_type', () => {
    const { getAllByRole } = render(
      <PushPrefsList prefs={{}} onTogglePref={jest.fn()} />,
    );
    expect(getAllByRole('switch').length).toBe(EVENT_TYPES.length);
  });

  it('treats missing keys as enabled', () => {
    const { getByTestId } = render(
      <PushPrefsList prefs={{}} onTogglePref={jest.fn()} />,
    );
    expect(getByTestId(`push-pref-toggle-${EVENT_TYPES[0]}`).props.value).toBe(true);
  });

  it('reflects explicit false as off', () => {
    const { getByTestId } = render(
      <PushPrefsList prefs={{ chore_submitted: false }} onTogglePref={jest.fn()} />,
    );
    expect(getByTestId('push-pref-toggle-chore_submitted').props.value).toBe(false);
  });

  it('calls onTogglePref with (event, nextValue) on flip', async () => {
    const onTogglePref = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <PushPrefsList prefs={{}} onTogglePref={onTogglePref} />,
    );
    fireEvent(getByTestId('push-pref-toggle-chore_submitted'), 'valueChange', false);
    await waitFor(() =>
      expect(onTogglePref).toHaveBeenCalledWith('chore_submitted', false),
    );
  });
});
