import type { AbilityDef } from '../entities/types';

// The common basic attack — every unit has it, range/name come from the job.
export const BASIC_ATTACK: AbilityDef = {
  id: 'attack', name: 'Attack', desc: 'A basic weapon attack.',
  job: 'common', type: 'phys', power: 100, mpCost: 0,
  rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 82, jpCost: 0,
  vertTol: 2, icon: 'icon_attack',
};

export const ABILITIES: Record<string, AbilityDef> = {
  // ---- Bulwark ----
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', desc: 'Slam a foe with your shield. Deals damage and may stun for 1 turn.',
    job: 'bulwark', type: 'phys', power: 80, mpCost: 0,
    rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 86, jpCost: 150,
    status: 'stun', statusChance: 60, vertTol: 1, icon: 'icon_bash',
  },
  rampart: {
    id: 'rampart', name: 'Rampart', desc: 'Raise a defensive stance: you and adjacent allies take 25% less damage for 3 turns.',
    job: 'bulwark', type: 'buff', power: 0, mpCost: 6,
    rangeMin: 0, rangeMax: 0, aoe: 'cross1', baseHit: 100, jpCost: 180,
    status: 'protect', statusChance: 100, vertTol: 2, icon: 'icon_rampart',
  },
  crushing_blow: {
    id: 'crushing_blow', name: 'Crushing Blow', desc: 'A massive overhead swing. High damage, harder to land.',
    job: 'bulwark', type: 'phys', power: 150, mpCost: 0,
    rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 68, jpCost: 250,
    vertTol: 1, icon: 'icon_crush',
  },

  // ---- Skywarden ----
  pinning_shot: {
    id: 'pinning_shot', name: 'Pinning Shot', desc: 'An arrow to the legs. Deals damage and slows the target for 3 turns.',
    job: 'skywarden', type: 'phys', power: 70, mpCost: 0,
    rangeMin: 2, rangeMax: 4, aoe: 'single', baseHit: 84, jpCost: 150,
    status: 'slow', statusChance: 70, vertTol: 4, icon: 'icon_pin',
  },
  piercing_shot: {
    id: 'piercing_shot', name: 'Piercing Shot', desc: 'A bodkin arrow that punches through everything in a straight line.',
    job: 'skywarden', type: 'phys', power: 90, mpCost: 4,
    rangeMin: 1, rangeMax: 3, aoe: 'line', baseHit: 88, jpCost: 220,
    vertTol: 4, friendlyFire: true, icon: 'icon_pierce',
  },
  arrow_storm: {
    id: 'arrow_storm', name: 'Arrow Storm', desc: 'Rain arrows on a distant area. Hits everyone beneath, friend or foe.',
    job: 'skywarden', type: 'phys', power: 75, mpCost: 8,
    rangeMin: 3, rangeMax: 5, aoe: 'diamond1', baseHit: 80, jpCost: 300,
    vertTol: 6, friendlyFire: true, icon: 'icon_volley',
  },

  // ---- Embercaller ----
  ember_burst: {
    id: 'ember_burst', name: 'Ember Burst', desc: 'A bloom of fire on a single foe and its neighbors.',
    job: 'embercaller', type: 'magic', power: 110, mpCost: 12,
    rangeMin: 1, rangeMax: 4, aoe: 'diamond1', baseHit: 92, jpCost: 150,
    vertTol: 3, friendlyFire: true, icon: 'icon_ember',
  },
  flame_lance: {
    id: 'flame_lance', name: 'Flame Lance', desc: 'A spear of flame that scorches a straight line from your hand.',
    job: 'embercaller', type: 'magic', power: 95, mpCost: 10,
    rangeMin: 1, rangeMax: 3, aoe: 'line', baseHit: 94, jpCost: 200,
    vertTol: 2, friendlyFire: true, icon: 'icon_lance',
  },
  cinder_storm: {
    id: 'cinder_storm', name: 'Cinder Storm', desc: 'Call a firestorm over a wide area. Charges, then erupts after a delay.',
    job: 'embercaller', type: 'magic', power: 145, mpCost: 24,
    rangeMin: 2, rangeMax: 4, aoe: 'diamond2', baseHit: 88, jpCost: 320,
    castTicks: 14, vertTol: 4, friendlyFire: true, icon: 'icon_storm',
  },

  // ---- Dawnmender ----
  mend: {
    id: 'mend', name: 'Mend', desc: 'Knit a single ally’s wounds with warm light.',
    job: 'dawnmender', type: 'heal', power: 130, mpCost: 8,
    rangeMin: 0, rangeMax: 3, aoe: 'single', baseHit: 100, jpCost: 120,
    vertTol: 3, icon: 'icon_mend',
  },
  radiant_circle: {
    id: 'radiant_circle', name: 'Radiant Circle', desc: 'A circle of dawnlight that heals everyone inside it.',
    job: 'dawnmender', type: 'heal', power: 85, mpCost: 14,
    rangeMin: 0, rangeMax: 2, aoe: 'diamond1', baseHit: 100, jpCost: 220,
    vertTol: 3, icon: 'icon_circle',
  },
  blessing: {
    id: 'blessing', name: 'Blessing', desc: 'Bless an ally’s arms: +25% attack and magic for 3 turns.',
    job: 'dawnmender', type: 'buff', power: 0, mpCost: 6,
    rangeMin: 1, rangeMax: 3, aoe: 'single', baseHit: 100, jpCost: 180,
    status: 'atkUp', statusChance: 100, vertTol: 3, icon: 'icon_bless',
  },
  second_dawn: {
    id: 'second_dawn', name: 'Second Dawn', desc: 'Call a fallen ally back to their feet with half their strength.',
    job: 'dawnmender', type: 'revive', power: 50, mpCost: 20,
    rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 100, jpCost: 300,
    vertTol: 2, icon: 'icon_revive',
  },

  // ---- Duskblade ----
  backstab: {
    id: 'backstab', name: 'Backstab', desc: 'A precise thrust. Deals +50% damage when delivered from behind.',
    job: 'duskblade', type: 'phys', power: 100, mpCost: 0,
    rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 86, jpCost: 150,
    backBonus: true, vertTol: 2, icon: 'icon_backstab',
  },
  shadowstep: {
    id: 'shadowstep', name: 'Shadowstep', desc: 'Melt into shadow and reappear on any open tile within 4 squares, ignoring walls and height.',
    job: 'duskblade', type: 'teleport', power: 0, mpCost: 8,
    rangeMin: 1, rangeMax: 4, aoe: 'single', baseHit: 100, jpCost: 220,
    vertTol: 99, icon: 'icon_step',
  },
  envenom: {
    id: 'envenom', name: 'Envenom', desc: 'A poisoned edge. Deals damage and poisons the target for 3 turns.',
    job: 'duskblade', type: 'phys', power: 75, mpCost: 4,
    rangeMin: 1, rangeMax: 1, aoe: 'single', baseHit: 88, jpCost: 200,
    status: 'poison', statusChance: 80, vertTol: 2, icon: 'icon_venom',
  },
};

export function getAbility(id: string): AbilityDef {
  if (id === 'attack') return BASIC_ATTACK;
  const a = ABILITIES[id];
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}
