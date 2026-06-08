import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useKidSession } from './useKidSession';

export type FamilyState =
  | { status: 'loading' }
  | { status: 'no-family' }
  | { status: 'has-family'; familyId: string }
  | { status: 'error' };

const refetchListeners = new Set<() => void>();
export function refetchFamily() { refetchListeners.forEach((fn) => fn()); }

export function useFamily(userId: string | undefined): FamilyState {
  const [state, setState] = useState<FamilyState>({ status: 'loading' });
  const [refetchToken, setRefetchToken] = useState(0);
  const kidSession = useKidSession(userId);

  useEffect(() => {
    const bump = () => setRefetchToken((t) => t + 1);
    refetchListeners.add(bump);
    return () => { refetchListeners.delete(bump); };
  }, []);

  useEffect(() => {
    if (!userId) { setState({ status: 'no-family' }); return; }

    if (kidSession.status === 'kid') {
      setState({ status: 'has-family', familyId: kidSession.familyId });
      return;
    }
    if (kidSession.status === 'loading') {
      setState({ status: 'loading' });
      return;
    }

    // We have a user and a settled (non-kid) session: look up their parent
    // profile. Re-enter `loading` first so a stale `no-family` from an earlier
    // pass can't route an existing member into onboarding mid-fetch.
    setState({ status: 'loading' });
    let cancelled = false;
    supabase
      .from('profiles')
      .select('family_id')
      .eq('user_id', userId)
      .eq('type', 'parent')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed lookup is NOT "no family" — collapsing the two is what sent
        // existing users into a family-creation screen that then hard-errors.
        if (error) { console.warn('useFamily error', error); setState({ status: 'error' }); return; }
        setState(data ? { status: 'has-family', familyId: data.family_id } : { status: 'no-family' });
      });
    return () => { cancelled = true; };
  }, [userId, refetchToken, kidSession]);

  return state;
}
