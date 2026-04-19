import { useState } from 'react';
import MainMenu from './screens/MainMenu.jsx';
import Lobby from './screens/Lobby.jsx';
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

export default function App() {
  const hidden = useBossKey();
  const connStatus = useSocketStatus();
  const [screen, setScreen] = useState('menu');
  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);

  let content = null;
  if (screen === 'menu') {
    content = (
      <MainMenu
        onStart={() => setScreen('lobby')}
        onOpenCharacters={() => setScreen('characters')}
        onOpenHistory={() => setScreen('history')}
      />
    );
  } else if (screen === 'characters') {
    content = <CharacterBrowser onBack={() => setScreen('menu')} />;
  } else if (screen === 'history') {
    content = <MatchHistory onBack={() => setScreen('menu')} />;
  } else if (screen === 'lobby') {
    content = (
      <Lobby
        onMatchStart={(ms) => { setMatchStart(ms); setScreen('battle'); }}
        onBack={() => setScreen('menu')}
      />
    );
  } else if (screen === 'battle') {
    content = (
      <NetworkedBattle
        initialState={matchStart}
        onEnd={(end) => { setMatchEnd(end); setScreen('gameover'); }}
      />
    );
  } else if (screen === 'gameover') {
    content = (
      <GameOver
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
