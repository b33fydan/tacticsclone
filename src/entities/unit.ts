import type { JobId, StatBlock, Team, Unit, AiProfile } from './types';
import { JOBS } from '../data/jobs';
import { EQUIPMENT } from '../data/items';

let nextId = 1;
export function freshUnitId(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

/** Base stats from job + level + equipment. Statuses are layered on in combat.ts. */
export function maxStats(unit: Unit): StatBlock {
  const job = JOBS[unit.job];
  const lv = unit.level - 1;
  const s: StatBlock = {
    hp: Math.round(job.base.hp + job.growth.hp * lv),
    mp: Math.round(job.base.mp + job.growth.mp * lv),
    atk: Math.round(job.base.atk + job.growth.atk * lv),
    mag: Math.round(job.base.mag + job.growth.mag * lv),
    spd: Math.round(job.base.spd + job.growth.spd * lv),
    move: job.base.move,
    jump: job.base.jump,
    evade: Math.round(job.base.evade + job.growth.evade * lv),
  };
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const id = unit.equipment[slot];
    if (!id) continue;
    const eq = EQUIPMENT[id];
    if (!eq) continue;
    for (const [stat, val] of Object.entries(eq.mods)) {
      s[stat as keyof StatBlock] += val as number;
    }
  }
  if (unit.statMult && unit.statMult !== 1) {
    s.hp = Math.round(s.hp * unit.statMult);
    s.atk = Math.round(s.atk * unit.statMult);
    s.mag = Math.round(s.mag * unit.statMult);
  }
  return s;
}

export function createUnit(opts: {
  name: string; job: JobId; level: number; team: Team;
  equipment?: Unit['equipment']; learned?: string[];
  isLeader?: boolean; aiProfile?: AiProfile;
}): Unit {
  const u: Unit = {
    id: freshUnitId(opts.team),
    name: opts.name,
    team: opts.team,
    job: opts.job,
    level: opts.level,
    exp: 0,
    jp: 0,
    learned: { [opts.job]: opts.learned ?? [] },
    equipment: opts.equipment ?? {},
    hp: 0, mp: 0, ct: 0,
    x: -1, y: -1,
    facing: 'S',
    ko: false, koCounter: 0, gone: false,
    statuses: [],
    isLeader: opts.isLeader,
    aiProfile: opts.aiProfile,
  };
  const s = maxStats(u);
  u.hp = s.hp;
  u.mp = s.mp;
  return u;
}

export const EXP_PER_LEVEL = 100;
export const MAX_LEVEL = 20;

/** Grant EXP; returns number of levels gained. Leveling heals by the HP/MP gained. */
export function grantExp(unit: Unit, amount: number): number {
  if (unit.level >= MAX_LEVEL) return 0;
  let gained = 0;
  const before = maxStats(unit);
  unit.exp += amount;
  while (unit.exp >= EXP_PER_LEVEL && unit.level < MAX_LEVEL) {
    unit.exp -= EXP_PER_LEVEL;
    unit.level += 1;
    gained += 1;
  }
  if (gained > 0) {
    const after = maxStats(unit);
    unit.hp = Math.min(after.hp, unit.hp + (after.hp - before.hp));
    unit.mp = Math.min(after.mp, unit.mp + (after.mp - before.mp));
  }
  return gained;
}

export function knownAbilities(unit: Unit): string[] {
  return unit.learned[unit.job] ?? [];
}

export function learnAbility(unit: Unit, abilityId: string, jpCost: number): boolean {
  if (unit.jp < jpCost) return false;
  const list = unit.learned[unit.job] ?? (unit.learned[unit.job] = []);
  if (list.includes(abilityId)) return false;
  unit.jp -= jpCost;
  list.push(abilityId);
  return true;
}

/** Equip an item into its slot; returns the previously equipped id (if any). */
export function equip(unit: Unit, equipId: string): string | undefined {
  const eq = EQUIPMENT[equipId];
  if (!eq) throw new Error(`Unknown equipment ${equipId}`);
  const prev = unit.equipment[eq.slot];
  unit.equipment[eq.slot] = equipId;
  // keep current hp/mp within new bounds
  const s = maxStats(unit);
  unit.hp = Math.min(unit.hp, s.hp);
  unit.mp = Math.min(unit.mp, s.mp);
  return prev;
}

export function unequip(unit: Unit, slot: 'weapon' | 'armor' | 'accessory'): string | undefined {
  const prev = unit.equipment[slot];
  delete unit.equipment[slot];
  const s = maxStats(unit);
  unit.hp = Math.min(unit.hp, s.hp);
  unit.mp = Math.min(unit.mp, s.mp);
  return prev;
}
