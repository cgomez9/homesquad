export type AchievementKey =
  | 'stargazer' | 'stars_100' | 'stars_500'
  | 'streak_7' | 'streak_30'
  | 'first_chore' | 'chores_25'
  | 'first_reward'
  | 'first_skill_task' | 'skill_tasks_25' | 'skill_tasks_100'
  | 'skill_streak_14';

export const ACHIEVEMENTS: Record<AchievementKey, { emoji: string; title: string; description: string }> = {
  stargazer:        { emoji: '⭐', title: 'Stargazer',         description: 'Earn 10 stars total' },
  stars_100:        { emoji: '💯', title: 'Century',            description: 'Earn 100 stars total' },
  stars_500:        { emoji: '🏆', title: 'High Roller',        description: 'Earn 500 stars total' },
  streak_7:         { emoji: '🔥', title: 'Week Streak',        description: 'Earn stars 7 days in a row' },
  streak_30:        { emoji: '🌟', title: 'Month Streak',       description: 'Earn stars 30 days in a row' },
  first_chore:      { emoji: '✅', title: 'Getting Started',    description: 'Get your first chore approved' },
  chores_25:        { emoji: '💪', title: 'Quarter Century',    description: 'Get 25 chores approved' },
  first_reward:     { emoji: '🎁', title: 'First Reward',       description: 'Redeem your first reward' },
  first_skill_task: { emoji: '🎯', title: 'First Practice',     description: 'Get your first skill task approved' },
  skill_tasks_25:   { emoji: '🪙', title: 'Skill Builder',      description: 'Get 25 skill tasks approved' },
  skill_tasks_100:  { emoji: '🏅', title: 'Dedicated',          description: 'Get 100 skill tasks approved' },
  skill_streak_14:  { emoji: '🎶', title: 'Two-Week Practice',  description: 'Practice the same skill 14 days in a row' },
};

export const ACHIEVEMENT_KEYS: AchievementKey[] = [
  'stargazer', 'stars_100', 'stars_500',
  'streak_7', 'streak_30',
  'first_chore', 'chores_25',
  'first_reward',
  'first_skill_task', 'skill_tasks_25', 'skill_tasks_100',
  'skill_streak_14',
];
