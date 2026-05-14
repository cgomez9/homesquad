import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type LeaderboardRow = {
  profile_id:     string;
  display_name:   string;
  avatar_id:      number;
  week_stars:     number;
  all_time_stars: number;
  week_rank:      number;
  all_time_rank:  number;
};

export function useLeaderboard(familyId: string | undefined) {
  return useQuery({
    queryKey: ['leaderboard', familyId],
    enabled:  !!familyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_leaderboard', {
        p_family_id: familyId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
