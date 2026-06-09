import { useState } from 'react';
import { bump, game, useGame } from '../store/store';
import { JOBS, JOB_LIST } from '../data/jobs';
import { ABILITIES, getAbility } from '../data/abilities';
import { EQUIPMENT, getEquipment } from '../data/items';
import { knownAbilities, learnAbility, maxStats } from '../entities/unit';
import { changeJob, equipFromPool, unequipToPool } from '../game/flow';
import { MANIFEST } from '../render/assets';
import type { JobId, Unit } from '../entities/types';

function Portrait({ job, size = 44 }: { job: JobId; size?: number }) {
  const src = MANIFEST[`portrait_${job}`];
  return (
    <img
      src={src} width={size} height={size} alt={JOBS[job].name}
      style={{ background: JOBS[job].color, borderRadius: 6, objectFit: 'cover', objectPosition: 'top' }}
      onError={(e) => { (e.target as HTMLImageElement).style.objectFit = 'contain'; }}
    />
  );
}

export default function PartyScreen() {
  useGame();
  const [selId, setSelId] = useState(game.roster[0]?.id);
  const unit = game.roster.find((u) => u.id === selId) ?? game.roster[0];

  return (
    <div className="screen">
      <div className="bg-overlay" style={{ background: '#100d1a' }} />
      <div className="mgmt">
        <div className="campaign-head">
          <h1>PARTY & JOBS</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="gold-display">⛁ {game.gold}</span>
            <button onClick={() => { game.screen = 'campaign'; bump(); }}>← Back</button>
          </div>
        </div>
        <div className="mgmt-body">
          <div className="roster-list">
            {game.roster.map((u) => (
              <div key={u.id} className={`panel roster-card ${u.id === unit?.id ? 'selected' : ''}`} onClick={() => setSelId(u.id)}>
                <Portrait job={u.job} />
                <div className="who">
                  <b>{u.name}</b>
                  <span>Lv {u.level} {JOBS[u.job].name} · {u.jp} JP</span>
                </div>
              </div>
            ))}
          </div>
          {unit && <UnitDetail unit={unit} />}
        </div>
      </div>
    </div>
  );
}

function UnitDetail({ unit }: { unit: Unit }) {
  const s = maxStats(unit);
  const job = JOBS[unit.job];
  const known = knownAbilities(unit);

  const poolFor = (slot: 'weapon' | 'armor' | 'accessory') =>
    [...new Set(game.ownedEquipment)].filter((id) => {
      const def = getEquipment(id);
      return def.slot === slot && (!def.jobs || def.jobs.includes(unit.job));
    });

  return (
    <div className="unit-detail">
      <div className="panel">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <Portrait job={unit.job} size={64} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 19 }}>{unit.name}</b>
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>
              Level {unit.level} · EXP {unit.exp}/100 · <span style={{ color: 'var(--gold)' }}>{unit.jp} JP</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--dim)', marginRight: 6 }}>Job:</label>
              <select value={unit.job} onChange={(e) => { changeJob(game, unit, e.target.value as JobId); bump(); }}>
                {JOB_LIST.map((j) => <option key={j.id} value={j.id}>{j.name} — {j.role}</option>)}
              </select>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 10 }}>{job.desc}</p>
        <div className="stat-grid">
          <div><span>HP</span>{s.hp}</div>
          <div><span>MP</span>{s.mp}</div>
          <div><span>Attack</span>{s.atk}</div>
          <div><span>Magic</span>{s.mag}</div>
          <div><span>Speed</span>{s.spd}</div>
          <div><span>Move</span>{s.move}</div>
          <div><span>Jump</span>{s.jump}</div>
          <div><span>Evade</span>{s.evade}</div>
        </div>
        {job.passive && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--accent)' }}>Passive — {job.passive.name}:</span>{' '}
            <span style={{ color: 'var(--dim)' }}>{job.passive.desc}</span>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 style={{ color: 'var(--gold)', fontSize: 15, marginBottom: 9 }}>Equipment</h3>
        <div className="slot-row">
          {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
            const current = unit.equipment[slot];
            const options = poolFor(slot);
            return (
              <div key={slot} style={{ minWidth: 170 }}>
                <label>{slot[0].toUpperCase() + slot.slice(1)}</label>
                <select
                  value={current ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) unequipToPool(game, unit, slot);
                    else if (v !== current) equipFromPool(game, unit, v);
                    bump();
                  }}
                >
                  <option value="">— none —</option>
                  {current && <option value={current}>{getEquipment(current).name} (equipped)</option>}
                  {options.map((id, i) => (
                    <option key={`${id}_${i}`} value={id}>{getEquipment(id).name}</option>
                  ))}
                </select>
                {current && (
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>
                    {Object.entries(EQUIPMENT[current].mods).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ color: 'var(--gold)', fontSize: 15, marginBottom: 9 }}>
          {job.name} Abilities <span style={{ color: 'var(--dim)', fontWeight: 'normal', fontSize: 12 }}>(spend JP to learn)</span>
        </h3>
        {job.abilityIds.map((id) => {
          const ab = getAbility(id);
          const learned = known.includes(id);
          return (
            <div key={id} className="ability-row">
              <img src={MANIFEST[ab.icon]} alt="" style={{ background: '#2c2440' }} />
              <div className="ab-info">
                <b>{ab.name}</b> <span style={{ color: '#6db4ff', fontSize: 12 }}>{ab.mpCost > 0 ? `${ab.mpCost} MP` : ''}</span>
                <p>{ab.desc}</p>
              </div>
              {learned
                ? <span className="learned">Learned ✓</span>
                : (
                  <button
                    disabled={unit.jp < ab.jpCost}
                    onClick={() => { learnAbility(unit, id, ab.jpCost); bump(); }}
                  >
                    Learn — {ab.jpCost} JP
                  </button>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
