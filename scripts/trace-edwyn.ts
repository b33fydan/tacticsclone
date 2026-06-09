// Instrumented headless run of the campaign up to & through the ruins battle.
// Guest turns happen inside progress(), so we snapshot Edwyn's position after
// every player-turn step and log movements + nearest-enemy distance.
import { CAMPAIGN } from '../src/data/campaign';
import { getMap } from '../src/data/maps';
import { newGameState, startNewRun, enterBattle, leaveBattle, retryBattle } from '../src/game/flow';
import { placeUnit, startCombat, autoPlayTurn, setAnimHooks } from '../src/systems/battle';
import { seedRng } from '../src/utils/rng';
import { manhattan } from '../src/systems/grid';

async function playBattle(game: ReturnType<typeof newGameState>, mapId: string, trace: boolean): Promise<boolean> {
  const def = getMap(mapId);
  enterBattle(game, mapId);
  const b = game.battle!;
  game.roster.slice(0, def.maxDeploy).forEach((u, i) => placeUnit(game, u.id, def.deployTiles[i]));

  let last = '';
  const snap = () => {
    if (!trace) return;
    const edwyn = b.units.find((u) => u.team === 'guest');
    if (!edwyn) return;
    const foes = b.units.filter((o) => !o.gone && !o.ko && o.team === 'enemy');
    const d = foes.length ? Math.min(...foes.map((o) => manhattan(edwyn, o))) : 99;
    const players = b.units.filter((o) => o.team === 'player').map((p) => `${p.name[0]}:${p.x},${p.y},hp${p.hp}${p.ko ? 'KO' : ''}`).join(' ');
    const cur = `round ${b.round} EDWYN (${edwyn.x},${edwyn.y}) dFoe=${d} hp=${edwyn.hp}${edwyn.ko ? ' KO' : ''}${edwyn.gone ? ' GONE' : ''}`;
    if (cur !== last) { console.log(cur + `  | ${players}`); last = cur; }
  };

  // wrap onChange to snapshot continuously (covers guest turns inside progress);
  // unitWalk must replicate the immediate-hooks movement behavior.
  setAnimHooks({
    onChange: () => { snap(); },
    delay: async () => {},
    focusUnit: async () => {},
    unitWalk: async (u, path) => {
      const lastTile = path[path.length - 1];
      if (lastTile) { u.x = lastTile.x; u.y = lastTile.y; }
      snap();
    },
    unitLunge: async () => {},
    castFlash: async () => {},
    abilityFx: async () => { snap(); },
    koFade: async () => { snap(); },
    banner: async () => {},
  });

  await startCombat(game);
  let guard = 0;
  while (game.battle!.phase === 'combat' && guard++ < 1200) {
    await autoPlayTurn(game);
  }
  if (trace) {
    const edwyn = b.units.find((u) => u.team === 'guest');
    console.log(`ruins result: ${game.battle!.phase}, round ${b.round}; Edwyn hp=${edwyn?.hp} ko=${edwyn?.ko} gone=${edwyn?.gone}`);
    // print Edwyn-related battle log lines
    for (const line of b.log) {
      if (line.includes('Edwyn')) console.log('  LOG: ' + line);
    }
  }
  return game.battle!.phase === 'victory';
}

async function main() {
  seedRng(20260609);
  const game = newGameState();
  startNewRun(game, 'normal');
  for (const node of CAMPAIGN) {
    const isRuins = node.mapId === 'ruins';
    let won = false;
    for (let attempt = 1; attempt <= 6 && !won; attempt++) {
      if (attempt === 1) {
        won = await playBattle(game, node.mapId, isRuins);
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
      if (isRuins) console.log(`ruins attempt ${attempt}: ${game.battle!.phase}`);
    }
    leaveBattle(game);
    if (isRuins) break;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
