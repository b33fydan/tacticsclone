# Emberveil Tactics

An original 2D browser tactical RPG prototype in the tradition of classic grid-based
tactics games. Lead the Daybreak Company through a five-battle campaign across the
realm of Veyra and bring down the Ashmark Legion.

Built with **TypeScript + React + Vite + HTML5 Canvas**. All visual assets are
AI-generated and integrated at runtime.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5199
```

Other commands:

```bash
npm run build      # type-check + production build
npm run simulate   # headless AI-vs-AI campaign validation (data checks + all 5 battles)
```

## The game

- **Campaign** — 5 connected battles: a river crossing (rout), a cliff assault
  (kill the leader), drowned ruins (protect the scholar; treasure caches), a
  desperate holdout (survive 8 rounds), and the final fortress (kill the warlord).
  Losing never soft-locks: retry or withdraw freely.
- **CT turn order** — units charge CT by speed; act at 100. Waiting costs less than
  moving + acting. The forecast bar shows upcoming turns, round markers, and
  charging spells.
- **Move + Act + Facing** — move and act in either order, undo the move before
  committing, choose final facing. Side attacks hit more often than front; back
  attacks most of all. High ground grants damage and accuracy bonuses.
- **5 original jobs** — Bulwark (tank), Skywarden (archer), Embercaller (mage),
  Dawnmender (healer), Duskblade (assassin). Each has a passive, a distinct stat
  line, and 3–4 learnable abilities with ranges and AoE shapes (bursts, lines,
  charged storms with delayed resolution).
- **Progression** — EXP/levels, JP-bought abilities, gold, a tiered shop,
  weapon/armor/accessory slots applied live, usable battle items, job changes
  between battles.
- **KO rules** — downed units count down 3 of their own turns; revive them with a
  Lifebloom or Second Dawn before they're lost for the battle.
- **Enemy AI** — plays by the player's exact rules: healers heal, archers seek high
  ground, assassins hunt backs, wounded units retreat. Three difficulty levels.

## Controls

Mouse-first: click to select/move/target, drag to pan the camera, right-click or
Esc to cancel, hover to inspect any unit or tile. Arrow keys also pan.

## Architecture

```
src/
  data/      jobs, abilities, items, maps, campaign — all data-driven
  entities/  shared types, unit stat math
  systems/   grid/pathfinding, CT turn order, combat resolution, battle controller
  ai/        enemy planner (shared by headless simulation)
  render/    canvas isometric renderer, animation/VFX, asset manifest + loader
  ui/        React screens and HUD (title, campaign, party, shop, battle)
  store/     minimal useSyncExternalStore store
scripts/
  simulate.ts  headless AI-vs-AI campaign run used as an integration test
```

Simulation logic is fully separated from rendering — the same battle code drives
the browser game and the headless validation run.
