import { useEffect, useState } from 'react';
import { useGame } from './store/store';
import { loadAssets } from './render/assets';
import TitleScreen from './ui/TitleScreen';
import CampaignScreen from './ui/CampaignScreen';
import PartyScreen from './ui/PartyScreen';
import ShopScreen from './ui/ShopScreen';
import BattleScreen from './ui/BattleScreen';

export default function App() {
  const game = useGame();
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAssets((done, total) => setProgress(done / total)).then(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return (
      <div className="loading-screen">
        <div className="game-title" style={{ fontSize: 38 }}>EMBERVEIL TACTICS</div>
        <div className="loading-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <div style={{ color: 'var(--dim)', fontSize: 13 }}>Gathering the company...</div>
      </div>
    );
  }

  switch (game.screen) {
    case 'title': return <TitleScreen />;
    case 'campaign': return <CampaignScreen />;
    case 'party': return <PartyScreen />;
    case 'shop': return <ShopScreen />;
    case 'battle': return <BattleScreen />;
    default: return null;
  }
}
