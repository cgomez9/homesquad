import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { KidDevicesList } from '../src/components/KidDevicesList';
import { revokeKidDevice } from '../src/lib/pairing';

jest.mock('../src/lib/pairing', () => ({ revokeKidDevice: jest.fn().mockResolvedValue(undefined) }));

const devices = [
  { id: 'd1', device_name: "Luna's iPad", last_seen_at: '2026-05-28T10:00:00Z' },
  { id: 'd2', device_name: "Luna's Phone", last_seen_at: '2026-05-28T09:00:00Z' },
];

describe('KidDevicesList', () => {
  it('renders one row per device', () => {
    const { getByText } = render(<KidDevicesList kidId="k1" devices={devices} onPair={() => {}} onChanged={() => {}} />);
    expect(getByText("Luna's iPad")).toBeTruthy();
    expect(getByText("Luna's Phone")).toBeTruthy();
  });

  it('calls onPair when "Pair a new device" pressed', () => {
    const onPair = jest.fn();
    const { getByText } = render(<KidDevicesList kidId="k1" devices={[]} onPair={onPair} onChanged={() => {}} />);
    fireEvent.press(getByText(/pair a new device/i));
    expect(onPair).toHaveBeenCalledWith('k1');
  });

  it('confirms then calls revokeKidDevice', async () => {
    const onChanged = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { getByTestId } = render(<KidDevicesList kidId="k1" devices={devices} onPair={() => {}} onChanged={onChanged} />);
    fireEvent.press(getByTestId('revoke-d1'));
    expect(Alert.alert).toHaveBeenCalled();
    await Promise.resolve();
    expect(revokeKidDevice).toHaveBeenCalledWith('d1');
    expect(onChanged).toHaveBeenCalled();
  });
});
