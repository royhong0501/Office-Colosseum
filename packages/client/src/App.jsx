import { useState } from 'react';
import MainMenu from './screens/MainMenu.jsx';
import Lobby from './screens/Lobby.jsx';
import NetworkedBattle from './screens/NetworkedBattle.jsx';

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);

  if (screen === 'menu') return <MainMenu onStart={() => setScreen('lobby')} />;
  if (screen === 'lobby') return (
    <Lobby
      onMatchStart={(ms) => { setMatchStart(ms); setScreen('battle'); }}
      onBack={() => setScreen('menu')}
    />
  );
  if (screen === 'battle') return (
    <NetworkedBattle
      initialState={matchStart}
      onEnd={(end) => { setMatchEnd(end); setScreen('gameover'); }}
    />
  );
  if (screen === 'gameover') return (
    <div style={{ padding: 40, fontFamily: 'Consolas, monospace' }}>
      <h2>WINNER: {matchEnd?.winnerId ?? '(draw)'}</h2>
      <pre>{JSON.stringify(matchEnd?.summary, null, 2)}</pre>
      <button onClick={() => setScreen('menu')}>Back to menu</button>
    </div>
  );
  return null;
}
