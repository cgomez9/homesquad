import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RewardIconPicker } from '../src/components/RewardIconPicker';

describe('RewardIconPicker', () => {
  it('renders all 8 icons', () => {
    const { getByText } = render(<RewardIconPicker value={1} onChange={() => {}} />);
    expect(getByText('🎁')).toBeTruthy();
    expect(getByText('🍦')).toBeTruthy();
    expect(getByText('🎮')).toBeTruthy();
    expect(getByText('💵')).toBeTruthy();
    expect(getByText('⏰')).toBeTruthy();
    expect(getByText('🍪')).toBeTruthy();
    expect(getByText('🎬')).toBeTruthy();
    expect(getByText('🧸')).toBeTruthy();
  });

  it('calls onChange with the icon id when tapped', () => {
    const onChange = jest.fn();
    const { getByText } = render(<RewardIconPicker value={1} onChange={onChange} />);
    fireEvent.press(getByText('🎮'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('marks the selected icon', () => {
    const { getByTestId } = render(<RewardIconPicker value={4} onChange={() => {}} />);
    expect(getByTestId('reward-icon-4').props.accessibilityState).toMatchObject({ selected: true });
  });
});
