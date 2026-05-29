import {
  startDevicePairing,
  redeemPairingCode,
  revokeKidDevice,
  signInAnonymouslyAndPair,
} from '../src/lib/pairing';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { signInAnonymously: jest.fn() },
    rpc: jest.fn(),
  },
}));
jest.mock('expo-device', () => ({ deviceName: 'TestDevice' }));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => jest.clearAllMocks());

describe('startDevicePairing', () => {
  it('calls rpc(start_device_pairing) with kid_id and returns code + expiry', async () => {
    mockedRpc.mockResolvedValue({ data: [{ code: '482619', expires_at: '2026-05-28T12:05:00Z' }], error: null } as any);
    const result = await startDevicePairing('kid-uuid-1');
    expect(mockedRpc).toHaveBeenCalledWith('start_device_pairing', { target_kid_id: 'kid-uuid-1' });
    expect(result).toEqual({ code: '482619', expiresAt: new Date('2026-05-28T12:05:00Z') });
  });

  it('throws when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'nope' } } as any);
    await expect(startDevicePairing('x')).rejects.toThrow('nope');
  });
});

describe('redeemPairingCode', () => {
  it('passes code + device name to rpc(redeem_device_pairing)', async () => {
    mockedRpc.mockResolvedValue({ data: 'kid-uuid-1', error: null } as any);
    const kidId = await redeemPairingCode('482619');
    expect(mockedRpc).toHaveBeenCalledWith('redeem_device_pairing', {
      pair_code: '482619',
      device_name: 'TestDevice',
    });
    expect(kidId).toBe('kid-uuid-1');
  });

  it('throws the generic error when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'Invalid or expired code' } } as any);
    await expect(redeemPairingCode('000000')).rejects.toThrow('Invalid or expired code');
  });
});

describe('revokeKidDevice', () => {
  it('calls rpc(revoke_kid_device) with device id', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await revokeKidDevice('dev-uuid-1');
    expect(mockedRpc).toHaveBeenCalledWith('revoke_kid_device', { device_id: 'dev-uuid-1' });
  });
});

describe('signInAnonymouslyAndPair', () => {
  it('signs in anonymously then redeems', async () => {
    mockedAuth.signInAnonymously.mockResolvedValue({ data: { session: {} }, error: null } as any);
    mockedRpc.mockResolvedValue({ data: 'kid-uuid-1', error: null } as any);
    const kidId = await signInAnonymouslyAndPair('482619');
    expect(mockedAuth.signInAnonymously).toHaveBeenCalled();
    expect(mockedRpc).toHaveBeenCalledWith('redeem_device_pairing', { pair_code: '482619', device_name: 'TestDevice' });
    expect(kidId).toBe('kid-uuid-1');
  });
});
