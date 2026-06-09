import type {
  AbilityDef, BattleState, Facing, GameState, Tile, Unit, XY,
} from '../entities/types';
import { getAbility } from '../data/abilities';
import { getConsumable } from '../data/items';
import { getMap, parseMap } from '../data/maps';
import { JOBS } from '../data/jobs';
import { createUnit, grantExp, knownAbilities, maxStats } from '../entities/unit';
import {
  applyAbility, basicAttackFor, buildForecast, effectiveStats, type CombatEvent,
} from './combat';
import {
  aoeTiles, facingBetween, key, pathTo, reachableTiles, sameSide, tileAt, targetableTiles, unitAt,
} from './grid';
import { advanceToNextEvent, makeCast } from './turnorder';
import { planTurn } from '../ai/ai';

// ---------------------------------------------------------------------------
// Animation hooks: the renderer provides real implementations; headless mode
// (AI simulations, tests) uses the immediate defaults below.
// ---------------------------------------------------------------------------
export interface AnimHooks {
  onChange(): void;
  delay(ms: number): Promise<void>;
  focusUnit(u: Unit): Promise<void>;
  unitWalk(u: Unit, path: XY[]): Promise<void>;
  unitLunge(u: Unit, toward: XY): Promise<void>;
  castFlash(u: Unit, ability: AbilityDef): Promise<void>;
  abilityFx(ability: AbilityDef | null, tiles: XY[], events: CombatEvent[], itemKind?: string): Promise<void>;
  koFade(u: Unit): Promise<void>;
  banner(text: string, ms: number): Promise<void>;
}

const immediateHooks: AnimHooks = {
  onChange: () => {},
  delay: async () => {},
  focusUnit: async () => {},
  unitWalk: async (u, path) => {
    const last = path[path.length - 1];
    if (last) { u.x = last.x; u.y = last.y; }
    if (path.length >= 2) u.facing = facingBetween(path[path.length - 2], last);
  },
  unitLunge: async () => {},
  castFlash: async () => {},
  abilityFx: async () => {},
  koFade: async () => {},
  banner: async () => {},
};

let hooks: AnimHooks = immediateHooks;
export function setAnimHooks(h: AnimHooks) { hooks = h; }
export function resetAnimHooks() { hooks = immediateHooks; }

function log(b: BattleState, msg: string) {
  b.log.push(msg);
  if (b.log.length > 80) b.log.shift();
}

// ---------------------------------------------------------------------------
// Battle creation & deployment
// ---------------------------------------------------------------------------
export function createBattleState(game: GameState, mapId: string): BattleState {
  const def = getMap(mapId);
  const tiles = parseMap(def);
  const diffMult = game.difficulty === 'easy' ? 0.85 : game.difficulty === 'hard' ? 1.15 : 1;

  const units: Unit[] = [];
  for (const e of def.enemies) {
    const learnedCount = Math.min(JOBS[e.job].abilityIds.length, Math.ceil(e.level / 2));
    const u = createUnit({
      name: e.name ?? JOBS[e.job].name,
      job: e.job, level: e.level, team: 'enemy',
      equipment: e.equip ?? {},
      learned: JOBS[e.job].abilityIds.slice(0, learnedCount),
      isLeader: e.isLeader, aiProfile: e.aiProfile ?? 'aggressive',
    });
    u.statMult = diffMult;
    const s = maxStats(u);
    u.hp = s.hp; u.mp = s.mp;
    u.x = e.x; u.y = e.y;
    u.facing = e.x > def.rows[0].length / 2 ? 'W' : 'E';
    units.push(u);
  }
  if (def.guest) {
    const g = createUnit({
      name: def.guest.name, job: def.guest.job, level: def.guest.level, team: 'guest',
      learned: JOBS[def.guest.job].abilityIds.slice(0, 1),
      aiProfile: 'flee',
    });
    g.x = def.guest.x; g.y = def.guest.y; g.facing = 'S';
    units.push(g);
  }

  // roster units join in deploy phase with battle state reset
  for (const u of game.roster) {
    const s = maxStats(u);
    u.hp = s.hp; u.mp = s.mp; u.ct = 0;
    u.ko = false; u.koCounter = 0; u.gone = false;
    u.statuses = [];
    u.x = -1; u.y = -1;
    u.facing = 'E';
  }

  return {
    mapId, tiles,
    w: tiles[0].length, h: tiles.length,
    units,
    phase: 'deploy',
    activeUnitId: null,
    clock: 0, round: 1, roundCt: 0, turnsTaken: 0,
    pendingCasts: [],
    hasMoved: false, hasActed: false, moveOrigin: null,
    log: [`— ${def.name} —`],
    ui: { mode: 'idle', aiActing: false },
    results: {
      expGained: {}, jpGained: {}, levelUps: [], gold: 0, itemsFound: [],
      treasureGold: 0, treasureItemIds: [], treasureJp: {}, victory: false,
    },
    deployChoice: [],
    difficulty: game.difficulty,
  };
}

export function placeUnit(game: GameState, unitId: string, tile: XY): boolean {
  const b = game.battle!;
  const def = getMap(b.mapId);
  if (b.phase !== 'deploy') return false;
  if (!def.deployTiles.some((t) => t.x === tile.x && t.y === tile.y)) return false;
  const u = game.roster.find((r) => r.id === unitId);
  if (!u) return false;
  const occupant = b.units.find((o) => o.x === tile.x && o.y === tile.y && b.deployChoice.includes(o.id));
  if (occupant) {
    // swap out the occupant
    occupant.x = -1; occupant.y = -1;
    b.deployChoice = b.deployChoice.filter((id) => id !== occupant.id);
  }
  if (!b.deployChoice.includes(unitId)) {
    if (b.deployChoice.length >= def.maxDeploy) return false;
    b.deployChoice.push(unitId);
    if (!b.units.includes(u)) b.units.push(u);
  }
  u.x = tile.x; u.y = tile.y;
  u.facing = tile.x < b.w / 2 ? 'E' : 'W';
  hooks.onChange();
  return true;
}

export function removeDeployed(game: GameState, unitId: string) {
  const b = game.battle!;
  if (b.phase !== 'deploy') return;
  const u = game.roster.find((r) => r.id === unitId);
  if (!u) return;
  u.x = -1; u.y = -1;
  b.deployChoice = b.deployChoice.filter((id) => id !== unitId);
  b.units = b.units.filter((o) => o !== u);
  hooks.onChange();
}

export async function startCombat(game: GameState) {
  const b = game.battle!;
  if (b.phase !== 'deploy' || b.deployChoice.length === 0) return;
  b.phase = 'combat';
  b.ui.mode = 'idle';
  log(b, 'Battle joined!');
  hooks.onChange();
  await hooks.banner(getMap(b.mapId).name, 1100);
  await progress(game);
}

// ---------------------------------------------------------------------------
// Main combat loop
// ---------------------------------------------------------------------------
let progressing = false;

export async function progress(game: GameState) {
  const b = game.battle;
  if (!b || b.phase !== 'combat' || progressing) return;
  progressing = true;
  try {
    while (b.phase === 'combat') {
      const e = advanceToNextEvent(b);

      if (e.kind === 'round') {
        await hooks.banner(`Round ${e.round}`, 750);
        hooks.onChange();
        if (checkEnd(game)) break;
        continue;
      }

      if (e.kind === 'cast') {
        await resolveCast(game, e.castId);
        if (checkEnd(game)) break;
        continue;
      }

      const u = b.units.find((x) => x.id === e.unitId)!;
      b.activeUnitId = u.id;
      b.turnsTaken += 1;
      b.hasMoved = false;
      b.hasActed = false;
      b.moveOrigin = { x: u.x, y: u.y, facing: u.facing };

      if (u.ko) {
        u.ct -= 100;
        u.koCounter -= 1;
        if (u.koCounter <= 0) {
          log(b, `${u.name} fades away...`);
          await hooks.koFade(u);
          u.gone = true;
          hooks.onChange();
          if (checkEnd(game)) break;
        } else {
          log(b, `${u.name} is down — ${u.koCounter} turn${u.koCounter === 1 ? '' : 's'} left.`);
          hooks.onChange();
        }
        continue;
      }

      const skipped = await startOfTurn(game, u);
      if (skipped) {
        if (checkEnd(game)) break;
        continue;
      }

      if (u.team === 'player') {
        b.ui.mode = 'unitMenu';
        b.ui.aiActing = false;
        hooks.onChange();
        await hooks.focusUnit(u);
        return; // hand control to the player; endTurn() resumes the loop
      }

      b.ui.mode = 'idle';
      b.ui.aiActing = true;
      hooks.onChange();
      await hooks.focusUnit(u);
      await runAiTurn(game, u);
      b.ui.aiActing = false;
      if (checkEnd(game)) break;
    }
  } finally {
    progressing = false;
    hooks.onChange();
  }
}

/** Poison, stun, passive regen. Returns true if the turn is skipped. */
async function startOfTurn(game: GameState, u: Unit): Promise<boolean> {
  const b = game.battle!;
  if (u.job === 'dawnmender') {
    u.mp = Math.min(maxStats(u).mp, u.mp + 4);
  }
  const poison = u.statuses.find((s) => s.id === 'poison');
  if (poison) {
    const dmg = Math.max(4, Math.round(maxStats(u).hp * 0.08));
    u.hp = Math.max(0, u.hp - dmg);
    log(b, `${u.name} suffers ${dmg} poison damage.`);
    await hooks.abilityFx(null, [{ x: u.x, y: u.y }], [{ targetId: u.id, targetName: u.name, damage: dmg, tile: { x: u.x, y: u.y } }], 'poison');
    if (u.hp <= 0) {
      u.ko = true; u.koCounter = 3; u.statuses = [];
      log(b, `${u.name} falls to poison!`);
      u.ct -= 100;
      hooks.onChange();
      return true;
    }
  }
  const stun = u.statuses.find((s) => s.id === 'stun');
  if (stun) {
    u.statuses = u.statuses.filter((s) => s.id !== 'stun');
    log(b, `${u.name} is stunned and loses the turn!`);
    u.ct -= 100;
    hooks.onChange();
    await hooks.delay(450);
    return true;
  }
  return false;
}

function tickStatuses(u: Unit) {
  for (const s of u.statuses) s.turnsLeft -= 1;
  u.statuses = u.statuses.filter((s) => s.turnsLeft > 0);
}

/** End the active unit's turn: CT cost, status durations, resume the loop. */
export async function finalizeTurn(game: GameState, facing: Facing) {
  const b = game.battle!;
  const u = b.units.find((x) => x.id === b.activeUnitId);
  if (!u) return;
  u.facing = facing;
  u.ct -= 60 + (b.hasMoved ? 20 : 0) + (b.hasActed ? 20 : 0);
  tickStatuses(u);
  b.activeUnitId = null;
  b.moveOrigin = null;
  clearTargetingUi(b);
  b.ui.mode = 'idle';
  hooks.onChange();
  await progress(game);
}

// ---------------------------------------------------------------------------
// Shared execution paths (player & AI use the same code)
// ---------------------------------------------------------------------------
async function doWalk(game: GameState, u: Unit, dest: XY): Promise<boolean> {
  const b = game.battle!;
  const st = effectiveStats(u);
  const reach = reachableTiles(b, u, st.move, st.jump);
  const entry = reach[key(dest.x, dest.y)];
  if (!entry || !entry.canStop) return false;
  const path = pathTo(reach, dest);
  await hooks.unitWalk(u, path);
  u.x = dest.x; u.y = dest.y;
  if (path.length >= 2) u.facing = facingBetween(path[path.length - 2], path[path.length - 1]);
  claimTreasure(game, u);
  hooks.onChange();
  return true;
}

/**
 * Claim a treasure tile. Rewards are STAGED into results and only granted on
 * victory (endBattle) — otherwise retrying a battle would farm the caches.
 * Returns true if anything was claimed.
 */
function claimTreasure(game: GameState, u: Unit): boolean {
  const b = game.battle!;
  if (u.team !== 'player') return false;
  const t = tileAt(b, u.x, u.y);
  if (!t?.treasure || t.treasure.claimed) return false;
  t.treasure.claimed = true;
  const parts: string[] = [];
  if (t.treasure.gold) {
    b.results.treasureGold += t.treasure.gold;
    b.results.gold += t.treasure.gold;
    parts.push(`${t.treasure.gold} gold`);
  }
  if (t.treasure.itemId) {
    b.results.treasureItemIds.push(t.treasure.itemId);
    const item = getConsumable(t.treasure.itemId);
    b.results.itemsFound.push(item.name);
    parts.push(item.name);
  }
  if (t.treasure.jp) {
    b.results.treasureJp[u.id] = (b.results.treasureJp[u.id] ?? 0) + t.treasure.jp;
    b.results.jpGained[u.id] = (b.results.jpGained[u.id] ?? 0) + t.treasure.jp;
    parts.push(`${t.treasure.jp} JP`);
  }
  log(b, `${u.name} found a cache: ${parts.join(', ')}!`);
  return true;
}

function award(game: GameState, u: Unit, exp: number, jp: number) {
  if (u.team !== 'player') return;
  const b = game.battle!;
  u.jp += jp;
  b.results.jpGained[u.id] = (b.results.jpGained[u.id] ?? 0) + jp;
  const levels = grantExp(u, exp);
  b.results.expGained[u.id] = (b.results.expGained[u.id] ?? 0) + exp;
  if (levels > 0) {
    log(b, `${u.name} reached level ${u.level}!`);
    if (!b.results.levelUps.includes(u.name)) b.results.levelUps.push(u.name);
  }
}

async function executeAbilityAt(game: GameState, caster: Unit, ability: AbilityDef, target: XY) {
  const b = game.battle!;
  const tiles = aoeTiles(b, { x: caster.x, y: caster.y }, ability, target);
  if (target.x !== caster.x || target.y !== caster.y) {
    caster.facing = facingBetween(caster, target);
  }

  if (ability.castTicks && ability.castTicks > 0) {
    caster.mp = Math.max(0, caster.mp - ability.mpCost);
    b.pendingCasts.push(makeCast(caster.id, ability.id, tiles, ability.castTicks));
    log(b, `${caster.name} begins casting ${ability.name}...`);
    await hooks.castFlash(caster, ability);
    hooks.onChange();
    award(game, caster, 8, 8);
    return;
  }

  if (ability.type === 'magic' || ability.type === 'heal' || ability.type === 'buff' || ability.type === 'revive' || ability.type === 'teleport') {
    await hooks.castFlash(caster, ability);
  } else {
    await hooks.unitLunge(caster, target);
  }

  const events = applyAbility(b, caster, ability, tiles);
  logEvents(b, caster, ability, events);
  await hooks.abilityFx(ability, tiles, events);
  awardForEvents(game, caster, events);
  if (ability.type === 'teleport') claimTreasure(game, caster);
  hooks.onChange();
}

function logEvents(b: BattleState, caster: Unit, ability: AbilityDef, events: CombatEvent[]) {
  if (ability.type === 'teleport') {
    log(b, `${caster.name} slips through shadow.`);
    return;
  }
  if (!events.length) {
    log(b, `${caster.name} uses ${ability.name}... nothing happens.`);
    return;
  }
  for (const ev of events) {
    if (ev.miss) log(b, `${caster.name}'s ${ability.name} misses ${ev.targetName}.`);
    else if (ev.revived) log(b, `${ev.targetName} rises again! (${ev.heal} HP)`);
    else if (ev.heal !== undefined) log(b, `${ability.name} restores ${ev.heal} HP to ${ev.targetName}.`);
    else if (ev.damage !== undefined) {
      log(b, `${caster.name}'s ${ability.name} hits ${ev.targetName} for ${ev.damage}.`);
      if (ev.status) log(b, `${ev.targetName} is afflicted: ${ev.status}.`);
      if (ev.koed) log(b, `${ev.targetName} is struck down!`);
    } else if (ev.status) {
      log(b, `${ev.targetName} gains ${ev.status}.`);
    }
  }
}

function awardForEvents(game: GameState, caster: Unit, events: CombatEvent[]) {
  const b = game.battle!;
  if (caster.team !== 'player') return;
  if (!events.length) return;
  let exp = 12;
  let jp = 10;
  for (const ev of events) {
    if (ev.koed) {
      const t = b.units.find((x) => x.id === ev.targetId);
      exp += Math.max(8, 25 + (t ? (t.level - caster.level) * 4 : 0));
      jp += 6;
    }
  }
  award(game, caster, Math.min(exp, 95), jp);
}

async function resolveCast(game: GameState, castId: string) {
  const b = game.battle!;
  const idx = b.pendingCasts.findIndex((c) => c.id === castId);
  if (idx < 0) return;
  const cast = b.pendingCasts[idx];
  b.pendingCasts.splice(idx, 1);
  const caster = b.units.find((u) => u.id === cast.casterId);
  const ability = getAbility(cast.abilityId);
  if (!caster || caster.ko || caster.gone) {
    log(b, `${ability.name} fizzles — its caster has fallen.`);
    hooks.onChange();
    return;
  }
  log(b, `${ability.name} erupts!`);
  const events = applyAbility(b, caster, { ...ability, mpCost: 0 }, cast.tiles);
  logEvents(b, caster, ability, events);
  await hooks.abilityFx(ability, cast.tiles, events);
  awardForEvents(game, caster, events);
  hooks.onChange();
}

// ---------------------------------------------------------------------------
// Player commands (called from UI)
// ---------------------------------------------------------------------------
function activeUnit(b: BattleState): Unit | undefined {
  return b.units.find((u) => u.id === b.activeUnitId);
}

function clearTargetingUi(b: BattleState) {
  b.ui.reachable = undefined;
  b.ui.targetable = undefined;
  b.ui.aoePreview = undefined;
  b.ui.pathPreview = undefined;
  b.ui.forecast = undefined;
  b.ui.pendingTarget = undefined;
  b.ui.selectedAbilityId = undefined;
  b.ui.selectedItemId = undefined;
}

export function uiEnterMove(game: GameState) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || b.hasMoved) return;
  const st = effectiveStats(u);
  b.ui.reachable = reachableTiles(b, u, st.move, st.jump);
  b.ui.mode = 'move';
  hooks.onChange();
}

export function uiHoverTile(game: GameState, tile: XY | null) {
  const b = game.battle;
  if (!b) return;
  b.ui.hoverTile = tile ?? undefined;
  if (b.ui.mode === 'move' && b.ui.reachable) {
    const entry = tile ? b.ui.reachable[key(tile.x, tile.y)] : undefined;
    b.ui.pathPreview = tile && entry && entry.canStop ? pathTo(b.ui.reachable, tile) : undefined;
  }
  if (b.ui.mode === 'target') {
    const u = activeUnit(b);
    const ability = u ? currentAbility(b, u) : null;
    const valid = tile && b.ui.targetable?.some((t) => t.x === tile.x && t.y === tile.y);
    if (valid && u && ability) {
      b.ui.aoePreview = ability.type === 'teleport' ? [tile!] : aoeTiles(b, u, ability, tile!);
    } else {
      b.ui.aoePreview = undefined; // hovering off the valid area clears the preview
    }
  }
  hooks.onChange();
}

export async function uiClickMove(game: GameState, tile: XY) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || b.ui.mode !== 'move' || !b.ui.reachable) return;
  const entry = b.ui.reachable[key(tile.x, tile.y)];
  if (!entry || !entry.canStop) return;
  if (tile.x === u.x && tile.y === u.y) { uiCancel(game); return; }
  b.ui.mode = 'idle';
  const reachSnapshot = b.ui.reachable;
  clearTargetingUi(b);
  hooks.onChange();
  const path = pathTo(reachSnapshot, tile);
  await hooks.unitWalk(u, path);
  u.x = tile.x; u.y = tile.y;
  if (path.length >= 2) u.facing = facingBetween(path[path.length - 2], path[path.length - 1]);
  b.hasMoved = true;
  if (claimTreasure(game, u)) {
    b.moveOrigin = null; // a claimed cache makes the move final — no free-loot undo
  }
  b.ui.mode = 'unitMenu';
  hooks.onChange();
}

export function uiUndoMove(game: GameState) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || !b.hasMoved || b.hasActed || !b.moveOrigin) return;
  u.x = b.moveOrigin.x;
  u.y = b.moveOrigin.y;
  u.facing = b.moveOrigin.facing;
  b.hasMoved = false;
  b.ui.mode = 'unitMenu';
  hooks.onChange();
}

export function uiEnterActions(game: GameState) {
  const b = game.battle!;
  if (b.hasActed) return;
  b.ui.mode = 'action';
  hooks.onChange();
}

export function uiEnterItems(game: GameState) {
  const b = game.battle!;
  if (b.hasActed) return;
  b.ui.mode = 'item';
  hooks.onChange();
}

export function playerAbilityList(game: GameState): AbilityDef[] {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u) return [];
  return [basicAttackFor(u), ...knownAbilities(u).map(getAbility)];
}

function currentAbility(b: BattleState, u: Unit): AbilityDef | null {
  if (b.ui.selectedItemId) {
    // items behave like a range-1 single-target ability
    return {
      id: `item_${b.ui.selectedItemId}`, name: getConsumable(b.ui.selectedItemId).name, desc: '',
      job: 'common', type: 'heal', power: 0, mpCost: 0,
      rangeMin: 0, rangeMax: 1, aoe: 'single', baseHit: 100, jpCost: 0, vertTol: 2, icon: '',
    };
  }
  if (!b.ui.selectedAbilityId) return null;
  return b.ui.selectedAbilityId === 'attack' ? basicAttackFor(u) : getAbility(b.ui.selectedAbilityId);
}

export function uiSelectAbility(game: GameState, abilityId: string) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u) return;
  const ability = abilityId === 'attack' ? basicAttackFor(u) : getAbility(abilityId);
  if (ability.mpCost > u.mp) return;
  b.ui.selectedAbilityId = abilityId;
  b.ui.selectedItemId = undefined;
  b.ui.targetable = targetableTiles(b, u, u, ability);
  b.ui.mode = 'target';
  hooks.onChange();
}

export function uiSelectItem(game: GameState, itemId: string) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || !(game.inventory[itemId] > 0)) return;
  b.ui.selectedItemId = itemId;
  b.ui.selectedAbilityId = undefined;
  // items target self or adjacent tiles
  const tiles: XY[] = [];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (Math.abs(x - u.x) + Math.abs(y - u.y) <= 1) tiles.push({ x, y });
    }
  }
  b.ui.targetable = tiles;
  b.ui.mode = 'target';
  hooks.onChange();
}

export function uiClickTarget(game: GameState, tile: XY) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || b.ui.mode !== 'target') return;
  if (!b.ui.targetable?.some((t) => t.x === tile.x && t.y === tile.y)) return;

  if (b.ui.selectedItemId) {
    const target = unitAt(b, tile.x, tile.y);
    if (!target) return;
    const item = getConsumable(b.ui.selectedItemId);
    if (item.kind === 'revive' && (!target.ko || !sameSide(u, target))) return;
    if (item.kind !== 'revive' && target.ko) return;
    const stats = maxStats(target);
    const amount = item.kind === 'heal' ? Math.min(item.amount, stats.hp - target.hp)
      : item.kind === 'mp' ? Math.min(item.amount, stats.mp - target.mp)
      : item.kind === 'revive' ? Math.round((stats.hp * item.amount) / 100)
      : 0;
    b.ui.pendingTarget = tile;
    b.ui.forecast = {
      targets: [{
        unitId: target.id, name: target.name, hit: 100, amount,
        kind: item.kind === 'mp' ? 'mp' : item.kind === 'revive' ? 'revive' : item.kind === 'cure' ? 'status' : 'heal',
      }],
      mpCost: 0,
    };
    b.ui.mode = 'confirm';
    hooks.onChange();
    return;
  }

  const ability = currentAbility(b, u);
  if (!ability) return;
  if (ability.type === 'teleport') {
    if (unitAt(b, tile.x, tile.y) || tileAt(b, tile.x, tile.y)?.impassable) return;
    b.ui.pendingTarget = tile;
    b.ui.aoePreview = [tile];
    b.ui.forecast = { targets: [], mpCost: ability.mpCost };
    b.ui.mode = 'confirm';
    hooks.onChange();
    return;
  }
  const tiles = aoeTiles(b, u, ability, tile);
  b.ui.pendingTarget = tile;
  b.ui.aoePreview = tiles;
  b.ui.forecast = buildForecast(b, u, ability, tiles);
  b.ui.mode = 'confirm';
  hooks.onChange();
}

export async function uiConfirmAction(game: GameState) {
  const b = game.battle!;
  const u = activeUnit(b);
  if (!u || b.ui.mode !== 'confirm' || !b.ui.pendingTarget) return;
  const target = b.ui.pendingTarget;

  if (b.ui.selectedItemId) {
    const itemId = b.ui.selectedItemId;
    clearTargetingUi(b);
    b.ui.mode = 'idle';
    hooks.onChange();
    await executeItem(game, u, itemId, target);
    b.hasActed = true;
    b.ui.mode = 'unitMenu';
    hooks.onChange();
    if (checkEnd(game)) return;
    return;
  }

  const ability = currentAbility(b, u);
  if (!ability) return;
  clearTargetingUi(b);
  b.ui.mode = 'idle';
  hooks.onChange();
  await executeAbilityAt(game, u, ability, target);
  b.hasActed = true;
  if (b.phase !== 'combat') return;
  if (checkEnd(game)) return;
  if (u.ko || u.gone) {
    // caught in their own blast — the turn ends immediately
    await finalizeTurn(game, u.facing);
    return;
  }
  b.ui.mode = 'unitMenu';
  hooks.onChange();
}

async function executeItem(game: GameState, user: Unit, itemId: string, targetTile: XY) {
  const b = game.battle!;
  const item = getConsumable(itemId);
  const target = unitAt(b, targetTile.x, targetTile.y);
  if (!target || !(game.inventory[itemId] > 0)) return;
  if (item.kind === 'revive' && (!target.ko || !sameSide(user, target))) return;
  if (item.kind !== 'revive' && target.ko) return;
  game.inventory[itemId] -= 1;
  if (game.inventory[itemId] <= 0) delete game.inventory[itemId];
  if (user.x !== targetTile.x || user.y !== targetTile.y) {
    user.facing = facingBetween(user, targetTile);
  }
  const events: CombatEvent[] = [];
  if (item.kind === 'heal') {
    const healed = Math.min(item.amount, maxStats(target).hp - target.hp);
    target.hp += healed;
    events.push({ targetId: target.id, targetName: target.name, heal: healed, tile: targetTile });
    log(b, `${user.name} uses ${item.name}: ${target.name} recovers ${healed} HP.`);
  } else if (item.kind === 'mp') {
    target.mp = Math.min(maxStats(target).mp, target.mp + item.amount);
    events.push({ targetId: target.id, targetName: target.name, heal: item.amount, tile: targetTile });
    log(b, `${user.name} uses ${item.name}: ${target.name} recovers ${item.amount} MP.`);
  } else if (item.kind === 'revive') {
    const amount = Math.max(1, Math.round((maxStats(target).hp * item.amount) / 100));
    target.ko = false; target.koCounter = 0;
    target.hp = amount;
    events.push({ targetId: target.id, targetName: target.name, heal: amount, revived: true, tile: targetTile });
    log(b, `${user.name} uses ${item.name}: ${target.name} rises with ${amount} HP!`);
  } else if (item.kind === 'cure') {
    target.statuses = target.statuses.filter((s) => s.id === 'atkUp' || s.id === 'protect' || s.id === 'haste');
    events.push({ targetId: target.id, targetName: target.name, tile: targetTile });
    log(b, `${user.name} uses ${item.name}: ${target.name} is cleansed.`);
  }
  await hooks.abilityFx(null, [targetTile], events, item.kind);
  award(game, user, 8, 6);
  hooks.onChange();
}

export function uiCancel(game: GameState) {
  const b = game.battle!;
  switch (b.ui.mode) {
    case 'confirm':
      b.ui.mode = 'target';
      b.ui.forecast = undefined;
      b.ui.pendingTarget = undefined;
      b.ui.aoePreview = undefined;
      break;
    case 'target':
      b.ui.targetable = undefined;
      b.ui.aoePreview = undefined;
      b.ui.mode = b.ui.selectedItemId ? 'item' : 'action';
      b.ui.selectedAbilityId = undefined;
      b.ui.selectedItemId = undefined;
      break;
    case 'action':
    case 'item':
    case 'move':
      clearTargetingUi(b);
      b.ui.mode = 'unitMenu';
      break;
    case 'facing':
      b.ui.mode = 'unitMenu';
      break;
    default:
      break;
  }
  hooks.onChange();
}

export function uiBeginWait(game: GameState) {
  const b = game.battle!;
  clearTargetingUi(b);
  b.ui.mode = 'facing';
  hooks.onChange();
}

export async function uiPickFacing(game: GameState, facing: Facing) {
  const b = game.battle!;
  if (b.ui.mode !== 'facing') return;
  await finalizeTurn(game, facing);
}

// ---------------------------------------------------------------------------
// AI turn
// ---------------------------------------------------------------------------
async function runAiTurn(game: GameState, u: Unit) {
  const b = game.battle!;
  const plan = planTurn(b, u, b.difficulty);
  await hooks.delay(260);

  if (plan.moveTo) {
    b.hasMoved = await doWalk(game, u, plan.moveTo);
  }
  if (plan.action && b.phase === 'combat') {
    const ability = plan.action.abilityId === 'attack' ? basicAttackFor(u) : getAbility(plan.action.abilityId);
    // revalidate target from final position
    const valid = targetableTiles(b, u, u, ability).some((t) => t.x === plan.action!.target.x && t.y === plan.action!.target.y);
    if (valid) {
      await executeAbilityAt(game, u, ability, plan.action.target);
      b.hasActed = true;
    }
  }
  if (plan.postMoveTo && b.phase === 'combat' && !b.hasMoved) {
    b.hasMoved = await doWalk(game, u, plan.postMoveTo);
  }
  u.facing = plan.facing;
  u.ct -= 60 + (b.hasMoved ? 20 : 0) + (b.hasActed ? 20 : 0);
  tickStatuses(u);
  b.activeUnitId = null;
  hooks.onChange();
  await hooks.delay(200);
}

/**
 * Headless helper: let the AI play the active (player) unit's turn.
 * Used by simulations/tests; the browser never calls this.
 */
export async function autoPlayTurn(game: GameState) {
  const b = game.battle;
  if (!b || b.phase !== 'combat') return;
  const u = activeUnit(b);
  if (!u) return;
  b.ui.mode = 'idle';
  await runAiTurn(game, u);
  if (!checkEnd(game)) await progress(game);
}

// ---------------------------------------------------------------------------
// Victory / defeat
// ---------------------------------------------------------------------------
export function checkEnd(game: GameState): boolean {
  const b = game.battle!;
  if (b.phase !== 'combat') return true;
  const def = getMap(b.mapId);
  const playersAlive = b.units.some((u) => u.team === 'player' && !u.ko && !u.gone);
  const enemiesAlive = b.units.some((u) => u.team === 'enemy' && !u.ko && !u.gone);
  const guest = b.units.find((u) => u.team === 'guest');

  if (def.objective.type === 'protect' && guest?.gone) return endBattle(game, false);
  if (!playersAlive) return endBattle(game, false);

  if (!enemiesAlive) {
    if (def.objective.type === 'protect' && guest && (guest.ko || guest.gone)) {
      return guest.gone ? endBattle(game, false) : endBattle(game, true);
    }
    return endBattle(game, true);
  }
  if (def.objective.type === 'leader') {
    const leader = b.units.find((u) => u.isLeader);
    if (leader && (leader.ko || leader.gone)) return endBattle(game, true);
  }
  if (def.objective.type === 'survive' && def.objective.rounds && b.round >= def.objective.rounds) {
    return endBattle(game, true);
  }
  return false;
}

function endBattle(game: GameState, victory: boolean): boolean {
  const b = game.battle!;
  const def = getMap(b.mapId);
  b.phase = victory ? 'victory' : 'defeat';
  b.results.victory = victory;
  if (victory) {
    b.results.gold += def.rewardGold;
    game.gold += def.rewardGold + b.results.treasureGold;
    for (const id of b.results.treasureItemIds) {
      game.inventory[id] = (game.inventory[id] ?? 0) + 1;
    }
    for (const [uid, jp] of Object.entries(b.results.treasureJp)) {
      const u = b.units.find((x) => x.id === uid);
      if (u) u.jp += jp;
    }
    log(b, `Victory! Earned ${def.rewardGold} gold.`);
  } else {
    log(b, def.objective.defeatText);
  }
  b.ui.mode = 'idle';
  hooks.onChange();
  void hooks.banner(victory ? 'Victory!' : 'Defeat...', 1400);
  return true;
}
