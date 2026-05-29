import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PairDeviceModal } from '../src/components/PairDeviceModal';
import { startDevicePairing } from '../src/lib/pairing';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/pairing', () => ({ startDevicePairing: jest.fn() }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  },
}));

describe('PairDeviceModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a code on open and shows it', async () => {
    (startDevicePairing as jest.Mock).mockResolvedValue({
      code: '482619',
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    const { findByText } = render(<PairDeviceModal kidId="k1" visible onClose={() => {}} onPaired={() => {}} />);
    expect(await findByText(/482619/)).toBeTruthy();
  });

  it('calls onPaired when realtime payload arrives', async () => {
    (startDevicePairing as jest.Mock).mockResolvedValue({
      code: '482619',
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    let captured: ((p: any) => void) | undefined;
    (supabase.channel as jest.Mock).mockReturnValue({
      on: jest.fn((_e: any, _f: any, cb: any) => { captured = cb; return { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }; }),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    });
    const onPaired = jest.fn();
    render(<PairDeviceModal kidId="k1" visible onClose={() => {}} onPaired={onPaired} />);
    await waitFor(() => expect(captured).toBeDefined());
    captured!({ new: { kid_id: 'k1', device_name: 'KidPhone' } });
    expect(onPaired).toHaveBeenCalledWith({ kid_id: 'k1', device_name: 'KidPhone' });
  });
});
