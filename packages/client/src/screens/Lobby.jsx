import { useState, useEffect } from 'react';
import { CAT_BREEDS, DOG_BREEDS, ALL_CHARACTERS, MSG, MIN_PLAYERS, MAX_PLAYERS } from '@office-colosseum/shared';
import { getMapById } from '@office-colosseum/shared/src/games/br/index.js';
import { getSocket } from '../net/socket.js';
import { getJoinName, getPlayerUuid } from '../lib/playerIdentity.js';
import { CharacterSpriteImg } from '../components/CharacterSprite.jsx';
import SheetWindow from '../components/SheetWindow.jsx';

function shortSheetId(id) {
  if (!id) return '----';
  return id.slice(0, 4).toUpperCase().padStart(4, '0');
}

function ProgressStripes({ label }) {
  return (
    <div style={{
      border: '1px solid var(--line-soft)',
      background: 'var(--bg-input)',
    }}>
      <div style={{
        fontSize: 11, color: 'var(--ink-soft)', padding: '6px 10px',
        borderBottom: '1px solid var(--line-soft)',
        fontFamily: 'var(--font-mono)',
      }}>
        {label}
      </div>
      <div style={{
        height: 16,
        background: 'repeating-linear-gradient(135deg, var(--bg-chrome) 0 10px, var(--bg-paper-alt) 10px 20px)',
        animation: 'sheetStripesSlide 1.2s linear infinite',
      }} />
    </div>
  );
}

function PickerSection({ title, formula, characters, me, otherPickers, onPick }) {
  return (
    <div style={{
      border: '1px solid var(--line-soft)', background: 'var(--bg-input)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{
        padding: '6px 10px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11, color: 'var(--ink-soft)',
      }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
          {formula}
        </span>
      </div>
      <div style={{
        padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
        gap: 6,
      }}>
        {characters.map((ch) => {
          const isPicked = me?.characterId === ch.id;
          const otherPicker = otherPickers.get(ch.id);
          return (
            <div
              key={ch.id}
              onClick={() => onPick(ch.id)}
              style={{
                padding: 8,
                cursor: 'pointer',
                background: isPicked ? 'var(--bg-paper-alt)' : 'var(--bg-paper)',
                border: `1px solid ${isPicked ? 'var(--accent)' : 'var(--line-soft)'}`,
                opacity: otherPicker ? 0.55 : 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                minHeight: 92,
              }}
            >
              <CharacterSpriteImg character={ch} size={40} />
              <div style={{
                fontSize: 11, color: 'var(--ink)',
                fontWeight: isPicked ? 600 : 400,
                textAlign: 'center',
              }}>{ch.name}</div>
              <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                {ch.nameEn}
              </div>
              {otherPicker && (
                <div style={{ fontSize: 9, color: 'var(--accent-danger)' }}>
                  {otherPicker.name} 已選
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GAME_NAME_MAP = {
  'battle-royale': '經典大逃殺',
  'items': '道具戰',
  'territory': '數據領地爭奪戰',
};

export default function Lobby({ gameType, config, onMatchStart, onBack, gameName }) {
  const [players, setPlayers] = useState([]);
  const socket = getSocket();

  useEffect(() => {
    const doJoin = () => {
      socket.emit(MSG.JOIN, { name: getJoinName(), uuid: getPlayerUuid() });
      // Host 選定的 gameType 透過 SET_GAME_TYPE 通知 server；非 host 觸發時 server
      // 會回 not_host ERROR，但不影響流程（LOBBY_STATE 會把正確 gameType 帶下來）。
      if (gameType) {
        socket.emit(MSG.SET_GAME_TYPE, { gameType, config: config ?? {} });
      }
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    const onLobbyState = (data) => setPlayers(data.players ?? []);
    const onMatchStartEvt = (payload) => onMatchStart(payload);
    const onError = (err) => {
      console.warn('[server error]', err);
      alert(`[${err?.code ?? 'error'}] ${err?.msg ?? '未知錯誤'}`);
    };

    socket.on(MSG.LOBBY_STATE, onLobbyState);
    socket.on(MSG.MATCH_START, onMatchStartEvt);
    socket.on(MSG.ERROR, onError);

    return () => {
      socket.off('connect', doJoin);
      socket.off(MSG.LOBBY_STATE, onLobbyState);
      socket.off(MSG.MATCH_START, onMatchStartEvt);
      socket.off(MSG.ERROR, onError);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = players.find((p) => p.id === socket.id);

  const handlePick = (charId) => socket.emit(MSG.PICK, { characterId: charId });
  const handleReady = () => socket.emit(MSG.READY, { ready: !me?.ready });
  const handleStart = () => socket.emit(MSG.START, {});
  const handleAddBot = () => socket.emit(MSG.ADD_BOT);
  const handleRemoveBot = (botId) => socket.emit(MSG.REMOVE_BOT, { botId });
  const handleBack = () => { socket.emit(MSG.LEAVE); onBack(); };

  const readyCount = players.filter((p) => p.ready).length;

  const canStart =
    players.length >= MIN_PLAYERS &&
    players.every((p) => p.ready && p.characterId);

  const startDisabledReason = (() => {
    if (players.length < MIN_PLAYERS) {
      return `還差 ${MIN_PLAYERS - players.length} 人（最少 ${MIN_PLAYERS} 人）`;
    }
    const noChar = players.find((p) => !p.characterId);
    if (noChar) return `${noChar.name} 尚未選角色`;
    const notReady = players.find((p) => !p.ready);
    if (notReady) return `${notReady.name} 尚未按準備`;
    return null;
  })();

  // 角色 → 其他玩家查表（排除自己）
  const otherPickers = new Map();
  if (me) {
    for (const p of players) {
      if (p.id !== socket.id && p.characterId) {
        otherPickers.set(p.characterId, p);
      }
    }
  }

  const baseGameName = gameName || GAME_NAME_MAP[gameType] || '對戰房間';
  const mapName = gameType === 'battle-royale' && config?.mapId
    ? (getMapById(config.mapId)?.name ?? null)
    : null;
  const displayGameName = mapName ? `${baseGameName} · ${mapName}` : baseGameName;

  if (!me) {
    return (
      <SheetWindow
        fileName={`${displayGameName}.xlsx — 連線中`}
        cellRef="A1"
        formula="=CONNECTING()"
        statusLeft="正在連線至對戰節點…"
        statusRight=""
        fullscreen
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)', fontSize: 14 }}>
          正在同步工作表…
        </div>
      </SheetWindow>
    );
  }

  const fileSuffix = me.ready ? '[唯讀]' : '[編輯中]';

  return (
    <SheetWindow
      fileName={`${displayGameName}.xlsx — ${fileSuffix}`}
      cellRef="B4"
      formula={`=FILTER(PLAYERS, STATUS="就緒") → ${readyCount}/${players.length}`}
      tabs={[
        { id: 'hall', label: '遊戲大廳' },
        { id: 'room', label: displayGameName },
      ]}
      activeTab="room"
      onTabSelect={(id) => { if (id === 'hall') handleBack(); }}
      statusLeft={canStart ? '就緒 — 所有參賽者已準備，房主可啟動對戰' : '等待中 — 請完成選角與準備'}
      statusRight={`參賽者 ${players.length}/${MAX_PLAYERS} | 就緒 ${readyCount}/${players.length}`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
        {/* ==== 左：玩家名單試算表 ==== */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--line-soft)',
          background: 'var(--bg-paper)',
          minHeight: 0,
        }}>
          {/* 工具列區（bot 按鈕） */}
          <div style={{
            padding: '6px 10px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11,
          }}>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>
              工作表：參賽者名冊
            </span>
            {me.isHost && (
              <button
                onClick={handleAddBot}
                disabled={players.length >= MAX_PLAYERS}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--line)',
                  color: players.length >= MAX_PLAYERS ? 'var(--ink-faint)' : 'var(--ink)',
                  cursor: players.length >= MAX_PLAYERS ? 'not-allowed' : 'pointer',
                  fontSize: 10, padding: '2px 8px',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                + 新增 Bot
              </button>
            )}
          </div>

          {/* 表頭 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '68px 1fr 64px 48px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 10, color: 'var(--ink-muted)',
            fontFamily: 'var(--font-mono)',
            textAlign: 'left',
          }}>
            {['編號', '暱稱 / 角色', '狀態', ''].map((h, i) => (
              <div key={i} style={{ padding: '4px 8px', borderRight: i < 3 ? '1px solid var(--line-soft)' : 'none' }}>
                {h}
              </div>
            ))}
          </div>

          {/* 玩家列 */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {players.map((p, rowIdx) => {
              const ch = ALL_CHARACTERS.find((c) => c.id === p.characterId);
              const isMe = p.id === socket.id;
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '68px 1fr 64px 48px',
                    fontSize: 11, color: 'var(--ink)',
                    background: isMe ? 'var(--bg-paper-alt)' : (rowIdx % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)'),
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <div style={{
                    padding: '6px 8px',
                    borderRight: '1px solid var(--line-soft)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-muted)',
                    display: 'flex', alignItems: 'center',
                  }}>
                    SH-{shortSheetId(p.id.replace(/^bot-/, 'BOT'))}
                  </div>
                  <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {p.isHost && (
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', background: 'var(--accent)', color: 'var(--bg-paper)', padding: '0 4px' }}>HOST</span>
                      )}
                      {p.isBot && (
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', background: 'var(--bg-chrome-dark)', color: 'var(--bg-paper)', padding: '0 4px' }}>BOT</span>
                      )}
                      <span style={{ fontWeight: isMe ? 700 : 400 }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {ch ? `${ch.name} · ${ch.type === 'cat' ? '貓方' : '狗方'}` : '#N/A'}
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 8px', borderRight: '1px solid var(--line-soft)',
                    fontSize: 10, fontFamily: 'var(--font-mono)',
                    color: p.ready ? 'var(--accent)' : 'var(--ink-muted)',
                    display: 'flex', alignItems: 'center',
                    fontWeight: p.ready ? 600 : 400,
                  }}>
                    {p.ready ? '就緒' : '編輯中'}
                  </div>
                  <div style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {me.isHost && p.isBot && (
                      <button
                        onClick={() => handleRemoveBot(p.id)}
                        title="移除"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--line)',
                          color: 'var(--ink-muted)',
                          fontSize: 10,
                          padding: '1px 5px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-ui)',
                        }}
                      >
                        —
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, MAX_PLAYERS - players.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  display: 'grid', gridTemplateColumns: '68px 1fr 64px 48px',
                  fontSize: 11, color: 'var(--ink-faint)',
                  borderBottom: '1px solid var(--line-soft)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)' }}>#N/A</div>
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)', fontStyle: 'italic' }}>
                  — 空格 —
                </div>
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)' }}>—</div>
                <div />
              </div>
            ))}
          </div>

          {/* 底部按鈕 */}
          <div style={{
            borderTop: '1px solid var(--line-soft)',
            background: 'var(--bg-paper-alt)',
            padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {me.isHost && (
              <button
                onClick={handleStart}
                disabled={!canStart}
                style={{
                  padding: '7px 0',
                  background: canStart ? 'var(--accent)' : 'var(--bg-chrome)',
                  color: canStart ? 'var(--bg-paper)' : 'var(--ink-muted)',
                  border: '1px solid var(--line)',
                  fontSize: 12, fontWeight: 600,
                  cursor: canStart ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                開始對戰
              </button>
            )}
            {!canStart && startDisabledReason && me.isHost && (
              <div style={{ fontSize: 10, color: 'var(--ink-muted)', textAlign: 'center' }}>
                {startDisabledReason}
              </div>
            )}
            <button
              onClick={handleReady}
              style={{
                padding: '6px 0',
                background: me.ready ? 'var(--bg-input)' : 'var(--accent)',
                color: me.ready ? 'var(--ink)' : 'var(--bg-paper)',
                border: '1px solid var(--line)',
                fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {me.ready ? '取消準備' : '按下準備 (F5)'}
            </button>
            <button
              onClick={handleBack}
              style={{
                padding: '5px 0',
                background: 'transparent',
                color: 'var(--ink-soft)',
                border: '1px solid var(--line-soft)',
                fontSize: 10,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              離開房間
            </button>
          </div>
        </div>

        {/* ==== 右：角色選擇網格 + 偽裝進度條 ==== */}
        <div style={{
          display: 'flex', flexDirection: 'column', minHeight: 0,
          overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PickerSection
              title="狗方 / DOG DEPT."
              formula={`=COUNTA(B2:B${1 + DOG_BREEDS.length})`}
              characters={DOG_BREEDS}
              me={me}
              otherPickers={otherPickers}
              onPick={handlePick}
            />
            <PickerSection
              title="貓方 / CAT DEPT."
              formula={`=COUNTA(C2:C${1 + CAT_BREEDS.length})`}
              characters={CAT_BREEDS}
              me={me}
              otherPickers={otherPickers}
              onPick={handlePick}
            />
          </div>

          {/* 偽裝進度條（未 canStart 時顯示） */}
          {!canStart && (
            <div style={{ padding: '0 12px 12px 12px' }}>
              <ProgressStripes
                label={`正在重新計算 1,247 個儲存格 — 已解析 ${readyCount}/${players.length} 位參賽者 · 預估剩餘 < 20 秒`}
              />
            </div>
          )}
        </div>
      </div>
    </SheetWindow>
  );
}
