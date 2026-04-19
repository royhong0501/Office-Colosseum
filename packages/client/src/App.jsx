import { useState } from 'react';
import MainMenu from './screens/MainMenu.jsx';
import Lobby from './screens/Lobby.jsx';
import NetworkedBattle from './screens/NetworkedBattle.jsx';
import GameOver from './screens/GameOver.jsx';
import BossKey from './screens/BossKey.jsx';
import { useBossKey } from './hooks/useBossKey.js';
import { getSocket } from './net/socket.js';
import { MSG } from '@office-colosseum/shared';

export default function App() {
  const hidden = useBossKey();
  const [screen, setScreen] = useState('menu');
  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);

  let content = null;
  if (screen === 'menu') {
    content = <MainMenu onStart={() => setScreen('lobby')} />;
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
      <div style={{ visibility: hidden ? 'hidden' : 'visible', height: '100%' }}>
        {content}
      </div>
    </>
  );
}
