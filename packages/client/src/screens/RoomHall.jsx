// ⚠️ 第二階段多房間預留。目前 App.jsx 沒 import 本檔；
// 單房間 singleton 時代用 screens/GameHall.jsx 做遊戲選擇，入房後直接進 Lobby。
// 切回多房間時把 App 的 `hall` screen 換回 RoomHall 即可。

import { useEffect, useState, useMemo } from 'react';
import { MSG, MAX_PLAYERS } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getStoredPlayerName } from '../lib/playerIdentity.js';
import SheetWindow from '../components/SheetWindow.jsx';

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function PhaseBadge({ phase }) {
  const isPlaying = phase === 'playing';
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        padding: '1px 6px',
        letterSpacing: 1,
        color: 'var(--bg-paper)',
        background: isPlaying ? 'var(--accent-danger)' : 'var(--accent)',
      }}
    >
      {isPlaying ? '對戰中' : '招募中'}
    </span>
  );
}

export default function RoomHall({ onEnterRoom, onBack }) {
  const [rooms, setRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const socket = getSocket();
  const playerName = getStoredPlayerName() || 'Player';

  useEffect(() => {
    const onRoomsList = (data) => setRooms(data?.rooms ?? []);
    const onRoomJoined = (payload) => onEnterRoom(payload);
    const onError = (err) => {
      console.warn('[server error]', err);
      setErrorMsg(`[${err?.code ?? 'error'}] ${err?.msg ?? '未知錯誤'}`);
      setTimeout(() => setErrorMsg(null), 3000);
    };
    const request = () => socket.emit(MSG.LIST_ROOMS);

    socket.on(MSG.ROOMS_LIST, onRoomsList);
    socket.on(MSG.ROOM_JOINED, onRoomJoined);
    socket.on(MSG.ERROR, onError);
    if (socket.connected) request();
    else socket.once('connect', request);

    return () => {
      socket.off(MSG.ROOMS_LIST, onRoomsList);
      socket.off(MSG.ROOM_JOINED, onRoomJoined);
      socket.off(MSG.ERROR, onError);
      socket.off('connect', request);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    socket.emit(MSG.CREATE_ROOM, { roomName: newRoomName });
  };
  const handleJoin = (roomId) => {
    socket.emit(MSG.JOIN_ROOM, { roomId });
  };
  const handleRefresh = () => socket.emit(MSG.LIST_ROOMS);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [rooms],
  );

  const canJoin = (r) => r.phase === 'lobby' && r.playerCount < r.maxPlayers;

  return (
    <SheetWindow
      fileName={`對戰大廳.xlsx — ${playerName}`}
      cellRef="A1"
      formula="=QUERY(ROOMS, &quot;SELECT * WHERE STATUS='OPEN'&quot;)"
      tabs={[
        { id: 'main', label: '主選單' },
        { id: 'hall', label: '對戰大廳' },
      ]}
      activeTab="hall"
      onTabSelect={(id) => { if (id === 'main') onBack(); }}
      statusLeft={`就緒 — 共 ${sortedRooms.length} 間房間`}
      statusRight={`最大容量 ${MAX_PLAYERS} 人 | 同時多房並行`}
      fullscreen
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 建房區 */}
        <div style={{
          border: '1px solid var(--line-soft)',
          background: 'var(--bg-input)',
        }}>
          <div style={{
            padding: '6px 10px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 11, color: 'var(--ink-soft)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600 }}>新增對戰房間</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
              =INSERT.ROW(ROOMS)
            </span>
          </div>
          <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                style={{
                  padding: '6px 14px',
                  background: 'var(--accent)',
                  color: 'var(--bg-paper)',
                  border: '1px solid var(--line)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                + 建立新房間
              </button>
            ) : (
              <>
                <input
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder={`${playerName} 的房間`}
                  maxLength={24}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'var(--bg-paper)',
                    border: '1px solid var(--line-soft)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    padding: '5px 8px', outline: 'none',
                  }}
                />
                <button
                  onClick={handleCreate}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--accent)',
                    color: 'var(--bg-paper)',
                    border: '1px solid var(--line)',
                    fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  建立
                </button>
                <button
                  onClick={() => { setCreating(false); setNewRoomName(''); }}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--bg-input)',
                    color: 'var(--ink-soft)',
                    border: '1px solid var(--line-soft)',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  取消
                </button>
              </>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleRefresh}
              title="重新整理房間列表"
              style={{
                padding: '5px 10px',
                background: 'var(--bg-paper)',
                color: 'var(--ink-soft)',
                border: '1px solid var(--line-soft)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              重新整理
            </button>
          </div>
          {errorMsg && (
            <div style={{
              padding: '6px 12px',
              borderTop: '1px solid var(--line-soft)',
              background: 'var(--bg-paper-alt)',
              fontSize: 11,
              color: 'var(--accent-danger)',
              fontFamily: 'var(--font-mono)',
            }}>
              {errorMsg}
            </div>
          )}
        </div>

        {/* 房間列表 */}
        <div style={{
          border: '1px solid var(--line-soft)',
          background: 'var(--bg-input)',
          flex: 1,
          display: 'flex', flexDirection: 'column',
          minHeight: 200,
        }}>
          <div style={{
            padding: '6px 10px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600,
          }}>
            工作表：房間列表 (ROOMS)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 90px 90px 100px 90px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
          }}>
            {['編號', '房間名稱', '人數', '狀態', '建立時間', ''].map((h, i) => (
              <div key={i} style={{
                padding: '4px 8px',
                borderRight: i < 5 ? '1px solid var(--line-soft)' : 'none',
                textAlign: i === 2 || i === 3 ? 'center' : 'left',
              }}>{h}</div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedRooms.length === 0 ? (
              <div style={{
                padding: 40, textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--ink-muted)',
              }}>
                <div style={{ fontSize: 28, color: 'var(--ink-faint)', marginBottom: 8 }}>#EMPTY</div>
                <div>目前沒有房間，點上方「建立新房間」開一場</div>
              </div>
            ) : sortedRooms.map((r, i) => (
              <div key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 90px 90px 100px 90px',
                fontSize: 11, fontFamily: 'var(--font-mono)',
                background: i % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)',
                borderBottom: '1px solid var(--line-soft)',
                alignItems: 'center',
              }}>
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>
                  SH-{r.id.slice(5).padStart(4, '0').toUpperCase()}
                </div>
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink)' }}>
                  {r.name}
                </div>
                <div style={{
                  padding: '6px 8px', borderRight: '1px solid var(--line-soft)',
                  textAlign: 'center',
                  color: r.playerCount >= r.maxPlayers ? 'var(--accent-danger)' : 'var(--ink)',
                }}>
                  {r.playerCount} / {r.maxPlayers}
                </div>
                <div style={{
                  padding: '6px 8px', borderRight: '1px solid var(--line-soft)',
                  textAlign: 'center',
                }}>
                  <PhaseBadge phase={r.phase} />
                </div>
                <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>
                  {fmtTime(r.createdAt)}
                </div>
                <div style={{ padding: '4px 6px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleJoin(r.id)}
                    disabled={!canJoin(r)}
                    style={{
                      padding: '3px 12px',
                      background: canJoin(r) ? 'var(--accent)' : 'var(--bg-chrome)',
                      color: canJoin(r) ? 'var(--bg-paper)' : 'var(--ink-muted)',
                      border: '1px solid var(--line)',
                      fontSize: 10, fontWeight: 600,
                      cursor: canJoin(r) ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    加入
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-input)',
              color: 'var(--ink-soft)',
              border: '1px solid var(--line-soft)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            回主選單
          </button>
        </div>
      </div>
    </SheetWindow>
  );
}
