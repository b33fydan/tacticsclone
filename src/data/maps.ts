import type { BattleMapDef, TerrainType, Tile } from '../entities/types';

const TERRAIN_CHARS: Record<string, TerrainType> = {
  g: 'grass', d: 'dirt', s: 'stone', w: 'water', n: 'sand',
};

/** Expand the compact string grids of a map definition into Tile objects. */
export function parseMap(def: BattleMapDef): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < def.rows.length; y++) {
    const row: Tile[] = [];
    const terr = def.rows[y];
    const hts = def.heights[y];
    if (terr.length !== hts.length) throw new Error(`Map ${def.id} row ${y}: terrain/height length mismatch`);
    for (let x = 0; x < terr.length; x++) {
      const terrain = TERRAIN_CHARS[terr[x]];
      if (!terrain) throw new Error(`Map ${def.id}: bad terrain char '${terr[x]}'`);
      row.push({ x, y, h: parseInt(hts[x], 10), terrain, impassable: terrain === 'water' });
    }
    tiles.push(row);
  }
  for (const p of def.props) {
    const t = tiles[p.y]?.[p.x];
    if (!t) throw new Error(`Map ${def.id}: prop out of bounds at ${p.x},${p.y}`);
    t.prop = p.key;
    if (p.impassable) t.impassable = true;
  }
  for (const tr of def.treasures ?? []) {
    const t = tiles[tr.y]?.[tr.x];
    if (!t) throw new Error(`Map ${def.id}: treasure out of bounds`);
    t.treasure = { gold: tr.gold, itemId: tr.itemId, jp: tr.jp, claimed: false };
  }
  return tiles;
}

export const MAPS: Record<string, BattleMapDef> = {
  greenford: {
    id: 'greenford',
    name: 'Greenford Crossing',
    blurb: 'Bandits of the Red Fen have seized the only bridge over the Greenford. The Daybreak Company takes its first contract: clear the crossing.',
    envKey: 'meadow',
    rows: [
      'gggggwggggg',
      'gggggwggggg',
      'ggdggwggdgg',
      'gggggwggggg',
      'dddddsddddd',
      'gggggwggggg',
      'gggggwggggg',
      'ggdggwggggg',
      'gggggwggggg',
    ],
    heights: [
      '00000001111',
      '00000000111',
      '00000000011',
      '00000000001',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000011',
      '00000000111',
    ],
    props: [
      { x: 1, y: 6, key: 'tree', impassable: true },
      { x: 8, y: 7, key: 'tree', impassable: true },
      { x: 9, y: 1, key: 'tree', impassable: true },
      { x: 3, y: 1, key: 'rock', impassable: true },
      { x: 6, y: 3, key: 'crate', impassable: true },
    ],
    deployTiles: [
      { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 5 },
    ],
    maxDeploy: 4,
    enemies: [
      { job: 'bulwark', level: 2, x: 8, y: 4, name: 'Rook', aiProfile: 'aggressive' },
      { job: 'duskblade', level: 1, x: 8, y: 6, name: 'Cutter', aiProfile: 'aggressive' },
      { job: 'duskblade', level: 1, x: 8, y: 2, name: 'Snare', aiProfile: 'aggressive' },
      { job: 'skywarden', level: 1, x: 9, y: 2, name: 'Fletch', aiProfile: 'defensive' },
    ],
    objective: { type: 'rout', text: 'Defeat all enemies.', defeatText: 'The company falls at the crossing.' },
    rewardGold: 150,
  },

  cliffside: {
    id: 'cliffside',
    name: 'Cliffside Watch',
    blurb: 'An Ashmark Legion outpost crowns the cliffs, and Captain Hale watches the road from its highest tier. Take the heights — or take him.',
    envKey: 'cliffs',
    rows: [
      'gggdddssssss',
      'gggdddssssss',
      'ggggdddsssss',
      'ggggdddsssss',
      'gggggddsssss',
      'gggggdddssss',
      'ggggggdddsss',
      'ggggggddddss',
      'gggggggddddd',
      'gggggggddddd',
    ],
    heights: [
      '000111222233',
      '000111222333',
      '000011122333',
      '000011122333',
      '000001122233',
      '000001112222',
      '000000111222',
      '000000111122',
      '000000011111',
      '000000011111',
    ],
    props: [
      { x: 1, y: 1, key: 'tree', impassable: true },
      { x: 0, y: 7, key: 'tree', impassable: true },
      { x: 3, y: 5, key: 'rock', impassable: true },
      { x: 2, y: 8, key: 'rock', impassable: true },
      { x: 11, y: 0, key: 'pillar', impassable: true },
    ],
    deployTiles: [
      { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 5 }, { x: 1, y: 6 },
    ],
    maxDeploy: 5,
    enemies: [
      { job: 'skywarden', level: 4, x: 10, y: 1, name: 'Captain Hale', isLeader: true, aiProfile: 'defensive', equip: { weapon: 'hawk_longbow' } },
      { job: 'skywarden', level: 2, x: 9, y: 2, name: 'Ashmark Archer', aiProfile: 'defensive' },
      { job: 'bulwark', level: 2, x: 5, y: 2, name: 'Ashmark Shieldman', aiProfile: 'aggressive' },
      { job: 'bulwark', level: 2, x: 6, y: 6, name: 'Ashmark Shieldman', aiProfile: 'aggressive' },
      { job: 'embercaller', level: 3, x: 8, y: 4, name: 'Ashmark Pyrist', aiProfile: 'defensive' },
      { job: 'dawnmender', level: 2, x: 10, y: 5, name: 'Ashmark Chirurgeon', aiProfile: 'support' },
    ],
    objective: { type: 'leader', text: 'Defeat Captain Hale.', defeatText: 'The cliffs keep their watch, and the company keeps its graves.' },
    rewardGold: 220,
  },

  ruins: {
    id: 'ruins',
    name: 'Sunken Ruins',
    blurb: 'Scholar Edwyn came to the drowned halls of old Veyra chasing inscriptions — and the Gravewater Cult came chasing him. Keep the old man breathing.',
    envKey: 'ruins',
    rows: [
      'ggssssssgggg',
      'gsssssssssgg',
      'gsswwsssssgg',
      'gsswwssswssg',
      'gssssssswssg',
      'ggssssssssgg',
      'ggssssssssgg',
      'gssssssssssg',
      'gssssssssssg',
      'ggssssssssgg',
      'gggssssssggg',
    ],
    heights: [
      '000000000000',
      '000001110000',
      '000001110000',
      '000000000000',
      '000011100000',
      '000011100000',
      '000011100000',
      '000000000000',
      '000000000000',
      '000000000000',
      '000000000000',
    ],
    props: [
      { x: 2, y: 1, key: 'pillar', impassable: true },
      { x: 9, y: 1, key: 'pillar', impassable: true },
      { x: 2, y: 8, key: 'pillar', impassable: true },
      { x: 9, y: 8, key: 'pillar', impassable: true },
      { x: 3, y: 7, key: 'crate', impassable: true },
      { x: 0, y: 9, key: 'tree', impassable: true },
      { x: 11, y: 9, key: 'tree', impassable: true },
    ],
    deployTiles: [
      { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 1, y: 4 }, { x: 1, y: 5 }, { x: 1, y: 6 },
    ],
    maxDeploy: 5,
    guest: { job: 'dawnmender', level: 2, x: 6, y: 1, name: 'Scholar Edwyn' },
    enemies: [
      { job: 'duskblade', level: 5, x: 2, y: 9, name: 'Cult Knife', aiProfile: 'aggressive' },
      { job: 'duskblade', level: 4, x: 9, y: 9, name: 'Cult Knife', aiProfile: 'aggressive' },
      { job: 'embercaller', level: 4, x: 6, y: 9, name: 'Cult Pyrist', aiProfile: 'defensive' },
      { job: 'bulwark', level: 4, x: 4, y: 10, name: 'Cult Warden', aiProfile: 'aggressive' },
      { job: 'dawnmender', level: 4, x: 7, y: 10, name: 'Cult Mender', aiProfile: 'support' },
    ],
    objective: { type: 'protect', text: 'Defeat all enemies. Scholar Edwyn must survive.', defeatText: 'The cult drags Edwyn beneath the gravewater.' },
    treasures: [
      { x: 1, y: 1, gold: 120 },
      { x: 10, y: 8, itemId: 'great_tonic', jp: 50 },
    ],
    rewardGold: 300,
  },

  ashenpass: {
    id: 'ashenpass',
    name: 'Ashen Pass',
    blurb: 'The Legion answers the loss of its outpost with a column through Ashen Pass. The company cannot beat them all — only outlast them. Hold the mound until relief sounds.',
    envKey: 'ash',
    rows: [
      'sssssssssssss',
      'ddddddddddddd',
      'ddddnnnnndddd',
      'ddddnnnnndddd',
      'dddddnnnddddd',
      'ddddnnnnndddd',
      'ddddnnnnndddd',
      'ddddddddddddd',
      'sssssssssssss',
    ],
    heights: [
      '2222222222222',
      '1111111111111',
      '0000000000000',
      '0000110000000',
      '0000110000000',
      '0000110000000',
      '0000000000000',
      '1111111111111',
      '2222222222222',
    ],
    props: [
      { x: 7, y: 2, key: 'rock', impassable: true },
      { x: 9, y: 6, key: 'rock', impassable: true },
      { x: 2, y: 6, key: 'rock', impassable: true },
      { x: 1, y: 2, key: 'tree', impassable: true },
      { x: 10, y: 2, key: 'tree', impassable: true },
    ],
    deployTiles: [
      { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 },
      { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 4, y: 5 },
      { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
    ],
    maxDeploy: 5,
    enemies: [
      { job: 'bulwark', level: 5, x: 11, y: 3, name: 'Legion Vanguard', aiProfile: 'aggressive' },
      { job: 'bulwark', level: 5, x: 11, y: 5, name: 'Legion Vanguard', aiProfile: 'aggressive' },
      { job: 'skywarden', level: 5, x: 12, y: 1, name: 'Legion Archer', aiProfile: 'defensive' },
      { job: 'skywarden', level: 5, x: 12, y: 7, name: 'Legion Archer', aiProfile: 'defensive' },
      { job: 'embercaller', level: 6, x: 12, y: 4, name: 'Legion Pyrist', aiProfile: 'defensive' },
      { job: 'duskblade', level: 5, x: 11, y: 6, name: 'Legion Stalker', aiProfile: 'aggressive' },
      { job: 'dawnmender', level: 5, x: 12, y: 3, name: 'Legion Chirurgeon', aiProfile: 'support' },
    ],
    objective: { type: 'survive', rounds: 8, text: 'Survive until Round 8 (or rout the Legion).', defeatText: 'The pass is lost, and the company with it.' },
    treasures: [
      { x: 8, y: 4, gold: 150, jp: 40 },
    ],
    rewardGold: 380,
  },

  bastion: {
    id: 'bastion',
    name: 'Emberveil Bastion',
    blurb: 'Warlord Maugrim waits at the heart of the Emberveil Bastion, the fortress that birthed the Legion. End him, and the war ends with the dawn.',
    envKey: 'bastion',
    rows: [
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      'ggssssssssgg',
      'ggssssssssgg',
      'ggggssssgggg',
      'gggddddddggg',
      'gggddddddggg',
      'gggddddddggg',
      'gggddddddggg',
      'ggggddddgggg',
      'gggggggggggg',
    ],
    heights: [
      '333333333333',
      '333333333333',
      '333333333333',
      '002222222200',
      '001111111100',
      '000011110000',
      '000000000000',
      '000000000000',
      '000000000000',
      '000000000000',
      '000000000000',
      '000000000000',
    ],
    props: [
      { x: 2, y: 4, key: 'pillar', impassable: true },
      { x: 9, y: 4, key: 'pillar', impassable: true },
      { x: 3, y: 8, key: 'crate', impassable: true },
      { x: 8, y: 7, key: 'crate', impassable: true },
      { x: 1, y: 9, key: 'rock', impassable: true },
      { x: 10, y: 10, key: 'rock', impassable: true },
      { x: 0, y: 0, key: 'pillar', impassable: true },
      { x: 11, y: 0, key: 'pillar', impassable: true },
    ],
    deployTiles: [
      { x: 4, y: 10 }, { x: 5, y: 10 }, { x: 6, y: 10 }, { x: 7, y: 10 },
      { x: 4, y: 11 }, { x: 5, y: 11 }, { x: 6, y: 11 }, { x: 7, y: 11 },
    ],
    maxDeploy: 5,
    enemies: [
      { job: 'bulwark', level: 8, x: 5, y: 1, name: 'Warlord Maugrim', isLeader: true, aiProfile: 'defensive', equip: { weapon: 'oathkeeper', armor: 'bastion_plate' } },
      { job: 'dawnmender', level: 6, x: 6, y: 1, name: 'Chirurgeon Ysolde', aiProfile: 'support', equip: { weapon: 'lily_staff' } },
      { job: 'embercaller', level: 5, x: 4, y: 2, name: 'Pyrelord Quense', aiProfile: 'defensive', equip: { weapon: 'pyre_staff' } },
      { job: 'skywarden', level: 5, x: 2, y: 3, name: 'Wall Archer', aiProfile: 'defensive', equip: { weapon: 'hawk_longbow' } },
      { job: 'skywarden', level: 5, x: 9, y: 3, name: 'Wall Archer', aiProfile: 'defensive' },
      { job: 'duskblade', level: 5, x: 5, y: 6, name: 'Keep Stalker', aiProfile: 'aggressive' },
    ],
    objective: { type: 'leader', text: 'Defeat Warlord Maugrim.', defeatText: 'The Emberveil keeps its warlord. Night holds.' },
    rewardGold: 600,
  },
};

export function getMap(id: string): BattleMapDef {
  const m = MAPS[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}
