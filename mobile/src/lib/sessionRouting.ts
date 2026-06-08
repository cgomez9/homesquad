// Pure routing decision for the root layout. Given the resolved auth / kid /
// family state and the current route segments, return the path to navigate to,
// or null to stay put. Kept side-effect-free so it can be unit-tested in
// isolation from expo-router and the async hooks that feed it.
import type { AuthState } from '../hooks/useAuth';
import type { KidSessionState } from '../hooks/useKidSession';
import type { FamilyState } from '../hooks/useFamily';

export function decideRoute(
  auth: AuthState,
  kidSession: KidSessionState,
  family: FamilyState,
  segments: string[],
): string | null {
  // Don't route until we know enough. While anything we depend on is still
  // resolving we wait — acting on a half-loaded state is what stranded
  // existing-family users on the onboarding screen.
  if (auth.status === 'loading') return null;
  if (auth.status === 'authenticated' && (kidSession.status === 'loading' || family.status === 'loading')) {
    return null;
  }

  const inAuthGroup = segments[0] === '(auth)';
  const inAppGroup = segments[0] === '(app)';

  // Unauthenticated → login.
  if (auth.status === 'unauthenticated') {
    return inAuthGroup ? null : '/(auth)/login';
  }

  // Kid session → land on kid mode for the bound kid.
  if (kidSession.status === 'kid') {
    return inAppGroup ? null : `/(app)/kid/${kidSession.kidId}`;
  }

  // Authenticated user with a family → always the app, regardless of which
  // group they happen to be sitting in (auth OR onboarding OR pair). This is
  // the fix for the stranding bug: previously this only fired from the auth
  // group, so a brief stale `no-family` read could push a real member into
  // onboarding with no way back.
  //
  // Exception: add-kid and add-chores are post-creation steps of the same
  // onboarding wizard. The user reached them via router.replace from
  // create-family/join-family — by definition family.has-family was just
  // achieved, and yanking them to /(app) here cuts the wizard short before
  // they can add kids or initial chores.
  if (family.status === 'has-family') {
    const inPostCreationOnboarding =
      segments[0] === '(onboarding)' &&
      (segments[1] === 'add-kid' || segments[1] === 'add-chores');
    if (inPostCreationOnboarding) return null;
    return inAppGroup ? null : '/(app)';
  }

  // Confirmed no family. Anonymous device → pairing; real user → onboarding.
  if (kidSession.status === 'not-kid' && family.status === 'no-family') {
    const isAnon = auth.status === 'authenticated' && !!auth.session.user.is_anonymous;
    if (isAnon) {
      return segments[0] === '(pair)' ? null : '/(pair)';
    }
    return segments[0] === '(onboarding)' ? null : '/(onboarding)/welcome';
  }

  // family.status === 'error' (lookup failed) or any other indeterminate
  // state → do nothing. Never fall through to onboarding on uncertainty.
  return null;
}
