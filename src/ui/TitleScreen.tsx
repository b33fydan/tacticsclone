import { useState } from 'react';
import { bump, game, useGame } from '../store/store';
import { hasSave, loadGame, startNewRun } from '../game/flow';
import { MANIFEST } from '../render/assets';
import type { Difficulty } from '../entities/types';

export default function TitleScreen() {
  useGame();
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const canContinue = hasSave();

  return (
    <div className="screen">
      <div className="bg-image" style={{ backgroundImage: `url(${MANIFEST['bg_title']})` }} />
      <div className="bg-overlay" />
      <div className="title-content">
        <div className="game-title">EMBERVEIL<br />TACTICS</div>
        <div className="game-subtitle">The Daybreak Company rides at first light.</div>
        <div className="difficulty-row">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={difficulty === d ? 'selected' : ''}
              onClick={() => setDifficulty(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="primary" style={{ fontSize: 17, padding: '10px 26px' }}
            onClick={() => { startNewRun(game, difficulty); bump(); }}>
            New Campaign
          </button>
          {canContinue && (
            <button style={{ fontSize: 17, padding: '10px 26px' }}
              onClick={() => { if (loadGame(game)) bump(); }}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
