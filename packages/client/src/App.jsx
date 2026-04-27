import { useEffect, useState } from 'react';
import { applyTheme, loadTheme } from './theme/themeVars.js';
import MainMenu from './screens/MainMenu.jsx';
import Lobby from './screens/Lobby.jsx';
import Room from './screens/Room.jsx';
import SpectatorBattle from './screens/SpectatorBattle.jsx';
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
import ChatPanel from './components/ChatPanel.jsx';
import DebugOverlay from './components/DebugOverlay.jsx';
import { getSocket, reconnectSocket, disconnectSocket } from './net/socket.js';
import { MSG } from '@office-colosseum/shared';
import {
  isAuthed, isAdmin, refreshMe, getCurrentUser, logout as authLogout,
} from './lib/auth.js';

const CHAT_OPEN_KEY = 'oc.chat.open';
// chat 浮動 dock 預設常駐；只有 auth 不顯示（避免登入前打擾）
const SCREENS_WITHOUT_CHAT = new Set(['auth']);

// 多房遊戲平台 screen 流程：
//   auth → menu → lobby (多房列表) → room (單房內頁) → battle → gameover
//   lobby → spectate (觀戰，不進房)
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

  // Debug overlay（FPS / PING / DROP25）：預設常駐顯示。
  // 仍保留 Ctrl+` 切換（跟 VS Code terminal toggle 一致），不想看就關掉。
  const [debugVisible, setDebugVisible] = useState(true);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        setDebugVisible(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const [matchStart, setMatchStart] = useState(null);
  const [matchEnd, setMatchEnd] = useState(null);
  const [gameType, setGameType] = useState(null);
  const [config, setConfig] = useState({});
  // 進入某 Room 後留下房間資訊（mode / mapId / roomName / roomId）給 Room 元件
  const [roomInfo, setRoomInfo] = useState(null);
  // 觀戰中目標 roomId（SpectatorBattle 在 mount 時 emit SPECTATE_ROOM）
  const [spectateRoomId, setSpectateRoomId] = useState(null);
  const [chatOpen, setChatOpen] = useState(() => {
    const v = localStorage.getItem(CHAT_OPEN_KEY);
    return v == null ? true : v === '1';
  });
  const setChatOpenPersist = (v) => {
    setChatOpen(v);
    try { localStorage.setItem(CHAT_OPEN_KEY, v ? '1' : '0'); } catch {}
  };

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
        onStart={() => setScreen('lobby')}
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
  } else if (screen === 'lobby') {
    content = (
      <Lobby
        onJoinRoom={(info) => {
          setRoomInfo(info);
          setGameType(info?.mode ?? null);
          setConfig(info?.mapId ? { mapId: info.mapId } : {});
          setScreen('room');
        }}
        onSpectate={(roomId) => { setSpectateRoomId(roomId); setScreen('spectate'); }}
        onBack={() => setScreen('menu')}
      />
    );
  } else if (screen === 'spectate') {
    content = (
      <SpectatorBattle
        roomId={spectateRoomId}
        onLeave={() => { setSpectateRoomId(null); setScreen('lobby'); }}
      />
    );
  } else if (screen === 'room') {
    content = (
      <Room
        gameType={gameType}
        config={config}
        gameName={roomInfo?.roomName}
        onMatchStart={(ms) => { setMatchStart(ms); setScreen('battle'); }}
        onBack={() => { setRoomInfo(null); setScreen('lobby'); }}
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
          setScreen('room');
        }}
      />
    );
  }

  const showChat = !SCREENS_WITHOUT_CHAT.has(screen);
  // 在房間 / 觀戰時 chat 會多一個「房間頻道」分頁；其他畫面 currentRoomId 為 null
  const currentRoomId = (screen === 'room' || screen === 'spectate')
    ? (roomInfo?.roomId ?? spectateRoomId ?? null)
    : null;

  return (
    <>
      {hidden && <BossKey />}
      <ConnectionBanner status={connStatus} />
      <div style={{ visibility: hidden ? 'hidden' : 'visible', height: '100%' }}>
        {content}
      </div>
      {showChat && (
        <ChatPanel
          open={chatOpen}
          onToggle={setChatOpenPersist}
          currentRoomId={currentRoomId}
        />
      )}
      {/* 只在戰鬥畫面顯示 debug overlay；其他畫面（lobby/menu/auth/...）一律不掛 */}
      <DebugOverlay visible={debugVisible && (screen === 'battle' || screen === 'spectate')} />
    </>
  );
}
