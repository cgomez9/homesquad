import { claimChore, releaseChore, startChore, finishChore } from '../src/lib/chores';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

beforeEach(() => jest.clearAllMocks());

describe('claimChore', () => {
  it('calls rpc(claim_chore) with the actor', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await claimChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('claim_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });

  it('throws when rpc returns error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'chore not claimable' } } as any);
    await expect(claimChore('inst-1', 'actor-1')).rejects.toThrow('chore not claimable');
  });
});

describe('releaseChore', () => {
  it('calls rpc(release_chore)', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await releaseChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('release_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });
});

describe('startChore', () => {
  it('calls rpc(start_chore)', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await startChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('start_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1' });
  });
});

describe('finishChore', () => {
  it('passes photo_url when provided', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await finishChore('inst-1', 'actor-1', 'https://x.test/y.jpg');
    expect(mockedRpc).toHaveBeenCalledWith('finish_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1', photo_url: 'https://x.test/y.jpg' });
  });

  it('omits photo_url when not provided (passes undefined)', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null } as any);
    await finishChore('inst-1', 'actor-1');
    expect(mockedRpc).toHaveBeenCalledWith('finish_chore', { instance_id: 'inst-1', actor_profile_id: 'actor-1', photo_url: undefined });
  });
});
