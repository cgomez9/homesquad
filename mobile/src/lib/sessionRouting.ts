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
  // Exception: the create-family / join-family / add-kid / add-chores screens
  // are the actual wizard. By the time the user is submitting create-family,
  // a successful RPC means family.has-family is racing to land — sometimes
  // BEFORE router.replace to add-kid has updated useSegments. If we evacuate
  // to /(app) on the create-family screen we cut the wizard short and skip
  // add-kid + add-chores entirely. The original stranding-bug fix only needs
  // to fire on the entry-point welcome screen (and bare-group fallback).
  if (family.status === 'has-family') {
    // Empty segments means the navigator is mid-(re)mount — useSegments() has
    // no route yet. Evacuating here is exactly how the create-family wizard got
    // cut short: a refetchFamily() during submit briefly unmounted the
    // navigator, and the has-family read landed against empty segments → we
    // bounced to /(app), skipping add-kid + add-chores. Never decide on an
    // unknown location. (The primary fix keeps the navigator mounted; this is
    // the backstop.)
    if (segments.length === 0) return null;
    const inOnboardingWizard =
      segments[0] === '(onboarding)' &&
      (segments[1] === 'create-family' ||
        segments[1] === 'join-family' ||
        segments[1] === 'add-kid' ||
        segments[1] === 'add-chores');
    if (inOnboardingWizard) return null;
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

// Whether the root layout should show its full-screen boot spinner. True ONLY
// during the very first resolve after launch/sign-in. Crucially, a later
// refetchFamily() flips family → 'loading' again; the layout must NOT treat
// that as "boot" and unmount the navigator, or it tears down an in-progress
// navigation (e.g. create-family → add-kid) and strands/evacuates the user.
// The layout latches on the first `false` and never blocks on family/kid
// loading again.
export function isBootLoading(
  auth: AuthState,
  kidSession: KidSessionState,
  family: FamilyState,
): boolean {
  if (auth.status === 'loading') return true;
  if (auth.status === 'authenticated' && (kidSession.status === 'loading' || family.status === 'loading')) {
    return true;
  }
  return false;
}
