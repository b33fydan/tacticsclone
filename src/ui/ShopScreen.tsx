import { useState } from 'react';
import { bump, game, useGame } from '../store/store';
import { getConsumable, getEquipment } from '../data/items';
import { buyConsumable, buyEquipment, sellEquipment, shopStock } from '../game/flow';
import { MANIFEST } from '../render/assets';
import { JOBS } from '../data/jobs';

type Tab = 'gear' | 'supplies' | 'sell';

export default function ShopScreen() {
  useGame();
  const [tab, setTab] = useState<Tab>('gear');
  const stock = shopStock(game);

  return (
    <div className="screen">
      <div className="bg-overlay" style={{ background: '#ece1c8' }} />
      <div className="mgmt">
        <div className="campaign-head">
          <h1>WAYFARER'S MARKET</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="gold-display">⛁ {game.gold}</span>
            <button onClick={() => { game.screen = 'campaign'; bump(); }}>← Back</button>
          </div>
        </div>
        <div className="shop-tabs">
          <button className={tab === 'gear' ? 'selected' : ''} onClick={() => setTab('gear')}>Gear</button>
          <button className={tab === 'supplies' ? 'selected' : ''} onClick={() => setTab('supplies')}>Supplies</button>
          <button className={tab === 'sell' ? 'selected' : ''} onClick={() => setTab('sell')}>Sell</button>
        </div>

        {tab === 'gear' && (
          <div className="shop-grid">
            {stock.equipment.map((id) => {
              const def = getEquipment(id);
              const owned = game.ownedEquipment.filter((e) => e === id).length
                + game.roster.filter((u) => Object.values(u.equipment).includes(id)).length;
              return (
                <div key={id} className="panel shop-item">
                  <img src={MANIFEST[def.icon]} alt="" style={{ background: '#e8dcc0' }} />
                  <div className="si-info">
                    <b>{def.name}</b>
                    <span>
                      {Object.entries(def.mods).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(', ')}
                      {def.jobs ? ` · ${def.jobs.map((j) => JOBS[j].name).join('/')}` : ''}
                      {owned > 0 ? ` · owned ×${owned}` : ''}
                    </span>
                  </div>
                  <button disabled={game.gold < def.cost} onClick={() => { buyEquipment(game, id); bump(); }}>
                    {def.cost} g
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'supplies' && (
          <div className="shop-grid">
            {stock.consumables.map((id) => {
              const def = getConsumable(id);
              return (
                <div key={id} className="panel shop-item">
                  <img src={MANIFEST[def.icon]} alt="" style={{ background: '#e8dcc0' }} />
                  <div className="si-info">
                    <b>{def.name}</b>
                    <span>{def.desc} · have ×{game.inventory[id] ?? 0}</span>
                  </div>
                  <button disabled={game.gold < def.cost} onClick={() => { buyConsumable(game, id); bump(); }}>
                    {def.cost} g
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'sell' && (
          <div className="shop-grid">
            {game.ownedEquipment.length === 0 && (
              <div style={{ color: 'var(--dim)', padding: 12 }}>Nothing in the wagon to sell. (Equipped gear must be unequipped first.)</div>
            )}
            {game.ownedEquipment.map((id, i) => {
              const def = getEquipment(id);
              return (
                <div key={`${id}_${i}`} className="panel shop-item">
                  <img src={MANIFEST[def.icon]} alt="" style={{ background: '#e8dcc0' }} />
                  <div className="si-info">
                    <b>{def.name}</b>
                    <span>{Object.entries(def.mods).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(', ')}</span>
                  </div>
                  <button onClick={() => { sellEquipment(game, id); bump(); }}>
                    Sell {Math.floor(def.cost / 2)} g
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
