import type { AbilityDef, ActionForecast, BattleState, StatBlock, StatusId, Unit, XY } from '../entities/types';
import { JOBS } from '../data/jobs';
import { maxStats } from '../entities/unit';
import { attackArc, sameSide, tileAt, unitAt } from './grid';
import { rand, roll } from '../utils/rng';

/** Stats with status-effect modifiers layered on. */
export function effectiveStats(unit: Unit): StatBlock {
  const s = { ...maxStats(unit) };
  for (const st of unit.statuses) {
    if (st.id === 'atkUp') { s.atk = Math.round(s.atk * 1.25); s.mag = Math.round(s.mag * 1.25); }
    if (st.id === 'haste') s.spd = Math.round(s.spd * 1.3);
    if (st.id === 'slow') s.spd = Math.max(2, Math.round(s.spd * 0.7));
  }
  return s;
}

export function hasStatus(unit: Unit, id: StatusId): boolean {
  return unit.statuses.some((s) => s.id === id);
}

export function addStatus(unit: Unit, id: StatusId, turns = 3) {
  const existing = unit.statuses.find((s) => s.id === id);
  if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, turns);
  else unit.statuses.push({ id, turnsLeft: turns });
}

const OFFENSIVE = new Set(['phys', 'magic', 'debuff']);

export function isOffensive(ability: AbilityDef): boolean {
  return OFFENSIVE.has(ability.type);
}

export function hitChance(b: BattleState, attacker: Unit, target: Unit, ability: AbilityDef): number {
  if (!isOffensive(ability)) return 100;
  let hit = ability.baseHit;
  const arc = attackArc({ x: attacker.x, y: attacker.y }, target);
  const facingBonus = ability.type === 'magic'
    ? (arc === 'back' ? 9 : arc === 'side' ? 4 : 0)
    : (arc === 'back' ? 18 : arc === 'side' ? 8 : 0);
  hit += facingBonus;
  if (attacker.job === 'duskblade' && arc !== 'front' && ability.type === 'phys') hit += 10; // Opportunist
  const at = tileAt(b, attacker.x, attacker.y);
  const tt = tileAt(b, target.x, target.y);
  if (at && tt) {
    if (at.h > tt.h) hit += 8;
    else if (at.h < tt.h) hit -= 8;
  }
  const evade = effectiveStats(target).evade;
  hit -= ability.type === 'magic' ? Math.floor(evade / 2) : evade;
  return Math.max(15, Math.min(100, Math.round(hit)));
}

export interface DamageEstimate { amount: number; kind: 'damage' | 'heal' | 'revive' | 'status' | 'none'; }

/** Expected (non-rolled) effect size, used for forecasts and AI scoring. */
export function estimateEffect(b: BattleState, caster: Unit, target: Unit, ability: AbilityDef): DamageEstimate {
  if (ability.type === 'teleport') return { amount: 0, kind: 'none' };
  if (ability.type === 'revive') {
    return { amount: Math.round((maxStats(target).hp * ability.power) / 100), kind: 'revive' };
  }
  if (ability.type === 'heal') {
    const st = effectiveStats(caster);
    return { amount: Math.round((st.mag * ability.power) / 100), kind: 'heal' };
  }
  if (ability.type === 'buff' || ability.type === 'debuff') {
    return { amount: 0, kind: 'status' };
  }
  return { amount: baseDamage(b, caster, target, ability, 1), kind: 'damage' };
}

function baseDamage(b: BattleState, attacker: Unit, target: Unit, ability: AbilityDef, varianceMult: number): number {
  const st = effectiveStats(attacker);
  const stat = ability.type === 'magic' ? st.mag : st.atk;
  let dmg = (stat * ability.power) / 100;
  const at = tileAt(b, attacker.x, attacker.y);
  const tt = tileAt(b, target.x, target.y);
  if (at && tt) {
    if (at.h > tt.h) {
      dmg *= 1.15;
      if (attacker.job === 'skywarden' && ability.type === 'phys') dmg *= 1.15; // Falcon Eye
    } else if (at.h < tt.h) {
      dmg *= 0.85;
    }
  }
  if (ability.backBonus && attackArc({ x: attacker.x, y: attacker.y }, target) === 'back') dmg *= 1.5;
  if (attacker.job === 'embercaller' && ability.type === 'magic') dmg *= 1.15; // Kindled Mind
  if (target.job === 'bulwark') dmg *= 0.9; // Stalwart
  if (hasStatus(target, 'protect')) dmg *= 0.75;
  dmg *= varianceMult;
  return Math.max(1, Math.round(dmg));
}

export interface CombatEvent {
  targetId: string;
  targetName: string;
  miss?: boolean;
  damage?: number;
  heal?: number;
  revived?: boolean;
  status?: StatusId;
  koed?: boolean;
  tile: XY;
}

/** Apply an ability to its AoE tiles. Mutates battle state; returns per-target events. */
export function applyAbility(b: BattleState, caster: Unit, ability: AbilityDef, tiles: XY[]): CombatEvent[] {
  const events: CombatEvent[] = [];
  const st = effectiveStats(caster);
  caster.mp = Math.max(0, caster.mp - ability.mpCost);

  if (ability.type === 'teleport') {
    const dest = tiles[0];
    if (dest && !unitAt(b, dest.x, dest.y) && !tileAt(b, dest.x, dest.y)?.impassable) {
      caster.x = dest.x;
      caster.y = dest.y;
    }
    return events;
  }

  const seen = new Set<string>();
  for (const t of tiles) {
    const target = unitAt(b, t.x, t.y);
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);

    if (ability.type === 'revive') {
      if (!target.ko || !sameSide(caster, target)) continue;
      const amount = Math.max(1, Math.round((maxStats(target).hp * ability.power) / 100));
      target.ko = false;
      target.koCounter = 0;
      target.hp = Math.min(maxStats(target).hp, amount);
      events.push({ targetId: target.id, targetName: target.name, heal: amount, revived: true, tile: t });
      continue;
    }

    if (target.ko) continue; // bodies are not valid targets for anything else

    if (ability.type === 'heal') {
      const amount = Math.max(1, Math.round((st.mag * ability.power) / 100 * (0.9 + rand() * 0.2)));
      const healed = Math.min(amount, maxStats(target).hp - target.hp);
      target.hp += healed;
      events.push({ targetId: target.id, targetName: target.name, heal: healed, tile: t });
      continue;
    }

    if (ability.type === 'buff') {
      if (!sameSide(caster, target)) continue;
      if (ability.status) addStatus(target, ability.status, 3);
      events.push({ targetId: target.id, targetName: target.name, status: ability.status, tile: t });
      continue;
    }

    // offensive
    if (sameSide(caster, target) && !ability.friendlyFire) continue;
    if (target.id === caster.id && !ability.friendlyFire) continue;
    const hit = hitChance(b, caster, target, ability);
    if (!roll(hit)) {
      events.push({ targetId: target.id, targetName: target.name, miss: true, tile: t });
      continue;
    }
    const dmg = baseDamage(b, caster, target, ability, 0.9 + rand() * 0.2);
    target.hp = Math.max(0, target.hp - dmg);
    const ev: CombatEvent = { targetId: target.id, targetName: target.name, damage: dmg, tile: t };
    if (ability.status && roll(ability.statusChance ?? 0)) {
      addStatus(target, ability.status, 3);
      ev.status = ability.status;
    }
    if (target.hp <= 0) {
      target.ko = true;
      target.koCounter = 3;
      target.statuses = [];
      ev.koed = true;
    }
    events.push(ev);
  }
  return events;
}

/** Forecast shown to the player before confirming an action. */
export function buildForecast(b: BattleState, caster: Unit, ability: AbilityDef, tiles: XY[]): ActionForecast {
  const targets: ActionForecast['targets'] = [];
  const seen = new Set<string>();
  for (const t of tiles) {
    const target = unitAt(b, t.x, t.y);
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);
    if (ability.type === 'revive') {
      if (!target.ko || !sameSide(caster, target)) continue;
      const est = estimateEffect(b, caster, target, ability);
      targets.push({ unitId: target.id, name: target.name, hit: 100, amount: est.amount, kind: 'revive' });
      continue;
    }
    if (target.ko) continue;
    if (ability.type === 'heal') {
      const est = estimateEffect(b, caster, target, ability);
      targets.push({ unitId: target.id, name: target.name, hit: 100, amount: est.amount, kind: 'heal' });
      continue;
    }
    if (ability.type === 'buff') {
      if (!sameSide(caster, target)) continue;
      targets.push({ unitId: target.id, name: target.name, hit: 100, amount: 0, kind: 'status', status: ability.status });
      continue;
    }
    if (ability.type === 'teleport') continue;
    if (sameSide(caster, target) && !ability.friendlyFire) continue;
    const est = estimateEffect(b, caster, target, ability);
    targets.push({
      unitId: target.id, name: target.name,
      hit: hitChance(b, caster, target, ability),
      amount: est.amount, kind: 'damage', status: ability.status,
    });
  }
  return { targets, mpCost: ability.mpCost, castTicks: ability.castTicks };
}

/** Basic attack definition customized to the unit's job (range, name). */
export function basicAttackFor(unit: Unit): AbilityDef {
  const job = JOBS[unit.job];
  return {
    id: 'attack', name: job.basicName, desc: 'A basic weapon attack.',
    job: 'common', type: 'phys', power: 100, mpCost: 0,
    rangeMin: 1, rangeMax: job.basicRange, aoe: 'single', baseHit: 82, jpCost: 0,
    vertTol: job.basicVertTol, icon: 'icon_attack',
  };
}
