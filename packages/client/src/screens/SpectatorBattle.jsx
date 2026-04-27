// 觀戰畫面：訂閱 SPECTATE_INIT 拿當前 match state，依 gameType dispatch 到對應 battle 元件，
// 開 readOnly 模式讓 input timer 完全不跑。
//
// 流程：
// 1. App.jsx 切到 'spectate' screen 時，server 已透過 SPECTATE_ROOM 處理過 spectate(socket, roomId)
//    並 emit SPECTATE_INIT；此元件 mount 後訂閱該 event。
// 2. 收到 SPECTATE_INIT → 用 initData 渲染對應 battle 元件（readOnly）。
// 3. MATCH_END / 使用者按離開 → emit SPECTATE_LEAVE → onLeave 回 lobby。

import { useEffect, useState } from 'react';
import { MSG } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import BattleRoyale from './battle/br/BattleRoyale.jsx';
import ItemsBattle from './battle/items/ItemsBattle.jsx';
import TerritoryBattle from './battle/territory/TerritoryBattle.jsx';
import SheetWindow from '../components/SheetWindow.jsx';

function pickBattleComponent(gameType) {
  if (gameType === 'battle-royale') return BattleRoyale;
  if (gameType === 'items') return ItemsBattle;
  if (gameType === 'territory') return TerritoryBattle;
  return null;
}

// server 回這些 ERROR code 時直接放棄觀戰
const SPECTATE_FATAL_ERRORS = new Set([
  'room_not_found', 'no_match', 'private_room', 'spectators_full',
]);

const ERROR_LABEL = {
  room_not_found: '房間已不存在',
  no_match: '對戰已結束或尚未開始',
  private_room: '此為私人房，不允許觀戰',
  spectators_full: '觀戰人數已滿',
};

export default function SpectatorBattle({ roomId, onLeave }) {
  const socket = getSocket();
  const [initData, setInitData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) return undefined;
    const onInit = (data) => setInitData(data);
    const onError = (err) => {
      if (err && SPECTATE_FATAL_ERRORS.has(err.code)) {
        setError(ERROR_LABEL[err.code] ?? err.code);
      }
    };
    socket.on(MSG.SPECTATE_INIT, onInit);
    socket.on(MSG.ERROR, onError);
    // 訂閱完成後才送 SPECTATE_ROOM，避免 server 太快回 SPECTATE_INIT 結果 listener 還沒掛上
    socket.emit(MSG.SPECTATE_ROOM, { roomId });
    return () => {
      socket.off(MSG.SPECTATE_INIT, onInit);
      socket.off(MSG.ERROR, onError);
    };
  }, [socket, roomId]);

  const handleLeave = () => {
    socket.emit(MSG.SPECTATE_LEAVE);
    onLeave?.();
  };

  // server 拒絕觀戰：顯示錯誤並讓使用者按鈕回 lobby
  if (error) {
    return (
      <SheetWindow
        fileName="觀戰失敗.xlsx"
        cellRef="A1"
        formula={<><span className="fn">=SPECTATE</span>() // <span style={{ color: 'var(--accent-danger)' }}>#REF!</span></>}
        statusLeft="觀戰請求被拒"
        statusRight=""
        fullscreen
      >
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13,
        }}>
          <div style={{ fontSize: 26, color: 'var(--accent-danger)' }}>#REF!</div>
          <div>{error}</div>
          <button onClick={onLeave} style={leaveBtn}>返回大廳</button>
        </div>
      </SheetWindow>
    );
  }

  // SPECTATE_INIT 還沒來：佔位畫面
  if (!initData) {
    return (
      <SheetWindow
        fileName="觀戰中.xlsx — 連線中"
        cellRef="A1"
        formula={<><span className="fn">=SPECTATE</span>()</>}
        statusLeft="正在加入觀戰..."
        statusRight=""
        fullscreen
      >
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 14,
        }}>
          <button onClick={handleLeave} style={leaveBtn}>取消觀戰</button>
        </div>
      </SheetWindow>
    );
  }

  const Battle = pickBattleComponent(initData.gameType);
  if (!Battle) {
    return (
      <SheetWindow fileName="觀戰錯誤.xlsx" cellRef="A1" formula="=#NAME?" fullscreen>
        <div style={{ padding: 32, color: 'var(--accent-danger)' }}>
          不支援的 gameType: {initData.gameType}
          <button onClick={handleLeave} style={{ ...leaveBtn, marginLeft: 12 }}>離開</button>
        </div>
      </SheetWindow>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Battle
        initialState={initData}
        config={initData.config}
        readOnly
        onEnd={handleLeave}    // MATCH_END 時自動回 lobby
      />
      {/* 觀戰中標籤 + 離開按鈕 — 浮在畫面上方 */}
      <div style={{
        position: 'absolute', top: 8, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5000,
        padding: '4px 14px',
        background: 'var(--accent-link)',
        color: 'var(--bg-paper)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11, letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }}>
        <span>● 觀戰中</span>
        <button onClick={handleLeave} style={{
          background: 'var(--bg-paper)', color: 'var(--ink)',
          border: '1px solid var(--line)', fontSize: 10,
          padding: '2px 10px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
        }}>離開</button>
      </div>
    </div>
  );
}

const leaveBtn = {
  background: 'var(--bg-paper)', color: 'var(--ink)',
  border: '1px solid var(--line-soft)', padding: '6px 14px',
  fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
