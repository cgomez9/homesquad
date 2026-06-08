import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useKidSession, type KidSessionState } from '../src/hooks/useKidSession';
import { useFamily, type FamilyState } from '../src/hooks/useFamily';

type UidProps = { uid: string | undefined };

// Controllable supabase mock: every query chain is awaited via `.maybeSingle()`,
// which returns a promise whose resolver we stash on a global keyed by table.
// Tests resolve them explicitly to drive the async state machine.
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        maybeSingle: () =>
          new Promise((resolve) => {
            (global as any).__resolvers[table] = resolve;
          }),
      };
      return builder;
    },
  },
}));

beforeEach(() => {
  (global as any).__resolvers = {};
});

function resolve(table: string, value: any) {
  const r = (global as any).__resolvers[table];
  if (r) r(value);
}

describe('useKidSession', () => {
  it('returns to loading while re-querying after userId becomes defined', async () => {
    const { result, rerender } = renderHook<KidSessionState, UidProps>(({ uid }) => useKidSession(uid), {
      initialProps: { uid: undefined },
    });

    // No user yet → resolves to not-kid.
    await waitFor(() => expect(result.current.status).toBe('not-kid'));

    // User signs in. The kid_devices lookup is now in flight, so the hook must
    // report `loading` rather than leaving the stale `not-kid` in place — the
    // root layout's wait-guard keys off `loading`.
    await act(async () => {
      rerender({ uid: 'u1' });
    });
    expect(result.current.status).toBe('loading');
  });
});

describe('useFamily', () => {
  it('returns to loading while re-querying after userId becomes defined', async () => {
    const { result, rerender } = renderHook<FamilyState, UidProps>(({ uid }) => useFamily(uid), {
      initialProps: { uid: undefined },
    });

    await waitFor(() => expect(result.current.status).toBe('no-family'));

    await act(async () => {
      rerender({ uid: 'u1' });
    });
    expect(result.current.status).toBe('loading');
  });

  it('does not report no-family when the profile lookup errors', async () => {
    const { result } = renderHook(() => useFamily('u1'));

    // Internal kid-session lookup resolves first (not a kid)...
    await act(async () => {
      resolve('kid_devices', { data: null, error: null });
    });
    // ...then the profiles lookup fails (e.g. transient RLS/permission error).
    await waitFor(() => expect((global as any).__resolvers['profiles']).toBeDefined());
    await act(async () => {
      resolve('profiles', { data: null, error: { message: 'permission denied' } });
    });

    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    expect(result.current.status).toBe('error');
  });

  it('reports has-family once the profile resolves', async () => {
    const { result } = renderHook(() => useFamily('u1'));

    await act(async () => {
      resolve('kid_devices', { data: null, error: null });
    });
    await waitFor(() => expect((global as any).__resolvers['profiles']).toBeDefined());
    await act(async () => {
      resolve('profiles', { data: { family_id: 'f1' }, error: null });
    });

    await waitFor(() => expect(result.current.status).toBe('has-family'));
    expect(result.current).toEqual({ status: 'has-family', familyId: 'f1' });
  });
});
