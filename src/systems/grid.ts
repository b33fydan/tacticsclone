import type { AbilityDef, BattleState, Facing, Tile, Unit, XY } from '../entities/types';

export const DIRS: Record<Facing, XY> = {
  N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 },
};
export const FACINGS: Facing[] = ['N', 'E', 'S', 'W'];

export const key = (x: number, y: number) => `${x},${y}`;

export function tileAt(b: BattleState, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || y >= b.h || x >= b.w) return null;
  return b.tiles[y][x];
}

/** Units physically on the field (alive or KO'd bodies). */
export function unitAt(b: BattleState, x: number, y: number): Unit | undefined {
  return b.units.find((u) => !u.gone && u.x === x && u.y === y);
}

export function aliveUnits(b: BattleState, team?: Unit['team']): Unit[] {
  return b.units.filter((u) => !u.gone && !u.ko && (!team || u.team === team));
}

export function manhattan(a: XY, b: XY): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function sameSide(a: Unit, b: Unit): boolean {
  if (a.team === b.team) return true;
  const friendly = (t: string) => t === 'player' || t === 'guest';
  return friendly(a.team) && friendly(b.team);
}

export interface ReachEntry { cost: number; from?: string; canStop: boolean; }

/** Dijkstra over the grid honoring move, jump, terrain, props, and occupancy. */
export function reachableTiles(b: BattleState, unit: Unit, move: number, jump: number): Record<string, ReachEntry> {
  const start = key(unit.x, unit.y);
  const result: Record<string, ReachEntry> = { [start]: { cost: 0, canStop: true } };
  const frontier: { x: number; y: number; cost: number }[] = [{ x: unit.x, y: unit.y, cost: 0 }];
  while (frontier.length) {
    frontier.sort((a, z) => a.cost - z.cost);
    const cur = frontier.shift()!;
    if (cur.cost >= move) continue;
    const curTile = tileAt(b, cur.x, cur.y)!;
    for (const d of Object.values(DIRS)) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      const t = tileAt(b, nx, ny);
      if (!t || t.impassable) continue;
      const rise = t.h - curTile.h;
      if (rise > jump) continue;            // climbing limited by jump
      if (-rise > jump + 1) continue;       // dropping slightly more lenient
      const occ = unitAt(b, nx, ny);
      if (occ && !sameSide(occ, unit)) continue;   // enemies block pathing
      const k = key(nx, ny);
      const cost = cur.cost + 1;
      if (result[k] && result[k].cost <= cost) continue;
      result[k] = { cost, from: key(cur.x, cur.y), canStop: !occ };
      frontier.push({ x: nx, y: ny, cost });
    }
  }
  return result;
}

export function pathTo(reach: Record<string, ReachEntry>, dest: XY): XY[] {
  const out: XY[] = [];
  let k: string | undefined = key(dest.x, dest.y);
  while (k) {
    const [x, y] = k.split(',').map(Number);
    out.unshift({ x, y });
    k = reach[k]?.from;
  }
  return out;
}

/** Tiles a caster standing at `from` may target with this ability. */
export function targetableTiles(b: BattleState, caster: Unit, from: XY, ability: AbilityDef): XY[] {
  const casterTile = tileAt(b, from.x, from.y)!;
  const out: XY[] = [];
  if (ability.aoe === 'line') {
    for (const d of Object.values(DIRS)) {
      for (let i = 1; i <= ability.rangeMax; i++) {
        const t = tileAt(b, from.x + d.x * i, from.y + d.y * i);
        if (!t) break;
        if (Math.abs(t.h - casterTile.h) <= ability.vertTol) out.push({ x: t.x, y: t.y });
      }
    }
    return out;
  }
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const d = manhattan(from, { x, y });
      if (d < ability.rangeMin || d > ability.rangeMax) continue;
      const t = b.tiles[y][x];
      if (Math.abs(t.h - casterTile.h) > ability.vertTol) continue;
      if (ability.type === 'teleport') {
        if (t.impassable || unitAt(b, x, y)) continue;
      }
      out.push({ x, y });
    }
  }
  return out;
}

/** The set of tiles affected when `ability` is aimed at `target` from `from`. */
export function aoeTiles(b: BattleState, from: XY, ability: AbilityDef, target: XY): XY[] {
  const out: XY[] = [];
  if (ability.aoe === 'line') {
    const dx = Math.sign(target.x - from.x);
    const dy = Math.sign(target.y - from.y);
    // aim along the dominant axis of the clicked tile
    const d = Math.abs(target.x - from.x) >= Math.abs(target.y - from.y) ? { x: dx, y: 0 } : { x: 0, y: dy };
    if (d.x === 0 && d.y === 0) return [];
    for (let i = 1; i <= ability.rangeMax; i++) {
      const t = tileAt(b, from.x + d.x * i, from.y + d.y * i);
      if (!t) break;
      out.push({ x: t.x, y: t.y });
    }
    return out;
  }
  const radius = ability.aoe === 'single' ? 0 : ability.aoe === 'diamond2' ? 2 : 1;
  const targetTile = tileAt(b, target.x, target.y);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (manhattan(target, { x, y }) > radius) continue;
      const t = b.tiles[y][x];
      if (targetTile && Math.abs(t.h - targetTile.h) > Math.max(2, ability.vertTol)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

export function facingBetween(from: XY, to: XY): Facing {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

export type AttackArc = 'front' | 'side' | 'back';

/** From where does the attack land, relative to the target's facing? */
export function attackArc(attackerPos: XY, target: Unit): AttackArc {
  const f = DIRS[target.facing];
  const v = { x: attackerPos.x - target.x, y: attackerPos.y - target.y };
  if (v.x === 0 && v.y === 0) return 'side';
  const dot = f.x * v.x + f.y * v.y;
  const mag = Math.abs(v.x) + Math.abs(v.y);
  // dominant alignment with facing → front; against facing → back
  if (dot > 0 && Math.abs(dot) * 2 > mag) return 'front';
  if (dot < 0 && Math.abs(dot) * 2 > mag) return 'back';
  return 'side';
}

export function opposite(f: Facing): Facing {
  return f === 'N' ? 'S' : f === 'S' ? 'N' : f === 'E' ? 'W' : 'E';
}
