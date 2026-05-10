export type RewardIconId = 1|2|3|4|5|6|7|8;

export const REWARD_ICONS: Record<RewardIconId, { emoji: string; label: string }> = {
  1: { emoji: '🎁',  label: 'Gift' },
  2: { emoji: '🍦',  label: 'Treat' },
  3: { emoji: '🎮',  label: 'Game' },
  4: { emoji: '💵',  label: 'Cash' },
  5: { emoji: '⏰',  label: 'Time' },
  6: { emoji: '🍪',  label: 'Snack' },
  7: { emoji: '🎬',  label: 'Movie' },
  8: { emoji: '🧸',  label: 'Toy' },
};

export const REWARD_ICON_IDS: RewardIconId[] = [1, 2, 3, 4, 5, 6, 7, 8];
