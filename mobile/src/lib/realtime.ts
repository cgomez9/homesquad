import type { RealtimeChannel } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { emit } from './events';
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
        queryClient.invalidateQueries({ queryKey: ['leaderboard', familyId] });
        queryClient.invalidateQueries({ queryKey: ['active-goal', familyId] });
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'achievements', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const row = payload.new as { achievement_key: string; profile_id: string };
        emit('achievement_unlocked', { key: row.achievement_key, profile_id: row.profile_id });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'family_goals', filter: `family_id=eq.${familyId}` },
      (payload) => {
        queryClient.invalidateQueries({ queryKey: ['active-goal', familyId] });
        queryClient.invalidateQueries({ queryKey: ['goals-archive', familyId] });

        // Emit goal_completed when a row transitions active → completed.
        if (
          payload.eventType === 'UPDATE' &&
          (payload.old as { status?: string } | undefined)?.status === 'active' &&
          (payload.new as { status?: string; title?: string } | undefined)?.status === 'completed'
        ) {
          const title = (payload.new as { title?: string }).title ?? '';
          emit('goal_completed', { title });
        }
      },
    )
    .subscribe();
  return channel;
}
