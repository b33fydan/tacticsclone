import type { BattleState, PendingCast, Unit } from '../entities/types';
import { effectiveStats } from './combat';

export const TURN_CT = 100;
export const ROUND_SPEED = 8;

export type TurnEvent =
  | { kind: 'unit'; unitId: string }
  | { kind: 'cast'; castId: string }
  | { kind: 'round'; round: number };

/** Units that participate in the CT clock (KO'd units still tick so their countdown runs). */
function tickingUnits(b: BattleState): Unit[] {
  return b.units.filter((u) => !u.gone);
}

/**
 * Advance the clock until something is due. Mutates ct/clock/round state.
 * Resolution priority on the same tick: pending casts, round marker, then units.
 */
export function advanceToNextEvent(b: BattleState): TurnEvent {
  for (let guard = 0; guard < 10000; guard++) {
    // anything already due?
    const dueCast = b.pendingCasts.find((c) => c.ticksLeft <= 0);
    if (dueCast) return { kind: 'cast', castId: dueCast.id };
    if (b.roundCt >= TURN_CT) {
      b.roundCt -= TURN_CT;
      b.round += 1;
      return { kind: 'round', round: b.round };
    }
    const ready = tickingUnits(b).filter((u) => u.ct >= TURN_CT);
    if (ready.length) {
      ready.sort((a, z) => z.ct - a.ct || effectiveStats(z).spd - effectiveStats(a).spd || a.id.localeCompare(z.id));
      return { kind: 'unit', unitId: ready[0].id };
    }
    // tick the clock
    b.clock += 1;
    b.roundCt += ROUND_SPEED;
    for (const c of b.pendingCasts) c.ticksLeft -= 1;
    for (const u of tickingUnits(b)) u.ct += u.ko ? ROUND_SPEED : effectiveStats(u).spd;
  }
  throw new Error('Turn clock failed to advance');
}

export interface ForecastEntry {
  kind: 'unit' | 'cast' | 'round';
  unitId?: string;   // for unit turns and the caster of casts
  castAbility?: string;
  round?: number;
}

/** Non-destructive simulation of the next `count` turn events for the UI bar. */
export function forecastTurnOrder(b: BattleState, count: number): ForecastEntry[] {
  const units = tickingUnits(b).map((u) => ({
    id: u.id, ct: u.ct, spd: u.ko ? ROUND_SPEED : effectiveStats(u).spd, ko: u.ko,
  }));
  const casts: { id: string; casterId: string; abilityId: string; ticksLeft: number }[] =
    b.pendingCasts.map((c) => ({ id: c.id, casterId: c.casterId, abilityId: c.abilityId, ticksLeft: c.ticksLeft }));
  let roundCt = b.roundCt;
  let round = b.round;
  const out: ForecastEntry[] = [];
  // If an event is currently due (mid-turn), skip the active unit's first appearance:
  // the bar shows what comes NEXT, so simulate from a state where due units have just acted.
  for (let guard = 0; guard < 20000 && out.length < count; guard++) {
    const dueCastIdx = casts.findIndex((c) => c.ticksLeft <= 0);
    if (dueCastIdx >= 0) {
      const c = casts[dueCastIdx];
      out.push({ kind: 'cast', unitId: c.casterId, castAbility: c.abilityId });
      casts.splice(dueCastIdx, 1);
      continue;
    }
    if (roundCt >= TURN_CT) {
      roundCt -= TURN_CT;
      round += 1;
      out.push({ kind: 'round', round });
      continue;
    }
    const ready = units.filter((u) => u.ct >= TURN_CT);
    if (ready.length) {
      ready.sort((a, z) => z.ct - a.ct || z.spd - a.spd || a.id.localeCompare(z.id));
      const u = ready[0];
      if (!u.ko) out.push({ kind: 'unit', unitId: u.id });
      u.ct -= TURN_CT;
      continue;
    }
    roundCt += ROUND_SPEED;
    for (const c of casts) c.ticksLeft -= 1;
    for (const u of units) u.ct += u.spd;
  }
  return out;
}

let castSeq = 1;
export function makeCast(casterId: string, abilityId: string, tiles: { x: number; y: number }[], ticks: number): PendingCast {
  return { id: `cast_${castSeq++}`, casterId, abilityId, tiles, ticksLeft: ticks };
}
