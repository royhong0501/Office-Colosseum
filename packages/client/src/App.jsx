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
import Login from './screens/Login.jsx';
import AdminPanel from './screens/AdminPanel.jsx';
import { useBossKey } from './hooks/useBossKey.js';
import { useSocketStatus } from './hooks/useSocketStatus.js';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import { getSocket, reconnectSocket, disconnectSocket } from './net/socket.js';
import { MSG } from '@office-colosseum/shared';
import {
  isAuthed, isAdmin, refreshMe, getCurrentUser, logout as authLogout,
} from './lib/auth.js';

// 多遊戲平台 screen 流程：
//   auth → menu → modeSelect → [mapSelect (BR only)] → lobby → battle → gameover
//   menu → characters / history / admin (獨立頁)

export default function App() {
  const hidden = useBossKey();
  const connStatus = useSocketStatus();
  // 啟動先進 auth；refreshMe 完成後若有 token 才放行進 menu
  const [screen, setScreen] = useState(isAuthed() ? 'menu' : 'auth');
  const [user, setUser] = useState(getCurrentUser());

  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  // 啟動時校正 token；若被 revoke / 過期就回 auth
  useEffect(() => {
    if (!isAuthed()) return;
    refreshMe().then((u) => {
      if (u) {
        setUser(u);
        reconnectSocket();
      } else {
        setScreen('auth');
      }
    });
  }, []);

  // 全域監聽：socket handshake 失敗清掉 token 後 → 強制回 Login
  useEffect(() => {
    const onCleared = () => { setUser(null); setScreen('auth'); };
    window.addEventListener('oc:auth-cleared', onCleared);
    return () => window.removeEventListener('oc:auth-cleared', onCleared);
  }, []);

  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);
  const [gameType, setGameType] = useState(null);
  const [config, setConfig] = useState({});

  const handleLogout = async () => {
    await authLogout();
    disconnectSocket();
    setUser(null);
    setScreen('auth');
  };

  let content = null;
  if (screen === 'auth') {
    content = <Login onLoggedIn={(u) => { setUser(u); setScreen('menu'); }} />;
  } else if (screen === 'menu') {
    content = (
      <MainMenu
        user={user}
        onStart={() => setScreen('modeSelect')}
        onOpenCharacters={() => setScreen('characters')}
        onOpenHistory={() => setScreen('history')}
        onOpenAdmin={isAdmin() ? () => setScreen('admin') : null}
        onLogout={handleLogout}
      />
    );
  } else if (screen === 'characters') {
    content = <CharacterBrowser onBack={() => setScreen('menu')} />;
  } else if (screen === 'history') {
    content = <MatchHistory onBack={() => setScreen('menu')} />;
  } else if (screen === 'admin') {
    content = <AdminPanel onBack={() => setScreen('menu')} />;
  } else if (screen === 'modeSelect') {
    content = (
      <ModeSelect
        onModeSelected={(id) => {
          setGameType(id);
          setConfig({});
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
