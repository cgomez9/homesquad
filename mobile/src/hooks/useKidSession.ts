import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type KidSessionState =
  | { status: 'loading' }
  | { status: 'not-kid' }
  | { status: 'kid'; kidId: string; familyId: string; deviceId: string };

export function useKidSession(userId: string | undefined): KidSessionState {
  const [state, setState] = useState<KidSessionState>({ status: 'loading' });

  useEffect(() => {
    if (!userId) {
      setState({ status: 'not-kid' });
      return;
    }
    let cancelled = false;

    supabase
      .from('kid_devices')
      .select('id, kid_id, family_id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({ status: 'not-kid' });
          return;
        }
        setState({ status: 'kid', kidId: data.kid_id, familyId: data.family_id, deviceId: data.id });
      });

    return () => { cancelled = true; };
  }, [userId]);

  return state;
}
