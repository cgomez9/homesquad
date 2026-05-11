import type { RealtimeChannel } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function subscribeToFamily(familyId: string, queryClient: QueryClient): RealtimeChannel {
  const channel = supabase
    .channel(`family-${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chore_instances', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['kid-today'] });
        queryClient.invalidateQueries({ queryKey: ['approvals-chores'] });
        queryClient.invalidateQueries({ queryKey: ['activity-chores'] });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'redemptions', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['approvals-redemptions-pending'] });
        queryClient.invalidateQueries({ queryKey: ['approvals-redemptions-approved'] });
        queryClient.invalidateQueries({ queryKey: ['kid-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['kid-open-redemptions'] });
        queryClient.invalidateQueries({ queryKey: ['activity-redemptions'] });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'star_ledger', filter: `family_id=eq.${familyId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ['balance'] });
        queryClient.invalidateQueries({ queryKey: ['streak'] });
      },
    )
    .subscribe();
  return channel;
}
