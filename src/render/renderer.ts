import type { BattleState, Tile, Unit, XY } from '../entities/types';
import { JOBS } from '../data/jobs';
import { getMap } from '../data/maps';
import { maxStats } from '../entities/unit';
import { getImage, unitSprite, type Pose } from './assets';
import { floatTexts, fxSprites, syncView, viewFor } from './anim';

export const TILE_W = 64;
export const TILE_H = 32;
export const ELEV = 14;

const TEAM_COLOR: Record<string, string> = { player: '#3f8cff', enemy: '#e0463c', guest: '#3ec46d' };

export class Camera {
  x = 0; y = 0;            // screen-space offset of grid origin
  zoom = 1.35;
  rot = 0;                 // view rotation in clockwise quarter turns (0-3)
  private tween?: { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number };

  centerOn(canvas: HTMLCanvasElement, b: BattleState, tile: XY, smooth: boolean) {
    const v = viewOf(this.rot, b.w, b.h, tile.x, tile.y);
    const iso = isoOf(v.x, v.y, tileH(b, tile));
    const tx = canvas.clientWidth / 2 - iso.x * this.zoom;
    const ty = canvas.clientHeight / 2 - iso.y * this.zoom;
    if (!smooth) { this.x = tx; this.y = ty; return; }
    this.tween = { fx: this.x, fy: this.y, tx, ty, t0: performance.now(), dur: 360 };
  }

  pan(dx: number, dy: number) {
    this.tween = undefined;
    this.x += dx; this.y += dy;
  }

  /** Zoom by `factor`, keeping the point under (mx, my) fixed on screen. */
  zoomAt(mx: number, my: number, factor: number) {
    const z = Math.min(2.6, Math.max(0.7, this.zoom * factor));
    if (z === this.zoom) return;
    this.tween = undefined;
    this.x = mx - ((mx - this.x) * z) / this.zoom;
    this.y = my - ((my - this.y) * z) / this.zoom;
    this.zoom = z;
  }

  /** Rotate the view a quarter turn, keeping the screen-center point in place. */
  rotate(canvas: HTMLCanvasElement, b: BattleState, dir: 1 | -1) {
    const cw = canvas.clientWidth / 2, ch = canvas.clientHeight / 2;
    const px = (cw - this.x) / this.zoom, py = (ch - this.y) / this.zoom;
    const vx = (py / (TILE_H / 2) + px / (TILE_W / 2)) / 2;
    const vy = (py / (TILE_H / 2) - px / (TILE_W / 2)) / 2;
    const focus = worldOf(this.rot, b.w, b.h, vx, vy);
    this.rot = (this.rot + dir + 4) & 3;
    const v = viewOf(this.rot, b.w, b.h, focus.x, focus.y);
    const iso = isoOf(v.x, v.y, 0);
    this.tween = undefined;
    this.x = cw - iso.x * this.zoom;
    this.y = ch - iso.y * this.zoom;
  }

  update() {
    if (!this.tween) return;
    const t = (performance.now() - this.tween.t0) / this.tween.dur;
    if (t >= 1) {
      this.x = this.tween.tx; this.y = this.tween.ty;
      this.tween = undefined;
      return;
    }
    const k = 1 - Math.pow(1 - t, 3);
    this.x = this.tween.fx + (this.tween.tx - this.tween.fx) * k;
    this.y = this.tween.fy + (this.tween.ty - this.tween.fy) * k;
  }
}

function isoOf(x: number, y: number, h: number): XY {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - h * ELEV };
}

/** World grid coords -> rotated view coords (works for fractional positions). */
function viewOf(rot: number, w: number, h: number, x: number, y: number): XY {
  switch (rot & 3) {
    case 1: return { x: y, y: (w - 1) - x };
    case 2: return { x: (w - 1) - x, y: (h - 1) - y };
    case 3: return { x: (h - 1) - y, y: x };
    default: return { x, y };
  }
}

/** Rotated view coords -> world grid coords (inverse of viewOf). */
function worldOf(rot: number, w: number, h: number, vx: number, vy: number): XY {
  switch (rot & 3) {
    case 1: return { x: (w - 1) - vy, y: vx };
    case 2: return { x: (w - 1) - vx, y: (h - 1) - vy };
    case 3: return { x: vy, y: (h - 1) - vx };
    default: return { x: vx, y: vy };
  }
}

function tileH(b: BattleState, t: XY): number {
  return b.tiles[t.y]?.[t.x]?.h ?? 0;
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w = TILE_W, h = TILE_H) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

const TERRAIN_FALLBACK: Record<string, string> = {
  grass: '#5d8a4a', dirt: '#8a6f4d', stone: '#7d7f86', water: '#3f6ea8', sand: '#c2a86b',
};

export class Renderer {
  camera = new Camera();
  hover: XY | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  /** Iso position of a world-grid point under the current view rotation. */
  private vIso(b: BattleState, x: number, y: number, h: number): XY {
    const v = viewOf(this.camera.rot, b.w, b.h, x, y);
    return isoOf(v.x, v.y, h);
  }

  /** World direction vector -> rotated view direction vector. */
  private vDir(dx: number, dy: number): XY {
    switch (this.camera.rot & 3) {
      case 1: return { x: dy, y: -dx };
      case 2: return { x: -dx, y: -dy };
      case 3: return { x: -dy, y: dx };
      default: return { x: dx, y: dy };
    }
  }

  /** Convert a mouse position to a tile, honoring elevation (front tiles win). */
  pick(b: BattleState, mx: number, my: number): XY | null {
    const px = (mx - this.camera.x) / this.camera.zoom;
    const py = (my - this.camera.y) / this.camera.zoom;
    const rot = this.camera.rot;
    const order: { t: Tile; v: XY }[] = [];
    for (const row of b.tiles) for (const t of row) order.push({ t, v: viewOf(rot, b.w, b.h, t.x, t.y) });
    order.sort((a, z) => (z.v.x + z.v.y) - (a.v.x + a.v.y) || z.t.h - a.t.h);
    for (const { t, v } of order) {
      const iso = isoOf(v.x, v.y, t.h);
      const dx = Math.abs(px - iso.x) / (TILE_W / 2);
      const dy = Math.abs(py - iso.y) / (TILE_H / 2);
      if (dx + dy <= 1) return { x: t.x, y: t.y };
    }
    return null;
  }

  draw(b: BattleState) {
    const ctx = this.canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (this.canvas.width !== cw * dpr || this.canvas.height !== ch * dpr) {
      this.canvas.width = cw * dpr;
      this.canvas.height = ch * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    this.camera.update();
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    const now = performance.now();
    for (const u of b.units) syncView(u);

    const hl = collectHighlights(b);

    // draw tiles and occupants interleaved by view-space depth (vx + vy)
    const rot = this.camera.rot;
    const vw = (rot & 1) ? b.h : b.w;
    const vh = (rot & 1) ? b.w : b.h;
    const maxSum = vw + vh - 2;
    const vSum = (x: number, y: number) => { const v = viewOf(rot, b.w, b.h, x, y); return v.x + v.y; };
    const unitsBySum = new Map<number, Unit[]>();
    for (const u of b.units) {
      if (u.gone && viewFor(u).fade <= 0) continue;
      if (u.x < 0) continue;
      const v = viewFor(u);
      const s = Math.round(vSum(v.x, v.y));
      const arr = unitsBySum.get(s) ?? [];
      arr.push(u);
      unitsBySum.set(s, arr);
    }

    for (let s = 0; s <= maxSum; s++) {
      for (let vy = 0; vy < vh; vy++) {
        const vx = s - vy;
        if (vx < 0 || vx >= vw) continue;
        const wpt = worldOf(rot, b.w, b.h, vx, vy);
        this.drawTileBlock(ctx, b, b.tiles[wpt.y][wpt.x], hl, now);
      }
      for (let vy = 0; vy < vh; vy++) {
        const vx = s - vy;
        if (vx < 0 || vx >= vw) continue;
        const wpt = worldOf(rot, b.w, b.h, vx, vy);
        const t = b.tiles[wpt.y][wpt.x];
        if (t.prop) this.drawProp(ctx, b, t);
        if (t.treasure && !t.treasure.claimed) this.drawTreasure(ctx, b, t, now);
      }
      const units = unitsBySum.get(s) ?? [];
      units.sort((a, z) => vSum(viewFor(a).x, viewFor(a).y) - vSum(viewFor(z).x, viewFor(z).y));
      for (const u of units) this.drawUnit(ctx, b, u, now);
    }

    this.drawFx(ctx, b, now);
    this.drawFloatTexts(ctx, b, now);
    ctx.restore();
  }

  private drawTileBlock(ctx: CanvasRenderingContext2D, b: BattleState, t: Tile, hl: HighlightMap, now: number) {
    const { x: cx, y: cy } = this.vIso(b, t.x, t.y, t.h);
    const env = getMap(b.mapId).envKey;

    // cliff faces down to the screen-down neighbors (or a base at map edges);
    // under rotation those are the +x/+y neighbors in *view* space
    const rot = this.camera.rot;
    const v = viewOf(rot, b.w, b.h, t.x, t.y);
    const nDR = worldOf(rot, b.w, b.h, v.x + 1, v.y);
    const nDL = worldOf(rot, b.w, b.h, v.x, v.y + 1);
    const faceDR = b.tiles[nDR.y]?.[nDR.x];
    const faceDL = b.tiles[nDL.y]?.[nDL.x];
    const baseH = -1; // map edges drop one extra step
    const drDrop = (faceDR ? t.h - faceDR.h : t.h - baseH);
    const dlDrop = (faceDL ? t.h - faceDL.h : t.h - baseH);
    const cliffImg = getImage('terr_cliff');
    if (drDrop > 0) this.drawFace(ctx, cx, cy, drDrop * ELEV, 'right', cliffImg);
    if (dlDrop > 0) this.drawFace(ctx, cx, cy, dlDrop * ELEV, 'left', cliffImg);

    // top face — sample one of 4 texture quadrants per tile to break up repetition
    const img = getImage(`terr_${t.terrain}`);
    if (img) {
      const hash = (t.x * 7 + t.y * 13 + t.x * t.y) & 3;
      const sx = (hash & 1) * (img.width / 2);
      const sy = (hash >> 1) * (img.height / 2);
      ctx.save();
      diamondPath(ctx, cx, cy);
      ctx.clip();
      ctx.transform(TILE_W / 2, TILE_H / 2, -TILE_W / 2, TILE_H / 2, cx, cy - TILE_H / 2);
      ctx.drawImage(img, sx, sy, img.width / 2, img.height / 2, 0, 0, 1, 1);
      ctx.restore();
      if (t.terrain === 'water') {
        ctx.save();
        diamondPath(ctx, cx, cy);
        ctx.fillStyle = `rgba(120, 180, 255, ${0.12 + 0.08 * Math.sin(now / 600 + t.x + t.y)})`;
        ctx.fill();
        ctx.restore();
      }
    } else {
      diamondPath(ctx, cx, cy);
      ctx.fillStyle = TERRAIN_FALLBACK[t.terrain] ?? '#666';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.stroke();
    }

    // checkerboard tint on stone, echoing the paper-diorama floor
    if (t.terrain === 'stone' && ((t.x + t.y) & 1) === 1) {
      diamondPath(ctx, cx, cy);
      ctx.fillStyle = 'rgba(139, 102, 60, 0.38)';
      ctx.fill();
    }

    // subtle grid line — warm ink on paper
    diamondPath(ctx, cx, cy);
    ctx.strokeStyle = 'rgba(95, 75, 48, 0.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // highlights
    const k = `${t.x},${t.y}`;
    const h = hl.get(k);
    if (h) {
      diamondPath(ctx, cx, cy);
      ctx.fillStyle = h.fill;
      ctx.fill();
      if (h.stroke) {
        ctx.strokeStyle = h.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (this.hover && this.hover.x === t.x && this.hover.y === t.y) {
      diamondPath(ctx, cx, cy);
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  private drawFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, drop: number, side: 'left' | 'right', img?: HTMLImageElement) {
    ctx.save();
    if (img) {
      // map the face parallelogram: u runs along the tile edge, v straight down
      if (side === 'right') ctx.transform(TILE_W / 2, -TILE_H / 2, 0, drop, cx, cy + TILE_H / 2);
      else ctx.transform(-TILE_W / 2, -TILE_H / 2, 0, drop, cx, cy + TILE_H / 2);
      // source height proportional to the drop so the rock strata aren't squashed
      const srcH = Math.min(img.height, (img.height * drop) / 96);
      ctx.drawImage(img, 0, 0, img.width, srcH, 0, -0.001, 1, 1);
      ctx.globalAlpha = side === 'right' ? 0.25 : 0.45;
      ctx.fillStyle = '#0c0a14';
      ctx.fillRect(0, -0.001, 1, 1.001);
    } else {
      ctx.beginPath();
      if (side === 'right') {
        ctx.moveTo(cx, cy + TILE_H / 2);
        ctx.lineTo(cx + TILE_W / 2, cy);
        ctx.lineTo(cx + TILE_W / 2, cy + drop);
        ctx.lineTo(cx, cy + TILE_H / 2 + drop);
      } else {
        ctx.moveTo(cx - TILE_W / 2, cy);
        ctx.lineTo(cx, cy + TILE_H / 2);
        ctx.lineTo(cx, cy + TILE_H / 2 + drop);
        ctx.lineTo(cx - TILE_W / 2, cy + drop);
      }
      ctx.closePath();
      ctx.fillStyle = side === 'right' ? '#b59a72' : '#9a8059';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProp(ctx: CanvasRenderingContext2D, b: BattleState, t: Tile) {
    const { x: cx, y: cy } = this.vIso(b, t.x, t.y, t.h);
    const img = getImage(`prop_${t.prop}`);
    if (img) {
      const w = t.prop === 'tree' ? 84 : 56;
      const h = (img.height / img.width) * w;
      ctx.drawImage(img, cx - w / 2, cy - h + TILE_H * 0.3, w, h);
    } else {
      ctx.fillStyle = t.prop === 'tree' ? '#2e5d34' : t.prop === 'crate' ? '#8a6336' : '#6d6a75';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 14, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTreasure(ctx: CanvasRenderingContext2D, b: BattleState, t: Tile, now: number) {
    const { x: cx, y: cy } = this.vIso(b, t.x, t.y, t.h);
    const pulse = 0.6 + 0.4 * Math.sin(now / 300);
    ctx.save();
    ctx.fillStyle = `rgba(200, 144, 26, ${0.55 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8721a';
    ctx.font = 'bold 13px serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', cx, cy - 4 - pulse * 3);
    ctx.restore();
  }

  private drawUnit(ctx: CanvasRenderingContext2D, b: BattleState, u: Unit, now: number) {
    const v = viewFor(u);
    const hx = Math.round(v.x), hy = Math.round(v.y);
    const h = b.tiles[hy]?.[hx]?.h ?? 0;
    // interpolate height between tiles while walking
    const fx2 = Math.floor(v.x), fy2 = Math.floor(v.y);
    const h2 = b.tiles[Math.ceil(v.y)]?.[Math.ceil(v.x)]?.h ?? h;
    const hMix = (b.tiles[fy2]?.[fx2]?.h ?? h) * 0.5 + h2 * 0.5;
    const iso = this.vIso(b, v.x, v.y, hMix);
    const cx = iso.x, cy = iso.y - v.lift;

    ctx.save();
    if (v.fade < 1) ctx.globalAlpha = Math.max(0, v.fade);

    // team ring
    const active = b.activeUnitId === u.id;
    ctx.strokeStyle = TEAM_COLOR[u.team] ?? '#999';
    ctx.lineWidth = active ? 3 : 2;
    if (active) ctx.strokeStyle = '#ffd76a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, TILE_W * 0.32, TILE_H * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `${TEAM_COLOR[u.team]}33`;
    ctx.fill();

    const pose: Pose = u.ko ? 'ko' : v.pose;
    const img = unitSprite(u.job, pose);
    const wd = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[u.facing];
    const vd = this.vDir(wd[0], wd[1]);
    const flip = vd.x + vd.y < 0;
    if (img) {
      const w = 58;
      const hh = (img.height / img.width) * w;
      ctx.save();
      ctx.translate(cx, cy + 6);
      if (flip) ctx.scale(-1, 1);
      if (u.ko) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.85);
      ctx.drawImage(img, -w / 2, -hh, w, hh);
      // enemy marking: dark red tint overlay
      if (u.team === 'enemy') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(190, 30, 30, 0.16)';
        ctx.fillRect(-w / 2, -hh, w, hh);
      }
      if (v.flash > now) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(255, 70, 70, ${0.5 * ((v.flash - now) / 360)})`;
        ctx.fillRect(-w / 2, -hh, w, hh);
      }
      ctx.restore();
    } else {
      // fallback figure
      const col = JOBS[u.job].color;
      ctx.fillStyle = col;
      ctx.beginPath();
      if (u.ko) ctx.ellipse(cx, cy - 4, 16, 8, 0, 0, Math.PI * 2);
      else ctx.ellipse(cx, cy - 18, 11, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(JOBS[u.job].name[0], cx, u.ko ? cy - 1 : cy - 14);
      if (v.flash > now) {
        ctx.fillStyle = `rgba(255,70,70,0.5)`;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 18, 13, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // facing indicator: small wedge on the tile edge (rotates with the view)
    if (!u.ko) {
      const dir = [0.5 * (vd.x - vd.y), 0.25 * (vd.x + vd.y)];
      ctx.fillStyle = active ? '#ffd76a' : 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(cx + dir[0] * TILE_W * 0.42, cy + dir[1] * TILE_H * 0.84, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // HP bar
    if (!u.gone) {
      const s = maxStats(u);
      const pct = Math.max(0, u.hp / s.hp);
      const bw = 30;
      const spriteH = 44;
      ctx.fillStyle = 'rgba(8,8,14,0.75)';
      ctx.fillRect(cx - bw / 2 - 1, cy - spriteH - 9, bw + 2, 5);
      ctx.fillStyle = pct > 0.5 ? '#62d26f' : pct > 0.25 ? '#e8c14a' : '#e0463c';
      ctx.fillRect(cx - bw / 2, cy - spriteH - 8, bw * pct, 3);
      // KO countdown
      if (u.ko && u.koCounter > 0) {
        ctx.fillStyle = '#b894ff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${u.koCounter}`, cx, cy - spriteH - 14);
      }
      // status pips
      let px = cx - 12;
      for (const st of u.statuses.slice(0, 5)) {
        ctx.fillStyle = st.id === 'poison' ? '#7fbf3f' : st.id === 'atkUp' ? '#ff9d4a'
          : st.id === 'protect' ? '#6db4ff' : st.id === 'haste' ? '#ffe34a'
          : st.id === 'slow' ? '#9b8bb5' : '#ff5b5b';
        ctx.beginPath();
        ctx.arc(px, cy - spriteH - 13, 2.5, 0, Math.PI * 2);
        ctx.fill();
        px += 6;
      }
    }
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D, b: BattleState, now: number) {
    for (let i = fxSprites.length - 1; i >= 0; i--) {
      const fx = fxSprites[i];
      const t = (now - fx.t0) / fx.dur;
      if (t >= 1) { fxSprites.splice(i, 1); continue; }
      if (t < 0) continue;
      const h = tileH(b, fx.tile);
      const iso = this.vIso(b, fx.tile.x, fx.tile.y, h);
      const img = getImage(fx.key);
      ctx.save();
      const ease = 1 - Math.pow(1 - t, 2);
      let alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      let yOff = -20;
      let scale = 0.7 + ease * 0.5;
      if (fx.mode === 'rise') yOff = -14 - ease * 26;
      if (fx.mode === 'fall') { yOff = -64 + ease * 44; alpha = Math.min(1, alpha * 1.4); }
      ctx.globalAlpha = Math.max(0, alpha);
      if (img) {
        // FX are transparent paper-cut sprites; draw normally
        const w = 72 * scale;
        const hh = (img.height / img.width) * w;
        ctx.drawImage(img, iso.x - w / 2, iso.y + yOff - hh / 2, w, hh);
      } else {
        ctx.fillStyle = fx.key === 'fx_heal' || fx.key === 'fx_revive' ? '#9be77f'
          : fx.key === 'fx_fire' ? '#ff8c3a' : fx.key === 'fx_poison' ? '#86c43f' : '#ffd9a0';
        ctx.beginPath();
        ctx.arc(iso.x, iso.y + yOff, 14 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFloatTexts(ctx: CanvasRenderingContext2D, b: BattleState, now: number) {
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      const t = (now - ft.t0) / ft.dur;
      if (t >= 1) { floatTexts.splice(i, 1); continue; }
      if (t < 0) continue;
      const h = tileH(b, ft.tile);
      const iso = this.vIso(b, ft.tile.x, ft.tile.y, h);
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = 'bold 16px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(10,8,16,0.9)';
      ctx.lineWidth = 3;
      const y = iso.y - 48 - t * 26;
      ctx.strokeText(ft.text, iso.x, y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, iso.x, y);
      ctx.restore();
    }
  }
}

interface Highlight { fill: string; stroke?: string; }
type HighlightMap = Map<string, Highlight>;

function collectHighlights(b: BattleState): HighlightMap {
  const map: HighlightMap = new Map();
  const put = (x: number, y: number, h: Highlight) => map.set(`${x},${y}`, h);

  if (b.phase === 'deploy') {
    for (const t of getMap(b.mapId).deployTiles) {
      put(t.x, t.y, { fill: 'rgba(80, 160, 255, 0.30)', stroke: 'rgba(140, 200, 255, 0.8)' });
    }
    return map;
  }
  if (b.ui.reachable && b.ui.mode === 'move') {
    for (const [k, e] of Object.entries(b.ui.reachable)) {
      if (!e.canStop) continue;
      const [x, y] = k.split(',').map(Number);
      put(x, y, { fill: 'rgba(70, 140, 255, 0.32)' });
    }
  }
  if (b.ui.targetable && b.ui.mode === 'target') {
    for (const t of b.ui.targetable) {
      put(t.x, t.y, { fill: 'rgba(255, 90, 70, 0.30)' });
    }
  }
  if (b.ui.aoePreview && (b.ui.mode === 'target' || b.ui.mode === 'confirm')) {
    for (const t of b.ui.aoePreview) {
      put(t.x, t.y, { fill: 'rgba(255, 160, 40, 0.45)', stroke: 'rgba(255, 200, 120, 0.9)' });
    }
  }
  if (b.ui.pathPreview && b.ui.mode === 'move') {
    for (const t of b.ui.pathPreview) {
      put(t.x, t.y, { fill: 'rgba(140, 200, 255, 0.5)' });
    }
  }
  // pending casts: show where delayed spells will land
  for (const c of b.pendingCasts) {
    for (const t of c.tiles) {
      put(t.x, t.y, { fill: 'rgba(190, 80, 255, 0.22)', stroke: 'rgba(210, 130, 255, 0.5)' });
    }
  }
  return map;
}
