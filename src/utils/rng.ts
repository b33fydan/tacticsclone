// Seedable RNG (mulberry32) so headless simulations are reproducible.
let state = 0xC0FFEE ^ 0x9E3779B9;

export function seedRng(seed: number) {
  state = seed >>> 0;
}

export function rand(): number {
  state |= 0; state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function roll(chance: number): boolean {
  return rand() * 100 < chance;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
