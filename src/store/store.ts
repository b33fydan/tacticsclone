import { useSyncExternalStore } from 'react';
import type { GameState } from '../entities/types';
import { newGameState } from '../game/flow';

// Single mutable game state; React re-renders via a version counter.
export const game: GameState = newGameState();

let version = 0;
const listeners = new Set<() => void>();

export function bump() {
  version++;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Re-render the calling component whenever the game state changes. */
export function useGame(): GameState {
  useSyncExternalStore(subscribe, () => version, () => version);
  return game;
}

// Dev-only hook for tests/automation.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  import('../systems/battle').then((battle) => {
    (window as any).__ev = { game, bump, autoPlayTurn: battle.autoPlayTurn };
  });
}
