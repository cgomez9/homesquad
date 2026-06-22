import type { PrivilegeIconId } from './privilegeIcons';

export type PrivilegePreset = {
  key: string;
  titleKey: string;
  descriptionKey: string;
  tokenCost: number;
  iconId: PrivilegeIconId;
};

export const PRIVILEGE_PRESETS: PrivilegePreset[] = [
  { key: 'extra_screen_time', titleKey: 'parent.privilegePresets.extraScreenTime.title', descriptionKey: 'parent.privilegePresets.extraScreenTime.description', tokenCost: 2, iconId: 2 },
  { key: 'pick_movie',        titleKey: 'parent.privilegePresets.pickMovie.title',        descriptionKey: 'parent.privilegePresets.pickMovie.description',        tokenCost: 3, iconId: 8 },
  { key: 'choose_dinner',     titleKey: 'parent.privilegePresets.chooseDinner.title',     descriptionKey: 'parent.privilegePresets.chooseDinner.description',     tokenCost: 3, iconId: 4 },
  { key: 'stay_up_later',     titleKey: 'parent.privilegePresets.stayUpLater.title',      descriptionKey: 'parent.privilegePresets.stayUpLater.description',      tokenCost: 4, iconId: 3 },
];
