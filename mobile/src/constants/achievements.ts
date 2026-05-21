export type AchievementKey =
  | 'stargazer' | 'stars_100' | 'stars_500'
  | 'streak_7' | 'streak_30'
  | 'first_chore' | 'chores_25'
  | 'first_reward';

export const ACHIEVEMENTS: Record<AchievementKey, { emoji: string; title: string; description: string }> = {
  stargazer:    { emoji: '⭐', title: 'Stargazer',      description: 'Earn 10 stars total' },
  stars_100:    { emoji: '💯', title: 'Century',         description: 'Earn 100 stars total' },
  stars_500:    { emoji: '🏆', title: 'High Roller',     description: 'Earn 500 stars total' },
  streak_7:     { emoji: '🔥', title: 'Week Streak',     description: 'Earn stars 7 days in a row' },
  streak_30:    { emoji: '🌟', title: 'Month Streak',    description: 'Earn stars 30 days in a row' },
  first_chore:  { emoji: '✅', title: 'Getting Started', description: 'Get your first chore approved' },
  chores_25:    { emoji: '💪', title: 'Quarter Century', description: 'Get 25 chores approved' },
  first_reward: { emoji: '🎁', title: 'First Reward',    description: 'Redeem your first reward' },
};

export const ACHIEVEMENT_KEYS: AchievementKey[] = [
  'stargazer', 'stars_100', 'stars_500',
  'streak_7', 'streak_30',
  'first_chore', 'chores_25',
  'first_reward',
];
