import type { GameState, Unit } from '../entities/types';
import { CAMPAIGN, STARTING_GOLD, STARTING_INVENTORY, STARTING_ROSTER, shopTier } from '../data/campaign';
import { CONSUMABLES, EQUIPMENT, getConsumable, getEquipment } from '../data/items';
import { createUnit, equip, maxStats, unequip } from '../entities/unit';
import { createBattleState } from '../systems/battle';

export function newGameState(): GameState {
  return {
    screen: 'title',
    roster: [],
    gold: 0,
    inventory: {},
    ownedEquipment: [],
    campaignIndex: 0,
    difficulty: 'normal',
    battle: null,
    startedRun: false,
  };
}

export function startNewRun(game: GameState, difficulty: GameState['difficulty']) {
  game.roster = STARTING_ROSTER.map((s) => {
    const u = createUnit({
      name: s.name, job: s.job, level: 1, team: 'player',
      equipment: { weapon: s.weapon, armor: s.armor },
      learned: [s.firstAbility],
    });
    const stats = maxStats(u);
    u.hp = stats.hp; u.mp = stats.mp;
    return u;
  });
  game.gold = STARTING_GOLD;
  game.inventory = { ...STARTING_INVENTORY };
  game.ownedEquipment = ['quilted_vest'];
  game.campaignIndex = 0;
  game.difficulty = difficulty;
  game.battle = null;
  game.startedRun = true;
  game.screen = 'campaign';
  saveGame(game);
}

export function enterBattle(game: GameState, mapId: string) {
  game.battle = createBattleState(game, mapId);
  game.screen = 'battle';
}

/** Leave the results screen. On victory, advance the campaign. */
export function leaveBattle(game: GameState) {
  const b = game.battle;
  if (!b) return;
  const idx = CAMPAIGN.findIndex((n) => n.mapId === b.mapId);
  if (b.results.victory && idx === game.campaignIndex && game.campaignIndex < CAMPAIGN.length) {
    game.campaignIndex += 1;
  }
  // clear battle-scoped unit state
  for (const u of game.roster) {
    const s = maxStats(u);
    u.hp = s.hp; u.mp = s.mp; u.ct = 0;
    u.ko = false; u.koCounter = 0; u.gone = false;
    u.statuses = [];
    u.x = -1; u.y = -1;
  }
  game.battle = null;
  game.screen = 'campaign';
  saveGame(game);
}

export function retryBattle(game: GameState) {
  const b = game.battle;
  if (!b) return;
  const mapId = b.mapId;
  for (const u of game.roster) {
    const s = maxStats(u);
    u.hp = s.hp; u.mp = s.mp; u.ct = 0;
    u.ko = false; u.koCounter = 0; u.gone = false;
    u.statuses = [];
    u.x = -1; u.y = -1;
  }
  game.battle = createBattleState(game, mapId);
}

export const campaignComplete = (game: GameState) => game.campaignIndex >= CAMPAIGN.length;

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
export function shopStock(game: GameState): { equipment: string[]; consumables: string[] } {
  const tier = shopTier(game.campaignIndex);
  return {
    equipment: Object.values(EQUIPMENT).filter((e) => e.tier <= tier).map((e) => e.id),
    consumables: Object.values(CONSUMABLES).filter((c) => c.tier <= tier).map((c) => c.id),
  };
}

export function buyEquipment(game: GameState, id: string): boolean {
  const def = getEquipment(id);
  if (game.gold < def.cost) return false;
  game.gold -= def.cost;
  game.ownedEquipment.push(id);
  saveGame(game);
  return true;
}

export function buyConsumable(game: GameState, id: string): boolean {
  const def = getConsumable(id);
  if (game.gold < def.cost) return false;
  game.gold -= def.cost;
  game.inventory[id] = (game.inventory[id] ?? 0) + 1;
  saveGame(game);
  return true;
}

export function sellEquipment(game: GameState, id: string): boolean {
  const idx = game.ownedEquipment.indexOf(id);
  if (idx < 0) return false;
  game.ownedEquipment.splice(idx, 1);
  game.gold += Math.floor(getEquipment(id).cost / 2);
  saveGame(game);
  return true;
}

// ---------------------------------------------------------------------------
// Party management
// ---------------------------------------------------------------------------
export function equipFromPool(game: GameState, unit: Unit, equipId: string): boolean {
  const idx = game.ownedEquipment.indexOf(equipId);
  if (idx < 0) return false;
  const def = getEquipment(equipId);
  if (def.jobs && !def.jobs.includes(unit.job)) return false;
  game.ownedEquipment.splice(idx, 1);
  const prev = equip(unit, equipId);
  if (prev) game.ownedEquipment.push(prev);
  saveGame(game);
  return true;
}

export function unequipToPool(game: GameState, unit: Unit, slot: 'weapon' | 'armor' | 'accessory') {
  const prev = unequip(unit, slot);
  if (prev) game.ownedEquipment.push(prev);
  saveGame(game);
}

export function changeJob(game: GameState, unit: Unit, job: Unit['job']) {
  if (unit.job === job) return;
  unit.job = job;
  if (!unit.learned[job]) unit.learned[job] = [];
  // drop job-restricted equipment that no longer fits
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const id = unit.equipment[slot];
    if (!id) continue;
    const def = getEquipment(id);
    if (def.jobs && !def.jobs.includes(job)) {
      unequipToPool(game, unit, slot);
    }
  }
  const s = maxStats(unit);
  unit.hp = s.hp; unit.mp = s.mp;
  saveGame(game);
}

// ---------------------------------------------------------------------------
// Save / load (localStorage)
// ---------------------------------------------------------------------------
const SAVE_KEY = 'emberveil-save-v1';

export function saveGame(game: GameState) {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = {
      roster: game.roster,
      gold: game.gold,
      inventory: game.inventory,
      ownedEquipment: game.ownedEquipment,
      campaignIndex: game.campaignIndex,
      difficulty: game.difficulty,
      startedRun: game.startedRun,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // storage full/unavailable — saving is best-effort
  }
}

export function hasSave(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadGame(game: GameState): boolean {
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    game.roster = data.roster;
    game.gold = data.gold;
    game.inventory = data.inventory;
    game.ownedEquipment = data.ownedEquipment;
    game.campaignIndex = data.campaignIndex;
    game.difficulty = data.difficulty;
    game.startedRun = data.startedRun;
    game.battle = null;
    game.screen = 'campaign';
    return true;
  } catch {
    return false;
  }
}
