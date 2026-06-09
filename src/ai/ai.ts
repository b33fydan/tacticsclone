import type { AbilityDef, BattleState, Difficulty, Facing, Unit, XY } from '../entities/types';
import { getAbility } from '../data/abilities';
import { knownAbilities, maxStats } from '../entities/unit';
import {
  basicAttackFor, effectiveStats, estimateEffect, hitChance, isOffensive,
} from '../systems/combat';
import {
  aoeTiles, facingBetween, key, manhattan, reachableTiles, sameSide, targetableTiles, tileAt, unitAt,
} from '../systems/grid';
import { pick, rand } from '../utils/rng';

export interface AiPlan {
  moveTo?: XY;                               // move before acting
  action?: { abilityId: string; target: XY };
  postMoveTo?: XY;                           // move after acting instead
  facing: Facing;
  score: number;
}

interface Candidate extends AiPlan { }

function hostiles(b: BattleState, u: Unit): Unit[] {
  return b.units.filter((o) => !o.gone && !o.ko && !sameSide(o, u));
}
function friends(b: BattleState, u: Unit): Unit[] {
  return b.units.filter((o) => !o.gone && o.id !== u.id && sameSide(o, u));
}

function nearestDist(pos: XY, others: Unit[]): number {
  if (!others.length) return 99;
  return Math.min(...others.map((o) => manhattan(pos, o)));
}

/** Score the battlefield position `pos` for this unit (higher = better). */
function positionScore(b: BattleState, u: Unit, pos: XY, lowHp: boolean): number {
  const foes = hostiles(b, u);
  const pals = friends(b, u);
  const profile = u.aiProfile ?? 'aggressive';
  const dFoe = nearestDist(pos, foes);
  let score = 0;
  if (lowHp || profile === 'flee') {
    score += dFoe * 2.2;                          // run away — gradient must persist at range
  } else if (profile === 'aggressive') {
    score -= dFoe * 1.4;                          // close in
  } else if (profile === 'defensive') {
    // skirmisher: keep 3-4 distance, love high ground
    score -= Math.abs(dFoe - 3.5) * 1.2;
    const t = tileAt(b, pos.x, pos.y);
    if (t && u.job === 'skywarden') score += t.h * 2.5;
    if (t && u.job === 'embercaller') score += t.h * 1.2;
  } else if (profile === 'support') {
    // only treat KO'd allies as an anchor if this unit can actually revive them
    const canRevive = knownAbilities(u).some((id) => getAbility(id).type === 'revive');
    const wounded = pals.filter((p) => (p.ko ? canRevive : p.hp < maxStats(p).hp * 0.7));
    const anchor = wounded.length ? wounded : pals.filter((p) => !p.ko);
    if (anchor.length) score -= Math.min(...anchor.map((p) => manhattan(pos, p))) * 1.3;
    score += Math.min(dFoe, 5) * 0.7;
  }
  return score;
}

/** Expected value of using `ability` from `from` aimed at `target` tile. */
function actionScore(b: BattleState, u: Unit, from: XY, ability: AbilityDef, target: XY, difficulty: Difficulty): number {
  const tiles = aoeTiles(b, from, ability, target);
  // evaluate with the unit virtually standing at `from`
  const ox = u.x, oy = u.y;
  u.x = from.x; u.y = from.y;
  let total = 0;
  const seen = new Set<string>();
  try {
    for (const t of tiles) {
      const tgt = unitAt(b, t.x, t.y);
      if (!tgt || seen.has(tgt.id)) continue;
      seen.add(tgt.id);
      if (ability.type === 'revive') {
        if (tgt.ko && sameSide(u, tgt) && tgt.id !== u.id) total += 80;
        continue;
      }
      if (tgt.ko) continue;
      if (ability.type === 'heal') {
        const est = estimateEffect(b, u, tgt, ability);
        const missing = maxStats(tgt).hp - tgt.hp;
        if (!sameSide(u, tgt)) {
          // healing the other side is worse than not healing at all
          total -= Math.min(est.amount, missing) * 1.1;
          continue;
        }
        total += Math.min(est.amount, missing) * 0.95;
        continue;
      }
      if (ability.type === 'buff') {
        if (!sameSide(u, tgt)) continue;
        const already = tgt.statuses.some((s) => s.id === ability.status);
        total += already ? 0 : 14;
        continue;
      }
      if (!isOffensive(ability)) continue;
      const friendly = sameSide(u, tgt);
      if (friendly && !ability.friendlyFire) continue;
      const hit = hitChance(b, u, tgt, ability) / 100;
      const est = estimateEffect(b, u, tgt, ability);
      const effective = Math.min(est.amount, tgt.hp) * hit;
      let v = effective;
      if (est.amount >= tgt.hp) v += 35 * hit;                       // kill potential
      if (ability.status === 'stun') v += 22 * hit;
      if (ability.status === 'slow') v += 10 * hit;
      if (ability.status === 'poison') v += 9 * hit;
      if (tgt.team === 'guest') v *= 1.5;                            // cultists love scholars
      if (tgt.isLeader) v *= 1.35;                                   // cut off the head
      if (tgt.job === 'dawnmender' && !tgt.isLeader) v *= 1.2;       // silence the healers
      if (difficulty === 'hard') v += 12 * (1 - tgt.hp / maxStats(tgt).hp); // focus fire
      total += friendly ? -v * 1.3 : v;
    }
    if (ability.castTicks) total *= 0.6;        // delayed casts may whiff
    if (ability.mpCost > 0) total -= 2;
  } finally {
    u.x = ox; u.y = oy;
  }
  return total;
}

function abilityChoices(u: Unit): AbilityDef[] {
  const list: AbilityDef[] = [basicAttackFor(u)];
  for (const id of knownAbilities(u)) {
    const a = getAbility(id);
    if (a.type === 'teleport') continue;        // AI doesn't bother with shadowstep
    if (a.mpCost > u.mp) continue;
    list.push(a);
  }
  return list;
}

/** Build the best plan for an AI unit. Does not mutate state. */
export function planTurn(b: BattleState, u: Unit, difficulty: Difficulty): AiPlan {
  const stats = effectiveStats(u);
  const reach = reachableTiles(b, u, stats.move, stats.jump);
  const stops: XY[] = Object.entries(reach)
    .filter(([, e]) => e.canStop)
    .map(([k]) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
  const lowHp = u.hp < maxStats(u).hp * 0.35;
  const abilities = abilityChoices(u);
  const candidates: Candidate[] = [];

  // flee-profile units (escort guests) value staying safe far above acting
  const actWeight = u.aiProfile === 'flee' ? 0.25 : 1;

  // Move-then-act: from each reachable stop, try every ability/target
  for (const s of stops) {
    const here = positionScore(b, u, s, lowHp);
    for (const ab of abilities) {
      const targets = targetableTiles(b, u, s, ab);
      for (const t of targets) {
        const av = actionScore(b, u, s, ab, t, difficulty);
        if (av <= 0.5) continue;
        candidates.push({
          moveTo: (s.x !== u.x || s.y !== u.y) ? s : undefined,
          action: { abilityId: ab.id, target: t },
          facing: 'S', score: av * actWeight + here,
        });
      }
    }
    // pure repositioning
    candidates.push({
      moveTo: (s.x !== u.x || s.y !== u.y) ? s : undefined,
      facing: 'S', score: here - 1,
    });
  }

  // Act-then-move: act from current tile, then retreat to the safest stop
  const cur = { x: u.x, y: u.y };
  let bestRetreat: XY | undefined;
  let bestRetreatScore = -Infinity;
  for (const s of stops) {
    const sc = positionScore(b, u, s, true);
    if (sc > bestRetreatScore) { bestRetreatScore = sc; bestRetreat = s; }
  }
  const wantsRetreat = lowHp || u.aiProfile === 'defensive' || u.aiProfile === 'support' || u.aiProfile === 'flee';
  if (wantsRetreat && bestRetreat && (bestRetreat.x !== cur.x || bestRetreat.y !== cur.y)) {
    for (const ab of abilities) {
      const targets = targetableTiles(b, u, cur, ab);
      for (const t of targets) {
        const av = actionScore(b, u, cur, ab, t, difficulty);
        if (av <= 0.5) continue;
        candidates.push({
          action: { abilityId: ab.id, target: t },
          postMoveTo: bestRetreat,
          facing: 'S', score: av * actWeight + bestRetreatScore * 0.8,
        });
      }
    }
  }

  if (!candidates.length) {
    return { facing: u.facing, score: 0 };
  }

  candidates.sort((a, z) => z.score - a.score);
  let chosen: Candidate;
  if (difficulty === 'easy') {
    // sloppy play: pick randomly among the top few plans (score-relative floors
    // break down when every score is negative, so slice by rank instead)
    chosen = pick(candidates.slice(0, Math.min(6, candidates.length)));
  } else if (difficulty === 'normal') {
    // small wobble so fights don't feel scripted
    chosen = rand() < 0.85 ? candidates[0] : (candidates[1] ?? candidates[0]);
  } else {
    chosen = candidates[0];
  }

  // end-of-turn facing: face nearest hostile from the final tile
  const finalPos = chosen.postMoveTo ?? chosen.moveTo ?? { x: u.x, y: u.y };
  const foes = hostiles(b, u);
  if (foes.length && difficulty !== 'easy') {
    foes.sort((a, z) => manhattan(finalPos, a) - manhattan(finalPos, z));
    chosen.facing = facingBetween(finalPos, foes[0]);
  } else {
    chosen.facing = pick(['N', 'E', 'S', 'W'] as Facing[]);
  }
  return chosen;
}
