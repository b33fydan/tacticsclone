// Headless campaign simulation: AI plays both sides through all 5 battles.
// Validates data integrity, battle completability, progression, and the
// campaign loop. Run with: npm run simulate
import { CAMPAIGN } from '../src/data/campaign';
import { MAPS, getMap, parseMap } from '../src/data/maps';
import { JOBS } from '../src/data/jobs';
import { ABILITIES, getAbility } from '../src/data/abilities';
import { CONSUMABLES, EQUIPMENT } from '../src/data/items';
import { newGameState, startNewRun, enterBattle, leaveBattle, retryBattle, shopStock, buyEquipment, equipFromPool, campaignComplete } from '../src/game/flow';
import { placeUnit, startCombat, autoPlayTurn } from '../src/systems/battle';
import { learnAbility, maxStats } from '../src/entities/unit';
import { seedRng } from '../src/utils/rng';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
console.log('— Data validation —');
for (const job of Object.values(JOBS)) {
  for (const id of job.abilityIds) {
    check(!!ABILITIES[id], `job ${job.id} references missing ability ${id}`);
    check(ABILITIES[id]?.job === job.id, `ability ${id} job mismatch`);
  }
}
for (const [id, m] of Object.entries(MAPS)) {
  const tiles = parseMap(m);
  check(tiles.length === m.heights.length, `${id} parsed`);
  const w = tiles[0].length;
  for (const row of tiles) check(row.length === w, `${id} ragged rows`);
  for (const e of m.enemies) {
    check(!!tiles[e.y]?.[e.x], `${id} enemy out of bounds at ${e.x},${e.y}`);
    check(!tiles[e.y][e.x].impassable, `${id} enemy on impassable tile ${e.x},${e.y}`);
    for (const eq of Object.values(e.equip ?? {})) check(!!EQUIPMENT[eq!], `${id} enemy bad equip ${eq}`);
  }
  for (const t of m.deployTiles) {
    check(!!tiles[t.y]?.[t.x], `${id} deploy tile out of bounds ${t.x},${t.y}`);
    check(!tiles[t.y][t.x].impassable, `${id} deploy tile impassable ${t.x},${t.y}`);
  }
  if (m.guest) check(!tiles[m.guest.y][m.guest.x].impassable, `${id} guest placement`);
  for (const tr of m.treasures ?? []) {
    if (tr.itemId) check(!!CONSUMABLES[tr.itemId], `${id} treasure item ${tr.itemId}`);
  }
  const occupied = new Set<string>();
  for (const e of m.enemies) {
    const k = `${e.x},${e.y}`;
    check(!occupied.has(k), `${id} two enemies share tile ${k}`);
    occupied.add(k);
  }
}
console.log(failures === 0 ? '  ✓ all data checks passed' : `  ${failures} data failures`);

// ---------------------------------------------------------------------------
async function playBattle(game: ReturnType<typeof newGameState>, mapId: string): Promise<boolean> {
  const def = getMap(mapId);
  enterBattle(game, mapId);
  const b = game.battle!;
  const toDeploy = game.roster.slice(0, def.maxDeploy);
  toDeploy.forEach((u, i) => {
    const ok = placeUnit(game, u.id, def.deployTiles[i]);
    check(ok, `deploy ${u.name} on ${mapId}`);
  });
  check(b.deployChoice.length === Math.min(def.maxDeploy, game.roster.length), `deployed count on ${mapId}`);
  await startCombat(game);
  let guard = 0;
  while (game.battle!.phase === 'combat' && guard++ < 1200) {
    await autoPlayTurn(game);
  }
  check(guard < 1200, `${mapId} battle terminated (no stall)`);
  return game.battle!.phase === 'victory';
}

async function main() {
  seedRng(20260609);
  console.log('\n— Campaign simulation (AI vs AI) —');
  const game = newGameState();
  startNewRun(game, 'normal');
  check(game.roster.length === 5, 'roster created');
  check(game.gold === 250, 'starting gold');

  for (const node of CAMPAIGN) {
    const before = game.campaignIndex;
    let won = false;
    for (let attempt = 1; attempt <= 6 && !won; attempt++) {
      if (attempt === 1) {
        won = await playBattle(game, node.mapId);
      } else {
        retryBattle(game);
        const def = getMap(node.mapId);
        const b = game.battle!;
        game.roster.slice(0, def.maxDeploy).forEach((u, i) => placeUnit(game, u.id, def.deployTiles[i]));
        await startCombat(game);
        let guard = 0;
        while (b.phase === 'combat' && guard++ < 1200) await autoPlayTurn(game);
        won = b.phase === 'victory';
      }
      const b = game.battle!;
      console.log(`  ${node.mapId} attempt ${attempt}: ${b.phase} (round ${b.round}, ${b.turnsTaken} turns)` +
        ` | party HP: ${game.roster.map((u) => `${u.name[0]}${u.ko ? '✝' : Math.round((u.hp / maxStats(u).hp) * 100) + '%'}`).join(' ')}`);
    }
    check(won, `${node.mapId} winnable within 6 AI attempts`);
    leaveBattle(game);
    check(game.campaignIndex === before + (won ? 1 : 0), `campaign advance after ${node.mapId}`);

    // between battles: greedy shopping + ability learning (exercises systems)
    const stock = shopStock(game);
    const better = (slot: 'weapon' | 'armor', u: (typeof game.roster)[0], id: string) => {
      const cur = u.equipment[slot];
      return !cur || EQUIPMENT[cur].cost < EQUIPMENT[id].cost;
    };
    for (const slot of ['weapon', 'armor'] as const) {
      // most expensive first
      const ids = stock.equipment
        .filter((id) => EQUIPMENT[id].slot === slot)
        .sort((a, z) => EQUIPMENT[z].cost - EQUIPMENT[a].cost);
      for (const u of game.roster) {
        for (const id of ids) {
          const def = EQUIPMENT[id];
          if (def.jobs && !def.jobs.includes(u.job)) continue;
          if (def.cost > game.gold || !better(slot, u, id)) continue;
          if (buyEquipment(game, id)) {
            check(equipFromPool(game, u, id), `equip ${id} on ${u.name}`);
          }
          break;
        }
      }
    }
    for (const u of game.roster) {
      for (const abId of JOBS[u.job].abilityIds) {
        const ab = getAbility(abId);
        if (!(u.learned[u.job] ?? []).includes(abId) && u.jp >= ab.jpCost) {
          check(learnAbility(u, abId, ab.jpCost), `learn ${abId}`);
        }
      }
    }
  }

  check(campaignComplete(game), 'campaign completes');
  console.log(`\n— Final roster —`);
  for (const u of game.roster) {
    console.log(`  ${u.name}: Lv ${u.level} ${u.job}, ${u.jp} JP unspent, learned [${(u.learned[u.job] ?? []).join(', ')}]`);
  }
  console.log(`  Gold remaining: ${game.gold}`);
  console.log(failures === 0 ? '\n✓ SIMULATION PASSED' : `\n✗ ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SIMULATION CRASHED:', err);
  process.exit(2);
});
