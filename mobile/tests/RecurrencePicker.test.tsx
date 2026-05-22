import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecurrencePicker } from '../src/components/RecurrencePicker';
import type { Recurrence } from '../src/lib/recurrence';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: any) =>
      o == null ? k : (o.title ?? `${k} ${Object.values(o).join(' ')}`),
  }),
}));

jest.mock('../src/theme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#0EA5A4',
      primaryDark: '#0F766E',
      accent: '#FB7185',
      bg: '#FEFCF7',
      surface: '#FFFFFF',
      text: '#134E4A',
      textMuted: '#5C7A78',
      border: '#D6E5E3',
      success: '#34D399',
      warning: '#F97316',
      error: '#E11D48',
    },
  }),
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radii: { sm: 8, md: 12, lg: 14, pill: 999 },
  typography: {
    fontFamily: 'System',
    fontFamilySemi: 'System',
    fontFamilyBold: 'System',
    h1: 28,
    h2: 22,
    body: 15,
    small: 13,
    tiny: 11,
  },
}));

function controlled(initial: Recurrence) {
  let value = initial;
  const onChange = jest.fn((next: Recurrence) => { value = next; });
  return { get value() { return value; }, onChange };
}

describe('RecurrencePicker times UI', () => {
  it('renders Specific times toggle off by default for daily without times', () => {
    const { onChange } = controlled({ type: 'daily' });
    const { getByTestId } = render(
      <RecurrencePicker value={{ type: 'daily' }} onChange={onChange} />,
    );
    const toggle = getByTestId('specific-times-toggle');
    expect(toggle.props.value).toBe(false);
  });

  it('turning the toggle on starts with empty times and shows the picker trigger', () => {
    const ctrl = controlled({ type: 'daily' });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent(getByTestId('specific-times-toggle'), 'valueChange', true);
    expect(ctrl.onChange).toHaveBeenCalledWith({ type: 'daily', times: [] });
    const tree = render(
      <RecurrencePicker value={{ type: 'daily', times: [] }} onChange={ctrl.onChange} />,
    );
    expect(tree.queryByTestId('time-picker-trigger')).not.toBeNull();
  });

  it('tapping the trigger opens the modal and confirming a time adds it sorted', () => {
    const ctrl = controlled({ type: 'daily', times: ['20:00'] });
    const { getByTestId, queryByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    expect(queryByTestId('time-picker-modal')).toBeNull();
    fireEvent.press(getByTestId('time-picker-trigger'));
    expect(getByTestId('time-picker-modal')).not.toBeNull();
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).toHaveBeenLastCalledWith({ type: 'daily', times: ['08:00', '20:00'] });
  });

  it('confirming a duplicate time is a silent no-op', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-picker-trigger'));
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).not.toHaveBeenCalled();
  });

  it('removing a time chip drops it', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00', '20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-chip-remove-08:00'));
    expect(ctrl.onChange).toHaveBeenCalledWith({ type: 'daily', times: ['20:00'] });
  });

  it('tapping a chip opens the picker in edit mode and confirming replaces the value', () => {
    const ctrl = controlled({ type: 'daily', times: ['08:00', '20:00'] });
    const { getByTestId } = render(
      <RecurrencePicker value={ctrl.value} onChange={ctrl.onChange} />,
    );
    fireEvent.press(getByTestId('time-chip-08:00'));
    expect(getByTestId('time-picker-modal')).not.toBeNull();
    fireEvent.press(getByTestId('time-picker-confirm'));
    expect(ctrl.onChange).not.toHaveBeenCalled();
  });
});
