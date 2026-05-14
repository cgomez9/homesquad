import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type ActiveGoal = {
  id:             string;
  family_id:      string;
  title:          string;
  description:    string | null;
  target_stars:   number;
  status:         'active' | 'completed' | 'canceled';
  created_by:     string;
  created_at:     string;
  completed_at:   string | null;
  progress_stars: number;
};

export function useActiveGoal(familyId: string | undefined) {
  return useQuery({
    queryKey: ['active-goal', familyId],
    enabled:  !!familyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_active_goal', {
        p_family_id: familyId,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ActiveGoal[];
      return rows[0] ?? null;
    },
  });
}
