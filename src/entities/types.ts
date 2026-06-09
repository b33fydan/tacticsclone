// Core shared types for Emberveil Tactics. Simulation only — no rendering concerns.

export type Team = 'player' | 'enemy' | 'guest';
export type Facing = 'N' | 'E' | 'S' | 'W';
export type TerrainType = 'grass' | 'dirt' | 'stone' | 'water' | 'sand';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface XY { x: number; y: number; }

export interface Tile {
  x: number; y: number;
  h: number;                 // elevation step (0..3+)
  terrain: TerrainType;
  impassable: boolean;       // water-deep or blocked by prop
  prop?: string;             // prop asset key (tree, rock, crate, pillar)
  treasure?: TreasureDef;    // claimable battlefield pickup
}

export interface TreasureDef { gold?: number; itemId?: string; jp?: number; claimed: boolean; }

export interface StatBlock {
  hp: number; mp: number; atk: number; mag: number;
  spd: number; move: number; jump: number; evade: number;
}

export type JobId = 'bulwark' | 'skywarden' | 'embercaller' | 'dawnmender' | 'duskblade';

export interface JobDef {
  id: JobId;
  name: string;
  desc: string;
  role: string;
  color: string;                 // identity color (UI accents / fallback art)
  base: StatBlock;               // stats at level 1
  growth: StatBlock;             // gained per level (fractional, rounded on compute)
  abilityIds: string[];          // learnable abilities
  passive?: { name: string; desc: string };
  basicRange: number;            // basic attack max range (1 melee, 4 bow)
  basicVertTol: number;          // height tolerance for basic attack
  basicName: string;
}

export type AoeShape = 'single' | 'diamond1' | 'diamond2' | 'cross1' | 'line';
export type AbilityType = 'phys' | 'magic' | 'heal' | 'buff' | 'debuff' | 'revive' | 'teleport';
export type StatusId = 'poison' | 'atkUp' | 'protect' | 'haste' | 'slow' | 'stun';

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  job: JobId | 'common';
  type: AbilityType;
  power: number;                 // % of relevant stat (0 for utility)
  mpCost: number;
  rangeMin: number;
  rangeMax: number;              // for 'line' shape: line length from caster
  aoe: AoeShape;
  baseHit: number;               // 100 = always (heals/buffs)
  jpCost: number;
  castTicks?: number;            // charge-time casting (CT delay before resolve)
  status?: StatusId;             // status applied on hit
  statusChance?: number;         // 0-100
  vertTol: number;               // max height diff between caster and target tile
  backBonus?: boolean;           // +50% damage when striking from behind
  friendlyFire?: boolean;        // offensive AoEs hit allies too
  icon: string;                  // icon asset key
}

export interface EquipmentDef {
  id: string;
  name: string;
  slot: 'weapon' | 'armor' | 'accessory';
  desc: string;
  cost: number;
  tier: number;                  // shop unlock tier
  mods: Partial<StatBlock>;
  jobs?: JobId[];                // undefined = usable by all
  icon: string;
}

export interface ConsumableDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  tier: number;
  kind: 'heal' | 'mp' | 'revive' | 'cure';
  amount: number;                // heal/mp amount, revive = % of max hp
  icon: string;
}

export interface StatusEffect { id: StatusId; turnsLeft: number; }

export type AiProfile = 'aggressive' | 'defensive' | 'support' | 'flee';

export interface Unit {
  id: string;
  name: string;
  team: Team;
  job: JobId;
  level: number;
  exp: number;                   // 0-99 within current level
  jp: number;                    // unspent job points
  learned: Partial<Record<JobId, string[]>>;  // ability ids learned, per job
  equipment: { weapon?: string; armor?: string; accessory?: string };
  // battle-scoped state
  hp: number; mp: number; ct: number;
  x: number; y: number;
  facing: Facing;
  ko: boolean;
  koCounter: number;             // turns left before the unit is lost for the battle
  gone: boolean;                 // removed from field (countdown expired)
  statuses: StatusEffect[];
  isLeader?: boolean;            // objective: leader kill ends battle
  aiProfile?: AiProfile;
  statMult?: number;             // difficulty scaling (enemies only)
}

export interface PendingCast {
  id: string;
  casterId: string;
  abilityId: string;
  tiles: XY[];                   // resolved AoE tiles, locked at cast start
  ticksLeft: number;
}

export type ObjectiveType = 'rout' | 'leader' | 'survive' | 'protect';

export interface EnemyPlacement {
  job: JobId; level: number; x: number; y: number;
  name?: string; isLeader?: boolean; aiProfile?: AiProfile;
  equip?: { weapon?: string; armor?: string; accessory?: string };
}

export interface BattleMapDef {
  id: string;
  name: string;
  blurb: string;                 // pre-battle flavor text
  envKey: 'meadow' | 'cliffs' | 'ruins' | 'ash' | 'bastion';
  rows: string[];                // terrain letters: g d s w S(sand) per cell
  heights: string[];             // digits 0-9 per cell
  props: { x: number; y: number; key: string; impassable: boolean }[];
  deployTiles: XY[];
  maxDeploy: number;
  enemies: EnemyPlacement[];
  guest?: { job: JobId; level: number; x: number; y: number; name: string };
  objective: { type: ObjectiveType; rounds?: number; text: string; defeatText: string };
  treasures?: { x: number; y: number; gold?: number; itemId?: string; jp?: number }[];
  rewardGold: number;
}

export type BattlePhase = 'deploy' | 'combat' | 'victory' | 'defeat';

export type UiMode =
  | 'idle'          // waiting for turn / watching AI
  | 'unitMenu'      // active unit menu open (Move/Act/Item/Wait)
  | 'move'          // picking a move destination
  | 'action'        // picking ability from list
  | 'item'          // picking item from inventory
  | 'target'        // picking a target tile for ability/item
  | 'confirm'       // forecast shown, confirm/cancel
  | 'facing';       // picking end-of-turn facing

export interface ActionForecast {
  targets: { unitId: string; name: string; hit: number; amount: number; kind: 'damage' | 'heal' | 'mp' | 'revive' | 'status' | 'none'; status?: StatusId }[];
  mpCost: number;
  castTicks?: number;
}

export interface BattleUiState {
  mode: UiMode;
  selectedAbilityId?: string;    // ability or 'attack'
  selectedItemId?: string;
  reachable?: Record<string, { cost: number; from?: string; canStop: boolean }>; // key "x,y"
  targetable?: XY[];             // tiles valid to target
  aoePreview?: XY[];
  pathPreview?: XY[];
  hoverTile?: XY;
  forecast?: ActionForecast;
  pendingTarget?: XY;
  aiActing: boolean;
  banner?: string;               // transient center text ("Victory!", "Round 3")
}

export interface BattleResults {
  expGained: Record<string, number>;
  jpGained: Record<string, number>;
  levelUps: string[];            // unit names that leveled
  gold: number;                  // display total; committed to the purse only on victory
  itemsFound: string[];          // display names
  treasureGold: number;          // staged treasure rewards, granted on victory
  treasureItemIds: string[];
  treasureJp: Record<string, number>;
  victory: boolean;
}

export interface BattleState {
  mapId: string;
  tiles: Tile[][];               // [y][x]
  w: number; h: number;
  units: Unit[];
  phase: BattlePhase;
  activeUnitId: string | null;
  clock: number;                 // total ticks elapsed
  round: number;                 // round marker (charges like a speed-8 unit)
  roundCt: number;
  turnsTaken: number;
  pendingCasts: PendingCast[];
  hasMoved: boolean;
  hasActed: boolean;
  moveOrigin: { x: number; y: number; facing: Facing } | null;
  log: string[];
  ui: BattleUiState;
  results: BattleResults;
  deployChoice: string[];        // roster unit ids chosen during deploy
  difficulty: Difficulty;
}

export type Screen = 'title' | 'campaign' | 'party' | 'shop' | 'battle';

export interface GameState {
  screen: Screen;
  roster: Unit[];
  gold: number;
  inventory: Record<string, number>;        // consumable id -> count
  ownedEquipment: string[];                 // unequipped equipment pool (ids, duplicates allowed)
  campaignIndex: number;                    // battles 0..N-1 cleared before this index
  difficulty: Difficulty;
  battle: BattleState | null;
  startedRun: boolean;
}
