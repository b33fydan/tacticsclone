// Animation state for the canvas renderer + the AnimHooks implementation that
// the battle controller drives. The simulation never reads from here.
import type { AbilityDef, Unit, XY } from '../entities/types';
import type { CombatEvent } from '../systems/combat';
import type { AnimHooks } from '../systems/battle';
import type { Pose } from './assets';
import { facingBetween } from '../systems/grid';

export interface UnitView {
  x: number; y: number;        // float tile coords while animating
  lift: number;                // extra vertical offset (jumps)
  pose: Pose;
  poseUntil: number;           // ms timestamp when transient pose expires
  flash: number;               // hit-flash end timestamp
  fade: number;                // 1 = visible, towards 0 when crystallizing
}

export interface FloatText {
  tile: XY; text: string; color: string; t0: number; dur: number;
}

export interface FxSprite {
  key: string; tile: XY; t0: number; dur: number; mode: 'burst' | 'rise' | 'fall';
}

const unitViews = new Map<string, UnitView>();
export const floatTexts: FloatText[] = [];
export const fxSprites: FxSprite[] = [];

export function viewFor(u: Unit): UnitView {
  let v = unitViews.get(u.id);
  if (!v) {
    v = { x: u.x, y: u.y, lift: 0, pose: 'idle', poseUntil: 0, flash: 0, fade: 1 };
    unitViews.set(u.id, v);
  }
  return v;
}

export function syncView(u: Unit) {
  const v = viewFor(u);
  const now = performance.now();
  if (!walking.has(u.id)) { v.x = u.x; v.y = u.y; v.lift = 0; }
  if (u.ko) v.pose = 'ko';
  else if (now > v.poseUntil && v.pose !== 'walk') v.pose = 'idle';
  v.fade = u.gone ? Math.max(0, v.fade) : 1;
}

export function resetViews() {
  unitViews.clear();
  floatTexts.length = 0;
  fxSprites.length = 0;
}

const walking = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function eventColor(ev: CombatEvent): string {
  if (ev.miss) return '#cfd2da';
  if (ev.revived) return '#ffe9a8';
  if (ev.heal !== undefined) return '#7be37b';
  return '#ff7a6b';
}

function eventText(ev: CombatEvent): string {
  if (ev.miss) return 'MISS';
  if (ev.heal !== undefined) return `+${ev.heal}`;
  if (ev.damage !== undefined) return `${ev.damage}`;
  if (ev.status) return ev.status.toUpperCase();
  return '';
}

function fxKeyFor(ability: AbilityDef | null, itemKind?: string): string {
  if (itemKind === 'poison') return 'fx_poison';
  if (itemKind === 'heal' || itemKind === 'mp') return 'fx_heal';
  if (itemKind === 'revive') return 'fx_revive';
  if (itemKind === 'cure') return 'fx_buff';
  if (!ability) return 'fx_impact';
  switch (ability.type) {
    case 'magic': return 'fx_fire';
    case 'heal': return 'fx_heal';
    case 'buff': return 'fx_buff';
    case 'revive': return 'fx_revive';
    default:
      if (ability.id === 'envenom') return 'fx_poison';
      if (ability.job === 'skywarden' || (ability.id === 'attack' && ability.rangeMax > 1)) return 'fx_arrow';
      return 'fx_slash';
  }
}

/** Build the AnimHooks implementation used in the browser. */
export function makeAnimHooks(opts: {
  onChange: () => void;
  focusTile: (t: XY, smooth: boolean) => Promise<void>;
  setBanner: (text: string | undefined) => void;
}): AnimHooks {
  return {
    onChange: opts.onChange,
    delay: sleep,

    async focusUnit(u) {
      await opts.focusTile({ x: u.x, y: u.y }, true);
    },

    async unitWalk(u, path) {
      if (path.length < 2) return;
      const v = viewFor(u);
      walking.add(u.id);
      v.pose = 'walk';
      try {
        const stepMs = 150;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          u.facing = facingBetween(a, b);
          const t0 = performance.now();
          while (true) {
            const t = (performance.now() - t0) / stepMs;
            if (t >= 1) break;
            v.x = a.x + (b.x - a.x) * t;
            v.y = a.y + (b.y - a.y) * t;
            v.lift = Math.sin(Math.min(1, t) * Math.PI) * 3;
            await sleep(16);
          }
          v.x = b.x; v.y = b.y; v.lift = 0;
        }
      } finally {
        walking.delete(u.id);
        v.pose = 'idle';
        v.poseUntil = 0;
      }
    },

    async unitLunge(u, toward) {
      const v = viewFor(u);
      v.pose = 'attack';
      v.poseUntil = performance.now() + 450;
      const dx = Math.sign(toward.x - u.x) * 0.25;
      const dy = Math.sign(toward.y - u.y) * 0.25;
      const t0 = performance.now();
      const dur = 220;
      while (true) {
        const t = (performance.now() - t0) / dur;
        if (t >= 1) break;
        const k = Math.sin(Math.min(1, t) * Math.PI);
        v.x = u.x + dx * k;
        v.y = u.y + dy * k;
        await sleep(16);
      }
      v.x = u.x; v.y = u.y;
    },

    async castFlash(u, _ability) {
      const v = viewFor(u);
      v.pose = 'cast';
      v.poseUntil = performance.now() + 600;
      fxSprites.push({ key: 'fx_buff', tile: { x: u.x, y: u.y }, t0: performance.now(), dur: 500, mode: 'rise' });
      await sleep(420);
    },

    async abilityFx(ability, tiles, events, itemKind) {
      const key = fxKeyFor(ability, itemKind);
      const now = performance.now();
      const shown = new Set<string>();
      for (const t of tiles.slice(0, 13)) {
        const k = `${t.x},${t.y}`;
        if (shown.has(k)) continue;
        shown.add(k);
        fxSprites.push({
          key, tile: t, t0: now + Math.random() * 90, dur: 520,
          mode: key === 'fx_arrow' ? 'fall' : key === 'fx_heal' || key === 'fx_buff' || key === 'fx_revive' ? 'rise' : 'burst',
        });
      }
      for (const ev of events) {
        floatTexts.push({ tile: ev.tile, text: eventText(ev), color: eventColor(ev), t0: now + 200, dur: 950 });
        if (ev.damage !== undefined && !ev.miss) {
          // hit flash on the victim
          const view = unitViews.get(ev.targetId);
          if (view) view.flash = now + 360;
        }
        if (ev.koed) {
          floatTexts.push({ tile: ev.tile, text: 'KO', color: '#b894ff', t0: now + 650, dur: 900 });
        }
      }
      opts.onChange();
      await sleep(620);
    },

    async koFade(u) {
      const v = viewFor(u);
      fxSprites.push({ key: 'fx_ko', tile: { x: u.x, y: u.y }, t0: performance.now(), dur: 900, mode: 'rise' });
      const t0 = performance.now();
      const dur = 800;
      while (true) {
        const t = (performance.now() - t0) / dur;
        if (t >= 1) break;
        v.fade = 1 - t;
        await sleep(16);
      }
      v.fade = 0;
    },

    async banner(text, ms) {
      opts.setBanner(text);
      opts.onChange();
      await sleep(ms);
      opts.setBanner(undefined);
      opts.onChange();
    },
  };
}
