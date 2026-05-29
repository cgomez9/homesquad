import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PairCodeInput } from '../src/components/PairCodeInput';

describe('PairCodeInput', () => {
  it('renders 6 boxes', () => {
    const { getAllByTestId } = render(<PairCodeInput value="" onChange={() => {}} />);
    expect(getAllByTestId('pair-digit')).toHaveLength(6);
  });

  it('calls onChange with concatenated digits as user types', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={onChange} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), '4');
    expect(onChange).toHaveBeenLastCalledWith('4');
    fireEvent.changeText(getByTestId('pair-hidden-input'), '48');
    expect(onChange).toHaveBeenLastCalledWith('48');
  });

  it('strips non-digits and caps at 6 chars', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={onChange} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), 'abc1234567');
    expect(onChange).toHaveBeenLastCalledWith('123456');
  });

  it('calls onSubmit when 6 digits entered', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<PairCodeInput value="" onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.changeText(getByTestId('pair-hidden-input'), '482619');
    expect(onSubmit).toHaveBeenCalledWith('482619');
  });
});
