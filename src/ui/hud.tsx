import { bump, game, useGame } from '../store/store';
import { getMap } from '../data/maps';
import { JOBS } from '../data/jobs';
import { getAbility } from '../data/abilities';
import { getConsumable } from '../data/items';
import { effectiveStats } from '../systems/combat';
import { maxStats } from '../entities/unit';
import { forecastTurnOrder } from '../systems/turnorder';
import { tileAt, unitAt } from '../systems/grid';
import {
  playerAbilityList, uiBeginWait, uiCancel, uiConfirmAction, uiEnterActions,
  uiEnterItems, uiEnterMove, uiPickFacing, uiSelectAbility, uiSelectItem, uiUndoMove,
} from '../systems/battle';
import { leaveBattle, retryBattle } from '../game/flow';
import { MANIFEST } from '../render/assets';
import type { BattleState, Facing, Unit } from '../entities/types';

function Portrait({ job, className }: { job: string; className?: string }) {
  const src = MANIFEST[`portrait_${job}`];
  return <img className={className} src={src} alt={job} style={{ background: JOBS[job as keyof typeof JOBS]?.color }} />;
}

export function ObjectivePanel({ b }: { b: BattleState }) {
  const def = getMap(b.mapId);
  const unclaimed = b.tiles.flat().filter((t) => t.treasure && !t.treasure.claimed).length;
  return (
    <div className="panel hud objective-panel">
      <b>{def.name}</b>
      {def.objective.text}
      <div className="round-line">
        Round {b.round}
        {def.objective.type === 'survive' && def.objective.rounds ? ` / ${def.objective.rounds}` : ''}
        {unclaimed > 0 && <span style={{ color: 'var(--gold)' }}> · ✦ {unclaimed} cache{unclaimed > 1 ? 's' : ''} on the field</span>}
      </div>
    </div>
  );
}

export function TurnOrderBar({ b }: { b: BattleState }) {
  const entries = forecastTurnOrder(b, 9);
  return (
    <div className="panel hud turn-bar" title="Turn order forecast">
      {entries.map((e, i) => {
        if (e.kind === 'round') {
          return <div key={i} className={`turn-chip round-chip ${i === 0 ? 'first' : ''}`}>R{e.round}</div>;
        }
        const u = b.units.find((x) => x.id === e.unitId);
        if (!u) return null;
        if (e.kind === 'cast') {
          return (
            <div key={i} className={`turn-chip cast-chip ${i === 0 ? 'first' : ''}`}
              title={`${u.name} — ${getAbility(e.castAbility!).name} resolves`}>✷</div>
          );
        }
        return (
          <div key={i} className={`turn-chip team-${u.team} ${i === 0 ? 'first' : ''}`} title={`${u.name} (Lv ${u.level} ${JOBS[u.job].name})`}>
            <Portrait job={u.job} />
          </div>
        );
      })}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`, background: color }} />
    </div>
  );
}

export function UnitPanel({ b }: { b: BattleState }) {
  const hoverUnit = b.ui.hoverTile ? unitAt(b, b.ui.hoverTile.x, b.ui.hoverTile.y) : undefined;
  const active = b.units.find((u) => u.id === b.activeUnitId);
  const u: Unit | undefined = hoverUnit ?? active;
  const tile = b.ui.hoverTile ? tileAt(b, b.ui.hoverTile.x, b.ui.hoverTile.y) : null;
  if (!u && !tile) return null;
  const s = u ? maxStats(u) : null;
  const eff = u ? effectiveStats(u) : null;
  return (
    <div className="panel hud unit-panel">
      {u && s && eff && (
        <>
          <div className="up-head">
            <Portrait job={u.job} />
            <div>
              <b>{u.name} {u.isLeader ? '♛' : ''}</b>
              <span>
                Lv {u.level} {JOBS[u.job].name} · {u.team === 'player' ? 'Daybreak' : u.team === 'enemy' ? 'Hostile' : 'Guest'}
              </span>
            </div>
          </div>
          <div className="bar-label"><span>HP</span><span>{u.hp} / {s.hp}</span></div>
          <Bar value={u.hp} max={s.hp} color={u.hp / s.hp > 0.5 ? '#62d26f' : u.hp / s.hp > 0.25 ? '#e8c14a' : '#e0463c'} />
          <div className="bar-label"><span>MP</span><span>{u.mp} / {s.mp}</span></div>
          <Bar value={u.mp} max={s.mp} color="#6db4ff" />
          <div className="bar-label"><span>CT</span><span>{Math.min(100, Math.max(0, Math.round(u.ct)))} / 100</span></div>
          <Bar value={Math.max(0, u.ct)} max={100} color="#c77dff" />
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
            <span>ATK {eff.atk}</span><span>MAG {eff.mag}</span><span>SPD {eff.spd}</span>
            <span>MV {eff.move}</span><span>JP {u.jp}</span>
          </div>
          {u.ko && <div style={{ color: '#8a4fc9', marginTop: 4 }}>Down — lost in {u.koCounter} turn{u.koCounter === 1 ? '' : 's'}</div>}
          {u.statuses.length > 0 && (
            <div className="statuses">
              {u.statuses.map((st) => (
                <span key={st.id} className="status-pill">{st.id} ({st.turnsLeft})</span>
              ))}
            </div>
          )}
        </>
      )}
      {tile && (
        <div className="tile-info">
          Tile ({tile.x},{tile.y}) · {tile.terrain} · height {tile.h}
          {tile.prop ? ` · ${tile.prop}` : ''}{tile.impassable ? ' · impassable' : ''}
          {tile.treasure && !tile.treasure.claimed ? ' · ✦ something glitters here' : ''}
        </div>
      )}
    </div>
  );
}

const AOE_LABEL: Record<string, string> = {
  single: 'single target', diamond1: 'small burst', diamond2: 'wide burst', cross1: 'self + adjacent', line: 'line',
};

export function ActionPanel({ b }: { b: BattleState }) {
  useGame();
  const u = b.units.find((x) => x.id === b.activeUnitId);
  if (!u || u.team !== 'player' || b.phase !== 'combat') return null;
  const mode = b.ui.mode;

  if (mode === 'unitMenu') {
    return (
      <div className="panel hud action-panel">
        <h3>{u.name}'s Turn</h3>
        <button className="menu-btn" disabled={b.hasMoved} onClick={() => { uiEnterMove(game); }}>
          <span>Move</span><span className="hint">{effectiveStats(u).move} tiles</span>
        </button>
        <button className="menu-btn" disabled={b.hasActed} onClick={() => { uiEnterActions(game); }}>
          <span>Act</span><span className="hint">attack & abilities</span>
        </button>
        <button className="menu-btn" disabled={b.hasActed || Object.keys(game.inventory).length === 0}
          onClick={() => { uiEnterItems(game); }}>
          <span>Item</span><span className="hint">{Object.values(game.inventory).reduce((a, v) => a + v, 0)} carried</span>
        </button>
        {b.hasMoved && !b.hasActed && b.moveOrigin != null && (
          <button className="menu-btn" onClick={() => { uiUndoMove(game); }}>
            <span>Undo Move</span>
          </button>
        )}
        <button className="menu-btn primary" onClick={() => { uiBeginWait(game); }}>
          <span>Wait</span><span className="hint">end turn</span>
        </button>
      </div>
    );
  }

  if (mode === 'action') {
    const abilities = playerAbilityList(game);
    return (
      <div className="panel hud action-panel">
        <h3>Choose an Action</h3>
        {abilities.map((ab) => (
          <button key={ab.id} className="ability-btn" disabled={ab.mpCost > u.mp}
            title={ab.desc}
            onClick={() => { uiSelectAbility(game, ab.id); }}>
            <img src={MANIFEST[ab.icon]} alt="" style={{ background: '#e8dcc0' }} />
            <span className="ab-name">
              {ab.name}
              <small>rng {ab.rangeMin === ab.rangeMax ? ab.rangeMax : `${ab.rangeMin}–${ab.rangeMax}`} · {AOE_LABEL[ab.aoe]}{ab.castTicks ? ' · charges' : ''}</small>
            </span>
            {ab.mpCost > 0 && <span className="ab-mp">{ab.mpCost} MP</span>}
          </button>
        ))}
        <button onClick={() => uiCancel(game)}>← Back</button>
      </div>
    );
  }

  if (mode === 'item') {
    const items = Object.entries(game.inventory).filter(([, n]) => n > 0);
    return (
      <div className="panel hud action-panel">
        <h3>Use an Item</h3>
        {items.map(([id, count]) => {
          const def = getConsumable(id);
          return (
            <button key={id} className="ability-btn" title={def.desc} onClick={() => { uiSelectItem(game, id); }}>
              <img src={MANIFEST[def.icon]} alt="" style={{ background: '#e8dcc0' }} />
              <span className="ab-name">{def.name}<small>{def.desc}</small></span>
              <span className="ab-mp">×{count}</span>
            </button>
          );
        })}
        <button onClick={() => uiCancel(game)}>← Back</button>
      </div>
    );
  }

  if (mode === 'move') {
    return (
      <div className="panel hud action-panel">
        <h3>Move</h3>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>Click a highlighted tile to move there.</div>
        <button onClick={() => uiCancel(game)}>← Back</button>
      </div>
    );
  }

  if (mode === 'target') {
    return (
      <div className="panel hud action-panel">
        <h3>Choose a Target</h3>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>Click a highlighted tile. The blast area previews in orange.</div>
        <button onClick={() => uiCancel(game)}>← Back</button>
      </div>
    );
  }

  if (mode === 'confirm' && b.ui.forecast) {
    const f = b.ui.forecast;
    return (
      <div className="panel hud action-panel">
        <h3>Forecast</h3>
        {f.targets.length === 0 && <div style={{ fontSize: 13, color: 'var(--dim)' }}>No one is affected.</div>}
        {f.targets.length > 0 && (
          <table className="forecast-table">
            <tbody>
              {f.targets.map((t) => (
                <tr key={t.unitId}>
                  <td>{t.name}</td>
                  <td className="f-hit">{t.hit}%</td>
                  <td className={t.kind === 'damage' ? 'f-dmg' : 'f-heal'}>
                    {t.kind === 'damage' ? `−${t.amount}` :
                      t.kind === 'heal' ? `+${t.amount}` :
                      t.kind === 'mp' ? `+${t.amount} MP` :
                      t.kind === 'revive' ? `revive ${t.amount}` :
                      t.status ? t.status : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {f.mpCost > 0 && <div style={{ fontSize: 12, color: '#2f6fb2' }}>Costs {f.mpCost} MP</div>}
        {f.castTicks ? <div style={{ fontSize: 12, color: '#8a4fc9' }}>Charges — resolves after a delay (see turn bar)</div> : null}
        <div className="confirm-row">
          <button className="primary" onClick={() => { void uiConfirmAction(game); }}>Confirm</button>
          <button onClick={() => uiCancel(game)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (mode === 'facing') {
    const pickFacing = (f: Facing) => { void uiPickFacing(game, f); };
    return (
      <div className="panel hud action-panel">
        <h3>Final Facing</h3>
        <div style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center' }}>
          Attacks from the side or behind land more often. Guard your back.
        </div>
        <div className="facing-pad">
          <button onClick={() => pickFacing('W')} title="Up-left">↖</button>
          <div />
          <button onClick={() => pickFacing('N')} title="Up-right">↗</button>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>face</div>
          <div />
          <button onClick={() => pickFacing('S')} title="Down-left">↙</button>
          <div />
          <button onClick={() => pickFacing('E')} title="Down-right">↘</button>
        </div>
        <button onClick={() => uiCancel(game)}>← Back</button>
      </div>
    );
  }

  return null;
}

export function BattleLog({ b }: { b: BattleState }) {
  const lines = b.log.slice(-9);
  return (
    <div className="panel hud battle-log">
      {lines.map((l, i) => (
        <div key={`${b.log.length - lines.length + i}`} className={i === lines.length - 1 ? 'latest' : ''}>{l}</div>
      ))}
    </div>
  );
}

export function ResultsOverlay({ b }: { b: BattleState }) {
  if (b.phase !== 'victory' && b.phase !== 'defeat') return null;
  const victory = b.phase === 'victory';
  const deployed = game.roster.filter((u) => b.deployChoice.includes(u.id));
  const bannerImg = MANIFEST[victory ? 'banner_victory' : 'banner_defeat'];
  return (
    <div className="results-overlay">
      <div className="panel results-box">
        {bannerImg && <img className="banner-img" src={bannerImg} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <h1 className={victory ? 'victory' : 'defeat'}>{victory ? 'VICTORY' : 'DEFEAT'}</h1>
        {victory ? (
          <>
            <table className="results-table">
              <thead>
                <tr><th>Unit</th><th>EXP</th><th>JP</th><th>Level</th></tr>
              </thead>
              <tbody>
                {deployed.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>+{b.results.expGained[u.id] ?? 0}</td>
                    <td>+{b.results.jpGained[u.id] ?? 0}</td>
                    <td>{u.level}{b.results.levelUps.includes(u.name) ? ' ▲' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginBottom: 12, color: 'var(--gold)' }}>
              Spoils: {b.results.gold} gold
              {b.results.itemsFound.length > 0 ? ` · ${b.results.itemsFound.join(', ')}` : ''}
            </div>
            <div className="results-actions">
              <button className="primary" onClick={() => { leaveBattle(game); bump(); }}>Continue</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>{getMap(b.mapId).objective.defeatText}</p>
            <div className="results-actions">
              <button className="primary" onClick={() => { retryBattle(game); bump(); }}>Retry Battle</button>
              <button onClick={() => { leaveBattle(game); bump(); }}>Withdraw</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
