import { decideRoute } from '../src/lib/sessionRouting';
import type { AuthState } from '../src/hooks/useAuth';
import type { KidSessionState } from '../src/hooks/useKidSession';
import type { FamilyState } from '../src/hooks/useFamily';

const authed = (isAnon = false): AuthState =>
  ({ status: 'authenticated', session: { user: { id: 'u1', is_anonymous: isAnon } } } as any);

const notKid: KidSessionState = { status: 'not-kid' };
const hasFamily: FamilyState = { status: 'has-family', familyId: 'f1' };
const noFamily: FamilyState = { status: 'no-family' };

describe('decideRoute', () => {
  it('waits (null) while auth is loading', () => {
    expect(decideRoute({ status: 'loading' }, { status: 'loading' }, { status: 'loading' }, ['(auth)'])).toBeNull();
  });

  it('waits (null) while family is still loading after auth resolves', () => {
    expect(decideRoute(authed(), notKid, { status: 'loading' }, ['(auth)'])).toBeNull();
  });

  it('waits (null) while the kid session is still loading after auth resolves', () => {
    expect(decideRoute(authed(), { status: 'loading' }, hasFamily, ['(auth)'])).toBeNull();
  });

  it('sends unauthenticated users to login', () => {
    expect(decideRoute({ status: 'unauthenticated' }, notKid, noFamily, ['(app)'])).toBe('/(auth)/login');
  });

  it('sends a real parent with no family to onboarding', () => {
    expect(decideRoute(authed(), notKid, noFamily, ['(auth)'])).toBe('/(onboarding)/welcome');
  });

  it('sends an anonymous device with no family to pairing', () => {
    expect(decideRoute(authed(true), notKid, noFamily, ['(auth)'])).toBe('/(pair)');
  });

  it('routes a kid session to its kid home', () => {
    const kid: KidSessionState = { status: 'kid', kidId: 'k1', familyId: 'f1', deviceId: 'd1' };
    expect(decideRoute(authed(true), kid, hasFamily, ['(auth)'])).toBe('/(app)/kid/k1');
  });

  // THE BUG: a parent who already has a family was stranded on the onboarding
  // screen because the only "has-family -> app" bounce required the auth group.
  it('bounces a has-family parent OUT of onboarding into the app', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)'])).toBe('/(app)');
  });

  it('bounces a has-family parent from the auth group into the app', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(auth)'])).toBe('/(app)');
  });

  it('leaves a has-family parent already in the app alone', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(app)'])).toBeNull();
  });

  // A failed family lookup must NOT masquerade as "no family" and dump an
  // existing user into onboarding.
  it('never routes to onboarding when the family lookup errored', () => {
    expect(decideRoute(authed(), notKid, { status: 'error' }, ['(auth)'])).toBeNull();
  });
});
