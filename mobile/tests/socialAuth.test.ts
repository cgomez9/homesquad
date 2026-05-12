import { signInWithApple } from '../src/lib/auth';
import { supabase } from '../src/lib/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
    },
  },
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 'email', FULL_NAME: 'fullName' },
}));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const mockedApple = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;

beforeEach(() => jest.clearAllMocks());

describe('signInWithApple', () => {
  it('passes the Apple identity token to supabase.auth.signInWithIdToken', async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: 'apple-id-token-xyz',
      user: 'user-id',
    } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: null } as any);

    await signInWithApple();

    expect(mockedAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token-xyz',
    });
  });

  it('throws when Apple returns no identity token', async () => {
    mockedApple.signInAsync.mockResolvedValue({ identityToken: null } as any);
    await expect(signInWithApple()).rejects.toThrow(/identity token/i);
  });

  it('throws when supabase returns an error', async () => {
    mockedApple.signInAsync.mockResolvedValue({ identityToken: 'tok' } as any);
    mockedAuth.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'invalid' } } as any);
    await expect(signInWithApple()).rejects.toThrow('invalid');
  });
});
