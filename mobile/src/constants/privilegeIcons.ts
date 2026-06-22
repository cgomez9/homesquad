// Icons for privileges (non-monetary perks earned with skill tokens).
// Kept to the same 1..8 id range as reward icons so the privileges.icon_id
// check (between 1 and 8) stays valid without a migration — only the emoji /
// label meanings differ, tuned for perks rather than store-bought rewards.
export type PrivilegeIconId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PRIVILEGE_ICONS: Record<PrivilegeIconId, { emoji: string; labelKey: string }> = {
  1: { emoji: '⏰', labelKey: 'extraTime' },
  2: { emoji: '📺', labelKey: 'screenTime' },
  3: { emoji: '🛌', labelKey: 'stayUp' },
  4: { emoji: '🍽️', labelKey: 'pickMeal' },
  5: { emoji: '🎮', labelKey: 'gameTime' },
  6: { emoji: '🚗', labelKey: 'outing' },
  7: { emoji: '🎧', labelKey: 'music' },
  8: { emoji: '🎬', labelKey: 'movie' },
};

export const PRIVILEGE_ICON_IDS: PrivilegeIconId[] = [1, 2, 3, 4, 5, 6, 7, 8];
