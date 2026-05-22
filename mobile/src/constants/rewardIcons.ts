export type RewardIconId = 1|2|3|4|5|6|7|8;

export const REWARD_ICONS: Record<RewardIconId, { emoji: string; labelKey: string }> = {
  1: { emoji: '🎁',  labelKey: 'gift' },
  2: { emoji: '🍦',  labelKey: 'treat' },
  3: { emoji: '🎮',  labelKey: 'game' },
  4: { emoji: '💵',  labelKey: 'cash' },
  5: { emoji: '⏰',  labelKey: 'time' },
  6: { emoji: '🍪',  labelKey: 'snack' },
  7: { emoji: '🎬',  labelKey: 'movie' },
  8: { emoji: '🧸',  labelKey: 'toy' },
};

export const REWARD_ICON_IDS: RewardIconId[] = [1, 2, 3, 4, 5, 6, 7, 8];
