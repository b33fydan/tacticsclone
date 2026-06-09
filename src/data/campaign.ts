import type { JobId } from '../entities/types';

export interface CampaignNode {
  mapId: string;
  title: string;
  subtitle: string;
}

export const CAMPAIGN: CampaignNode[] = [
  { mapId: 'greenford', title: 'I. Greenford Crossing', subtitle: 'Clear the bridge' },
  { mapId: 'cliffside', title: 'II. Cliffside Watch', subtitle: 'Defeat Captain Hale' },
  { mapId: 'ruins', title: 'III. Sunken Ruins', subtitle: 'Protect Scholar Edwyn' },
  { mapId: 'ashenpass', title: 'IV. Ashen Pass', subtitle: 'Survive 8 rounds' },
  { mapId: 'bastion', title: 'V. Emberveil Bastion', subtitle: 'Defeat Warlord Maugrim' },
];

export interface StarterUnit {
  name: string;
  job: JobId;
  weapon: string;
  armor?: string;
  firstAbility: string;
}

export const STARTING_ROSTER: StarterUnit[] = [
  { name: 'Kael', job: 'bulwark', weapon: 'warden_blade', armor: 'quilted_vest', firstAbility: 'shield_bash' },
  { name: 'Wren', job: 'skywarden', weapon: 'ash_shortbow', firstAbility: 'pinning_shot' },
  { name: 'Sorrel', job: 'embercaller', weapon: 'ember_rod', firstAbility: 'ember_burst' },
  { name: 'Liora', job: 'dawnmender', weapon: 'oak_crook', firstAbility: 'mend' },
  { name: 'Vex', job: 'duskblade', weapon: 'bone_dirk', firstAbility: 'backstab' },
];

export const STARTING_GOLD = 250;
export const STARTING_INVENTORY: Record<string, number> = {
  tonic: 3,
  lifebloom: 1,
  mana_drops: 1,
};

/** Highest equipment/consumable tier available in the shop, given cleared battle count. */
export function shopTier(campaignIndex: number): number {
  if (campaignIndex >= 3) return 3;
  if (campaignIndex >= 1) return 2;
  return 1;
}
