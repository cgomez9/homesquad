// mobile/tests/quietHoursPicker.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QuietHoursPicker } from '../src/components/QuietHoursPicker';

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

describe('QuietHoursPicker', () => {
  it('renders enabled toggle in initial state', () => {
    const { getByTestId } = render(
      <QuietHoursPicker
        enabled={true}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={jest.fn()}
      />,
    );
    expect(getByTestId('quiet-hours-toggle').props.value).toBe(true);
  });

  it('calls onSave with new values when Save tapped', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <QuietHoursPicker
        enabled={true}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={onSave}
      />,
    );
    fireEvent.press(getByTestId('quiet-hours-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      enabled: true, start: '21:00', end: '07:00', timezone: 'UTC',
    });
  });

  it('hides the time pickers when toggle is off', () => {
    const { queryByTestId } = render(
      <QuietHoursPicker
        enabled={false}
        start="21:00"
        end="07:00"
        timezone="UTC"
        onSave={jest.fn()}
      />,
    );
    expect(queryByTestId('quiet-hours-start-picker')).toBeNull();
    expect(queryByTestId('quiet-hours-end-picker')).toBeNull();
  });
});
