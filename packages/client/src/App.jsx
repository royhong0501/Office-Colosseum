import { useState } from 'react';
import MainMenu from './screens/MainMenu.jsx';
import Lobby from './screens/Lobby.jsx';

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [matchStart, setMatchStart] = useState(null);

  if (screen === 'menu') return <MainMenu onStart={() => setScreen('lobby')} />;
  if (screen === 'lobby') return (
    <Lobby
      onMatchStart={(ms) => { setMatchStart(ms); setScreen('battle'); }}
      onBack={() => setScreen('menu')}
    />
  );
  if (screen === 'battle') return (
    <div style={{ padding: 40 }}>
      <h2>Battle placeholder — match started</h2>
      <pre>{JSON.stringify(matchStart, null, 2)}</pre>
      <button onClick={() => setScreen('menu')}>Back to menu</button>
    </div>
  );
  return null;
}
