import { useEffect, useState } from 'react';
import { applyTheme, loadTheme } from './theme/themeVars.js';
import MainMenu from './screens/MainMenu.jsx';
import ModeSelect from './screens/ModeSelect.jsx';
import Lobby from './screens/Lobby.jsx';
import MapSelectBR from './screens/battle/br/MapSelect.jsx';
import NetworkedBattle from './screens/NetworkedBattle.jsx';
import GameOver from './screens/GameOver.jsx';
import BossKey from './screens/BossKey.jsx';
import CharacterBrowser from './screens/CharacterBrowser.jsx';
import MatchHistory from './screens/MatchHistory.jsx';
import { useBossKey } from './hooks/useBossKey.js';
import { useSocketStatus } from './hooks/useSocketStatus.js';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import { getSocket } from './net/socket.js';
import { MSG } from '@office-colosseum/shared';

// 多遊戲平台 screen 流程：
//   menu → modeSelect → [mapSelect (BR only)] → lobby → battle → gameover
//   menu → characters / history (獨立頁)
// Phase 0：mapSelect 未實作，BR 直接從 modeSelect → lobby，config 暫為空。
// Phase 1 會在 modeSelect 與 lobby 之間插入 MapSelect。

export default function App() {
  const hidden = useBossKey();
  const connStatus = useSocketStatus();
  const [screen, setScreen] = useState('menu');

  useEffect(() => { applyTheme(loadTheme()); }, []);

  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);
  const [gameType, setGameType] = useState(null);
  const [config, setConfig] = useState({});

  let content = null;
  if (screen === 'menu') {
    content = (
      <MainMenu
        onStart={() => setScreen('modeSelect')}
        onOpenCharacters={() => setScreen('characters')}
        onOpenHistory={() => setScreen('history')}
      />
    );
  } else if (screen === 'characters') {
    content = <CharacterBrowser onBack={() => setScreen('menu')} />;
  } else if (screen === 'history') {
    content = <MatchHistory onBack={() => setScreen('menu')} />;
  } else if (screen === 'modeSelect') {
    content = (
      <ModeSelect
        onModeSelected={(id) => {
          setGameType(id);
          setConfig({});
          // BR 先進地圖選擇；其他模式（未來）直接進 lobby
          if (id === 'battle-royale') setScreen('mapSelect');
          else setScreen('lobby');
        }}
        onBack={() => setScreen('menu')}
      />
    );
  } else if (screen === 'mapSelect') {
    content = (
      <MapSelectBR
        onConfirm={(mapId) => { setConfig({ mapId }); setScreen('lobby'); }}
        onBack={() => { setGameType(null); setConfig({}); setScreen('modeSelect'); }}
      />
    );
  } else if (screen === 'lobby') {
    content = (
      <Lobby
        gameType={gameType}
        config={config}
        onMatchStart={(ms) => { setMatchStart(ms); setScreen('battle'); }}
        onBack={() => { setGameType(null); setConfig({}); setScreen('modeSelect'); }}
      />
    );
  } else if (screen === 'battle') {
    content = (
      <NetworkedBattle
        gameType={gameType}
        config={config}
        initialState={matchStart}
        onEnd={(end) => { setMatchEnd(end); setScreen('gameover'); }}
      />
    );
  } else if (screen === 'gameover') {
    content = (
      <GameOver
        gameType={gameType}
        config={config}
        winnerId={matchEnd?.winnerId ?? null}
        summary={matchEnd?.summary ?? {}}
        players={matchEnd?.players ?? {}}
        onBack={() => {
          getSocket().emit(MSG.READY, { ready: false });
          setScreen('lobby');
        }}
      />
    );
  }

  return (
    <>
      {hidden && <BossKey />}
      <ConnectionBanner status={connStatus} />
      <div style={{ visibility: hidden ? 'hidden' : 'visible', height: '100%' }}>
        {content}
      </div>
    </>
  );
}
