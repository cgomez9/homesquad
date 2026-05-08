import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PinPad } from '../src/components/PinPad';

describe('PinPad', () => {
  it('calls onSubmit with 4 digits when 4 keys pressed', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<PinPad onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('4'));
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('calls onCancel when Cancel pressed', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<PinPad onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error message when prop set', () => {
    const { getByText } = render(<PinPad onSubmit={() => {}} onCancel={() => {}} error="Wrong PIN" />);
    expect(getByText('Wrong PIN')).toBeTruthy();
  });
});
