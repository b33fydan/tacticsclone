import { useEffect, useRef, useState } from 'react';
import { bump, game, useGame } from '../store/store';
import { getMap } from '../data/maps';
import { JOBS } from '../data/jobs';
import { Renderer } from '../render/renderer';
import { makeAnimHooks, resetViews } from '../render/anim';
import {
  placeUnit, removeDeployed, resetAnimHooks, setAnimHooks, startCombat,
  uiCancel, uiClickMove, uiClickTarget, uiHoverTile,
} from '../systems/battle';
import { unitAt } from '../systems/grid';
import {
  ActionPanel, BattleLog, ObjectivePanel, ResultsOverlay, TurnOrderBar, UnitPanel,
} from './hud';

export default function BattleScreen() {
  useGame();
  const b = game.battle;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [deploySel, setDeploySel] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean; panning: boolean }>({ x: 0, y: 0, moved: false, panning: false });
  const hoverKeyRef = useRef<string>('');

  // renderer lifecycle + anim hooks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !game.battle) return;
    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    if (import.meta.env.DEV) (window as any).__renderer = renderer;
    resetViews();
    renderer.camera.centerOn(canvas, game.battle, { x: Math.floor(game.battle.w / 2), y: Math.floor(game.battle.h / 2) }, false);

    setAnimHooks(makeAnimHooks({
      onChange: bump,
      focusTile: async (t, smooth) => {
        if (canvasRef.current && game.battle) {
          renderer.camera.centerOn(canvasRef.current, game.battle, t, smooth);
        }
        await new Promise((r) => setTimeout(r, smooth ? 300 : 0));
      },
      setBanner: (text) => {
        if (game.battle) game.battle.ui.banner = text;
      },
    }));

    let raf = 0;
    const loop = () => {
      if (game.battle) {
        renderer.hover = game.battle.ui.hoverTile ?? null;
        renderer.draw(game.battle);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (!game.battle) return;
      if (e.key === 'Escape') { uiCancel(game); }
      const pan = 46;
      if (e.key === 'ArrowUp') renderer.camera.pan(0, pan);
      if (e.key === 'ArrowDown') renderer.camera.pan(0, -pan);
      if (e.key === 'ArrowLeft') renderer.camera.pan(pan, 0);
      if (e.key === 'ArrowRight') renderer.camera.pan(-pan, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      resetAnimHooks();
      rendererRef.current = null;
    };
  }, [b ? b.mapId + b.phase.replace('victory', 'x').replace('defeat', 'x') : 'none']);

  if (!b) return null;

  const mapDef = getMap(b.mapId);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false, panning: e.button !== 2 };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const renderer = rendererRef.current;
    if (!renderer || !game.battle) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    if (e.buttons & 1 && dragRef.current.panning) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        dragRef.current.moved = true;
        renderer.camera.pan(dx, dy);
        dragRef.current.x = e.clientX;
        dragRef.current.y = e.clientY;
      }
      return;
    }
    const tile = renderer.pick(game.battle, e.clientX - rect.left, e.clientY - rect.top);
    const k = tile ? `${tile.x},${tile.y}` : '';
    if (k !== hoverKeyRef.current) {
      hoverKeyRef.current = k;
      uiHoverTile(game, tile);
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) return;
    if (dragRef.current.moved) return;
    const renderer = rendererRef.current;
    if (!renderer || !game.battle) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const tile = renderer.pick(game.battle, e.clientX - rect.left, e.clientY - rect.top);
    if (!tile) return;
    const bb = game.battle;

    if (bb.phase === 'deploy') {
      const isDeployTile = mapDef.deployTiles.some((t) => t.x === tile.x && t.y === tile.y);
      const occupant = unitAt(bb, tile.x, tile.y);
      if (occupant && occupant.team === 'player') {
        removeDeployed(game, occupant.id);
        setDeploySel(occupant.id);
        return;
      }
      if (isDeployTile && deploySel) {
        placeUnit(game, deploySel, tile);
        return;
      }
      return;
    }

    if (bb.ui.mode === 'move') { void uiClickMove(game, tile); return; }
    if (bb.ui.mode === 'target') { uiClickTarget(game, tile); return; }
  };

  return (
    <div className="battle-screen">
      <canvas
        ref={canvasRef}
        className="battle-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={(e) => { e.preventDefault(); uiCancel(game); }}
      />

      <ObjectivePanel b={b} />
      {b.phase !== 'deploy' && <TurnOrderBar b={b} />}
      <UnitPanel b={b} />
      <ActionPanel b={b} />
      {b.phase === 'combat' && <BattleLog b={b} />}
      {b.ui.aiActing && <div className="panel ai-indicator">Enemy is moving…</div>}
      {b.ui.banner && <div className="banner-text">{b.ui.banner}</div>}

      {b.phase === 'deploy' && (
        <DeployBar deploySel={deploySel} setDeploySel={setDeploySel} />
      )}
      <ResultsOverlay b={b} />
      {b.phase === 'combat' && (
        <div className="kbd-hint">Left-click: select · Drag: pan camera · Right-click / Esc: cancel · Hover: inspect</div>
      )}
    </div>
  );
}

function DeployBar({ deploySel, setDeploySel }: { deploySel: string | null; setDeploySel: (id: string | null) => void }) {
  useGame();
  const b = game.battle!;
  const mapDef = getMap(b.mapId);
  return (
    <div className="panel hud deploy-bar">
      <div className="deploy-hint">
        {mapDef.blurb}
      </div>
      <div className="deploy-hint" style={{ color: 'var(--gold)' }}>
        Deploy up to {mapDef.maxDeploy} units — select a soldier, then click a glowing tile ({b.deployChoice.length}/{mapDef.maxDeploy} placed)
      </div>
      {game.roster.map((u) => {
        const placed = b.deployChoice.includes(u.id);
        return (
          <button
            key={u.id}
            className={`deploy-chip ${deploySel === u.id ? 'selected' : ''} ${placed ? 'placed' : ''}`}
            onClick={() => setDeploySel(deploySel === u.id ? null : u.id)}
          >
            <b>{u.name}</b>
            <small>Lv {u.level} {JOBS[u.job].name}{placed ? ' ✓' : ''}</small>
          </button>
        );
      })}
      <button
        className="primary"
        disabled={b.deployChoice.length === 0}
        onClick={() => { void startCombat(game); }}
      >
        Begin Battle
      </button>
    </div>
  );
}
