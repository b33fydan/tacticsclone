import { bump, game, useGame } from '../store/store';
import { CAMPAIGN } from '../data/campaign';
import { campaignComplete, enterBattle, startNewRun } from '../game/flow';
import { MANIFEST } from '../render/assets';

export default function CampaignScreen() {
  useGame();
  const done = campaignComplete(game);

  return (
    <div className="screen">
      <div className="bg-image" style={{ backgroundImage: `url(${MANIFEST['bg_campaign']})` }} />
      <div className="bg-overlay" />
      <div className="campaign-content">
        <div className="campaign-head">
          <h1>THE MARCH OF THE DAYBREAK COMPANY</h1>
          <div className="gold-display">⛁ {game.gold} gold · {game.difficulty}</div>
        </div>

        {done && (
          <div className="panel epilogue">
            <h2>The Emberveil Dawns</h2>
            <p>
              Maugrim has fallen, and the Legion scatters like ash on the wind. From the bastion's
              highest tower, the company watches first light spill across Veyra — a dawn they bought
              with steel, fire, and stubborn hearts. The war is over. The road, as always, goes on.
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="primary" onClick={() => { startNewRun(game, game.difficulty); bump(); }}>
                Begin a New Campaign
              </button>
            </div>
          </div>
        )}

        <div className="node-list">
          {CAMPAIGN.map((node, i) => {
            const cleared = i < game.campaignIndex;
            const current = i === game.campaignIndex && !done;
            return (
              <div key={node.mapId} className={`panel node ${current ? 'current' : ''} ${!cleared && !current ? 'locked' : ''}`}>
                <div className="marker">{cleared ? '✦' : current ? '⚑' : '·'}</div>
                <div className="info">
                  <b>{node.title}</b>
                  <span>{node.subtitle}{cleared ? ' — cleared' : ''}</span>
                </div>
                {current && (
                  <button className="primary" onClick={() => { enterBattle(game, node.mapId); bump(); }}>
                    March
                  </button>
                )}
                {cleared && (
                  <button onClick={() => { enterBattle(game, node.mapId); bump(); }}>
                    Revisit
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="campaign-actions">
          <button onClick={() => { game.screen = 'party'; bump(); }}>⚔ Party & Jobs</button>
          <button onClick={() => { game.screen = 'shop'; bump(); }}>⛁ Shop</button>
          <button onClick={() => { game.screen = 'title'; bump(); }}>Title</button>
        </div>
      </div>
    </div>
  );
}
