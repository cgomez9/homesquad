import { useQueries } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const STALE_MS = 30_000;

export function usePendingDecisionsCount(): number {
  const [chores, redemptions] = useQueries({
    queries: [
      {
        queryKey: ['approvals-chores-count'],
        queryFn: async (): Promise<number> => {
          const { count, error } = await supabase
            .from('chore_instances')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'submitted');
          if (error) throw error;
          return count ?? 0;
        },
        staleTime: STALE_MS,
      },
      {
        queryKey: ['approvals-redemptions-pending-count'],
        queryFn: async (): Promise<number> => {
          const { count, error } = await supabase
            .from('redemptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
          if (error) throw error;
          return count ?? 0;
        },
        staleTime: STALE_MS,
      },
    ],
  });
  return (chores.data ?? 0) + (redemptions.data ?? 0);
}
