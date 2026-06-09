import { decideRoute, isBootLoading } from '../src/lib/sessionRouting';
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

  // Race during the onboarding wizard: create-family RPC succeeds, refetchFamily
  // flips family → has-family, router.replace moves to add-kid. The root-layout
  // effect re-runs decideRoute with new family state + new segments. Without
  // the wizard exemption it would return '/(app)' and cut the wizard short
  // before the user adds any kid or initial chore — the iOS-TestFlight bug
  // that surfaced on 2026-06-08. The race fires BEFORE navigation lands, so
  // the exemption has to cover create-family and join-family too, not just
  // the post-navigation add-kid/add-chores screens.
  it('lets a has-family parent stay on create-family (race window during submit)', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)', 'create-family'])).toBeNull();
  });

  it('lets a has-family parent stay on join-family (race window during submit)', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)', 'join-family'])).toBeNull();
  });

  it('lets a has-family parent stay on add-kid (post-creation onboarding step)', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)', 'add-kid'])).toBeNull();
  });

  it('lets a has-family parent stay on add-chores (post-creation onboarding step)', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)', 'add-chores'])).toBeNull();
  });

  // Original stranding-bug scenario is still protected: if family lookup
  // returns has-family while the user happens to be on the welcome screen,
  // evacuate to (app) (welcome is an entry point, not a wizard step).
  it('still bounces a has-family parent OUT of welcome', () => {
    expect(decideRoute(authed(), notKid, hasFamily, ['(onboarding)', 'welcome'])).toBe('/(app)');
  });

  // A failed family lookup must NOT masquerade as "no family" and dump an
  // existing user into onboarding.
  it('never routes to onboarding when the family lookup errored', () => {
    expect(decideRoute(authed(), notKid, { status: 'error' }, ['(auth)'])).toBeNull();
  });

  // Defensive: if the navigator is mid-remount, useSegments() returns []. We
  // must NOT evacuate a has-family user to /(app) on empty segments — that is
  // the deeper cause of the iOS create-family wizard skip (the real fix keeps
  // the navigator mounted; this guard backstops it).
  it('does not evacuate a has-family parent when segments are momentarily empty', () => {
    expect(decideRoute(authed(), notKid, hasFamily, [])).toBeNull();
  });
});

describe('isBootLoading', () => {
  // Used by the root layout to decide whether to show the full-screen boot
  // spinner. It must be true ONLY during the very first resolve — a later
  // refetchFamily() must NOT make it true, or the layout would unmount the
  // navigator mid-flow and drop the in-progress onboarding navigation.
  it('is true while auth itself is loading', () => {
    expect(isBootLoading({ status: 'loading' }, { status: 'loading' }, { status: 'loading' })).toBe(true);
  });

  it('is true while family is resolving right after auth', () => {
    expect(isBootLoading(authed(), notKid, { status: 'loading' })).toBe(true);
  });

  it('is true while the kid session is resolving right after auth', () => {
    expect(isBootLoading(authed(), { status: 'loading' }, hasFamily)).toBe(true);
  });

  it('is false once auth + kid + family are all settled', () => {
    expect(isBootLoading(authed(), notKid, hasFamily)).toBe(false);
  });

  it('is false when unauthenticated (nothing left to resolve)', () => {
    expect(isBootLoading({ status: 'unauthenticated' }, notKid, noFamily)).toBe(false);
  });
});
