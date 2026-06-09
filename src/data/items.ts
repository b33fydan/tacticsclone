import type { ConsumableDef, EquipmentDef } from '../entities/types';

export const CONSUMABLES: Record<string, ConsumableDef> = {
  tonic:        { id: 'tonic', name: 'Tonic', desc: 'Restores 60 HP.', cost: 40, tier: 1, kind: 'heal', amount: 60, icon: 'icon_tonic' },
  great_tonic:  { id: 'great_tonic', name: 'Great Tonic', desc: 'Restores 140 HP.', cost: 110, tier: 2, kind: 'heal', amount: 140, icon: 'icon_tonic' },
  mana_drops:   { id: 'mana_drops', name: 'Mana Drops', desc: 'Restores 40 MP.', cost: 60, tier: 1, kind: 'mp', amount: 40, icon: 'icon_mana' },
  lifebloom:    { id: 'lifebloom', name: 'Lifebloom', desc: 'Revives a fallen ally with 40% of their HP.', cost: 150, tier: 1, kind: 'revive', amount: 40, icon: 'icon_bloom' },
  purgeleaf:    { id: 'purgeleaf', name: 'Purgeleaf', desc: 'Cures poison, slow and stun.', cost: 35, tier: 1, kind: 'cure', amount: 0, icon: 'icon_leaf' },
};

export const EQUIPMENT: Record<string, EquipmentDef> = {
  // --- Weapons: Bulwark ---
  warden_blade:   { id: 'warden_blade', name: 'Warden Blade', slot: 'weapon', desc: 'A patrol-issue arming sword.', cost: 90, tier: 1, mods: { atk: 6 }, jobs: ['bulwark'], icon: 'icon_sword' },
  bastion_edge:   { id: 'bastion_edge', name: 'Bastion Edge', slot: 'weapon', desc: 'Heavy steel from the bastion forges.', cost: 240, tier: 2, mods: { atk: 10, hp: 10 }, jobs: ['bulwark'], icon: 'icon_sword' },
  oathkeeper:     { id: 'oathkeeper', name: 'Oathkeeper', slot: 'weapon', desc: 'A greatsword sworn to the dawn.', cost: 520, tier: 3, mods: { atk: 15, hp: 20 }, jobs: ['bulwark'], icon: 'icon_sword' },
  // --- Weapons: Skywarden ---
  ash_shortbow:   { id: 'ash_shortbow', name: 'Ash Shortbow', slot: 'weapon', desc: 'Simple, true, and quick to draw.', cost: 80, tier: 1, mods: { atk: 5 }, jobs: ['skywarden'], icon: 'icon_bow' },
  hawk_longbow:   { id: 'hawk_longbow', name: 'Hawk Longbow', slot: 'weapon', desc: 'Favored by the cliff watch.', cost: 230, tier: 2, mods: { atk: 9 }, jobs: ['skywarden'], icon: 'icon_bow' },
  gale_warbow:    { id: 'gale_warbow', name: 'Gale Warbow', slot: 'weapon', desc: 'Strung with wind-blessed sinew.', cost: 500, tier: 3, mods: { atk: 13, spd: 1 }, jobs: ['skywarden'], icon: 'icon_bow' },
  // --- Weapons: Embercaller ---
  ember_rod:      { id: 'ember_rod', name: 'Ember Rod', slot: 'weapon', desc: 'Warm to the touch, always.', cost: 85, tier: 1, mods: { mag: 6 }, jobs: ['embercaller'], icon: 'icon_rod' },
  pyre_staff:     { id: 'pyre_staff', name: 'Pyre Staff', slot: 'weapon', desc: 'Carved from a lightning-struck yew.', cost: 240, tier: 2, mods: { mag: 10, mp: 10 }, jobs: ['embercaller'], icon: 'icon_rod' },
  sunflare_scepter:{ id: 'sunflare_scepter', name: 'Sunflare Scepter', slot: 'weapon', desc: 'It remembers the first fire.', cost: 530, tier: 3, mods: { mag: 15, mp: 15 }, jobs: ['embercaller'], icon: 'icon_rod' },
  // --- Weapons: Dawnmender ---
  oak_crook:      { id: 'oak_crook', name: 'Oak Crook', slot: 'weapon', desc: 'A shepherd’s crook, twice blessed.', cost: 80, tier: 1, mods: { mag: 5, mp: 5 }, jobs: ['dawnmender'], icon: 'icon_staff' },
  lily_staff:     { id: 'lily_staff', name: 'Lily Staff', slot: 'weapon', desc: 'Crowned with a never-wilting bloom.', cost: 220, tier: 2, mods: { mag: 8, mp: 15 }, jobs: ['dawnmender'], icon: 'icon_staff' },
  dawn_scepter:   { id: 'dawn_scepter', name: 'Dawn Scepter', slot: 'weapon', desc: 'Light pools in its crystal head.', cost: 500, tier: 3, mods: { mag: 12, mp: 20, spd: 1 }, jobs: ['dawnmender'], icon: 'icon_staff' },
  // --- Weapons: Duskblade ---
  bone_dirk:      { id: 'bone_dirk', name: 'Bone Dirk', slot: 'weapon', desc: 'Light enough to forget it’s there.', cost: 85, tier: 1, mods: { atk: 5, spd: 1 }, jobs: ['duskblade'], icon: 'icon_dagger' },
  night_fang:     { id: 'night_fang', name: 'Night Fang', slot: 'weapon', desc: 'Drinks the light around it.', cost: 250, tier: 2, mods: { atk: 8, spd: 1 }, jobs: ['duskblade'], icon: 'icon_dagger' },
  umbral_kris:    { id: 'umbral_kris', name: 'Umbral Kris', slot: 'weapon', desc: 'A wave-bladed whisper.', cost: 540, tier: 3, mods: { atk: 12, spd: 2 }, jobs: ['duskblade'], icon: 'icon_dagger' },
  // --- Armor ---
  quilted_vest:   { id: 'quilted_vest', name: 'Quilted Vest', slot: 'armor', desc: 'Padded cloth. Better than nothing.', cost: 70, tier: 1, mods: { hp: 15 }, icon: 'icon_armor' },
  iron_cuirass:   { id: 'iron_cuirass', name: 'Iron Cuirass', slot: 'armor', desc: 'Heavy plates over boiled leather.', cost: 200, tier: 1, mods: { hp: 30 }, jobs: ['bulwark'], icon: 'icon_armor' },
  leather_jerkin: { id: 'leather_jerkin', name: 'Leather Jerkin', slot: 'armor', desc: 'Supple hide, easy to move in.', cost: 180, tier: 2, mods: { hp: 20, evade: 5 }, jobs: ['skywarden', 'duskblade'], icon: 'icon_armor' },
  silken_robe:    { id: 'silken_robe', name: 'Silken Robe', slot: 'armor', desc: 'Woven with threadbare wards.', cost: 180, tier: 2, mods: { hp: 15, mp: 10 }, jobs: ['embercaller', 'dawnmender'], icon: 'icon_armor' },
  bastion_plate:  { id: 'bastion_plate', name: 'Bastion Plate', slot: 'armor', desc: 'Fortress steel, fitted to a man.', cost: 480, tier: 3, mods: { hp: 50 }, jobs: ['bulwark'], icon: 'icon_armor' },
  shadow_garb:    { id: 'shadow_garb', name: 'Shadow Garb', slot: 'armor', desc: 'Cut for silence.', cost: 460, tier: 3, mods: { hp: 30, evade: 10, spd: 1 }, jobs: ['skywarden', 'duskblade'], icon: 'icon_armor' },
  oracle_vestment:{ id: 'oracle_vestment', name: 'Oracle Vestment', slot: 'armor', desc: 'Worn by the seers of old Veyra.', cost: 470, tier: 3, mods: { hp: 25, mp: 20, mag: 3 }, jobs: ['embercaller', 'dawnmender'], icon: 'icon_armor' },
  // --- Accessories ---
  traveler_boots: { id: 'traveler_boots', name: 'Traveler Boots', slot: 'accessory', desc: '+1 Move.', cost: 150, tier: 1, mods: { move: 1 }, icon: 'icon_boots' },
  jade_charm:     { id: 'jade_charm', name: 'Jade Charm', slot: 'accessory', desc: '+15 HP.', cost: 90, tier: 1, mods: { hp: 15 }, icon: 'icon_charm' },
  power_armlet:   { id: 'power_armlet', name: 'Power Armlet', slot: 'accessory', desc: '+4 Attack.', cost: 130, tier: 1, mods: { atk: 4 }, icon: 'icon_armlet' },
  focus_band:     { id: 'focus_band', name: 'Focus Band', slot: 'accessory', desc: '+4 Magic.', cost: 130, tier: 1, mods: { mag: 4 }, icon: 'icon_band' },
  swift_anklet:   { id: 'swift_anklet', name: 'Swift Anklet', slot: 'accessory', desc: '+1 Speed.', cost: 280, tier: 2, mods: { spd: 1 }, icon: 'icon_anklet' },
  sage_ring:      { id: 'sage_ring', name: 'Sage Ring', slot: 'accessory', desc: '+15 MP.', cost: 160, tier: 2, mods: { mp: 15 }, icon: 'icon_ring' },
  aegis_pendant:  { id: 'aegis_pendant', name: 'Aegis Pendant', slot: 'accessory', desc: '+8 Evade.', cost: 240, tier: 2, mods: { evade: 8 }, icon: 'icon_pendant' },
  winged_sandals: { id: 'winged_sandals', name: 'Winged Sandals', slot: 'accessory', desc: '+1 Move, +1 Jump.', cost: 420, tier: 3, mods: { move: 1, jump: 1 }, icon: 'icon_boots' },
};

export function getEquipment(id: string): EquipmentDef {
  const e = EQUIPMENT[id];
  if (!e) throw new Error(`Unknown equipment: ${id}`);
  return e;
}

export function getConsumable(id: string): ConsumableDef {
  const c = CONSUMABLES[id];
  if (!c) throw new Error(`Unknown consumable: ${id}`);
  return c;
}
