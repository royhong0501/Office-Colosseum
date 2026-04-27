// 對戰大廳（多房列表）：仿 spec 表格欄位 ROOM ID / NAME / MODE / MAP / HOST / PLAYERS / STATUS / TIME / 操作。
// 對應 RoomManager 後端，訂閱 MSG.ROOMS_LIST 即時更新；按「+ 新增房間」用內嵌 form 創房（Phase C 改正規 modal）。
//
// 流程：menu → Lobby (此頁) → Room (單房內頁) → battle。
// 進房：emit JOIN_ROOM；server 回 ROOM_JOINED → onJoinRoom callback → App 切到 'room' screen。

import { useEffect, useMemo, useState } from 'react';
import { MSG, MAX_PLAYERS } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getCurrentUser } from '../lib/auth.js';
import SheetWindow from '../components/SheetWindow.jsx';
import RoomCreateModal from './lobby/RoomCreateModal.jsx';

const MODE_LABEL = {
  'battle-royale': '街頭混戰',
  'items': '道具戰',
  'territory': '領地戰',
};

const FILTERS = [
  { id: 'all',     label: 'ALL' },
  { id: 'waiting', label: 'WAITING' },
  { id: 'playing', label: 'PLAYING' },
];

const COLS = '88px 1.6fr 88px 110px 110px 76px 90px 70px 160px';

function shortRoomId(id) {
  if (!id) return 'R-----';
  const tail = id.replace(/^room-/, '').padStart(4, '0').slice(-4);
  return `R-${tail.toUpperCase()}`;
}

function formatElapsed(fromMs) {
  if (!fromMs) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - fromMs) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function StatusTag({ phase }) {
  const isPlaying = phase === 'playing';
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9, fontFamily: 'var(--font-mono)',
      padding: '1px 6px', letterSpacing: 0.8,
      border: `1px solid ${isPlaying ? 'var(--accent-danger)' : 'var(--accent)'}`,
      color: isPlaying ? 'var(--accent-danger)' : 'var(--accent)',
      background: 'transparent',
    }}>{isPlaying ? 'PLAYING' : 'WAITING'}</span>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 10, fontFamily: 'var(--font-mono)',
        letterSpacing: 1,
        background: active ? 'var(--accent)' : 'var(--bg-paper)',
        color: active ? 'var(--bg-paper)' : 'var(--ink-soft)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line-soft)'}`,
        cursor: 'pointer',
      }}
    >{label}</button>
  );
}

export default function Lobby({ onJoinRoom, onSpectate, onBack }) {
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningPrivate, setJoiningPrivate] = useState(null);  // {id, name} or null
  const [, setNowTick] = useState(0);    // 強制每秒 re-render 讓 TIME 欄走動
  const socket = getSocket();
  const user = getCurrentUser();

  useEffect(() => {
    const onRoomsList = (data) => setRooms(data?.rooms ?? []);
    const onRoomJoined = (payload) => onJoinRoom?.(payload);
    const onError = (err) => {
      setErrorMsg(`[${err?.code ?? 'error'}] ${err?.msg ?? '未知錯誤'}`);
      setTimeout(() => setErrorMsg(null), 3000);
    };
    const request = () => socket.emit(MSG.LIST_ROOMS);

    socket.on(MSG.ROOMS_LIST, onRoomsList);
    socket.on(MSG.ROOM_JOINED, onRoomJoined);
    socket.on(MSG.ERROR, onError);
    if (socket.connected) request();
    else { socket.connect(); socket.once('connect', request); }

    return () => {
      socket.off(MSG.ROOMS_LIST, onRoomsList);
      socket.off(MSG.ROOM_JOINED, onRoomJoined);
      socket.off(MSG.ERROR, onError);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 每秒 tick 讓 TIME 欄重算
  useEffect(() => {
    const t = setInterval(() => setNowTick(n => (n + 1) | 0), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredRooms = useMemo(() => {
    let list = [...rooms];
    if (filter === 'waiting') list = list.filter(r => r.phase === 'lobby');
    else if (filter === 'playing') list = list.filter(r => r.phase === 'playing');
    list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return list;
  }, [rooms, filter]);

  const handleCreate = (payload) => {
    socket.emit(MSG.CREATE_ROOM, payload);
    setCreateOpen(false);
  };
  const handleJoin = (r) => {
    if (r.phase !== 'lobby') return;
    if (r.playerCount >= r.capacity) return;
    if (r.isPrivate) {
      setJoiningPrivate({ id: r.id, name: r.name });
      return;
    }
    socket.emit(MSG.JOIN_ROOM, { roomId: r.id });
  };
  const handleJoinPrivate = (password) => {
    if (!joiningPrivate) return;
    socket.emit(MSG.JOIN_ROOM, { roomId: joiningPrivate.id, password });
    setJoiningPrivate(null);
  };
  const handleSpectate = (r) => {
    if (r.phase !== 'playing') return;
    onSpectate?.(r.id);   // SpectatorBattle 在 mount 時才 emit SPECTATE_ROOM，避免 race
  };

  return (
    <SheetWindow
      fileName={`對戰大廳.xlsx — ${user?.displayName ?? 'Player'}`}
      cellRef="A1"
      formula={<><span className="fn">=QUERY</span>(&quot;ROOMS&quot;, &quot;WHERE status=&apos;OPEN&apos;&quot;)</>}
      tabs={[{ id: 'hall', label: '對戰大廳' }]}
      activeTab="hall"
      statusLeft={`就緒 — 共 ${filteredRooms.length} 間 / ${rooms.length} 間`}
      statusRight={`容量上限 ${MAX_PLAYERS} 人 / 房`}
      fullscreen
    >
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        padding: '20px 28px', background: 'var(--bg-paper)', gap: 14,
      }}>
        {/* 工具列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={btn()}>← 返回主選單</button>
          <button onClick={() => socket.emit(MSG.LIST_ROOMS)} style={btn()}>重新整理</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--ink-muted)', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>
            FILTER:
          </span>
          {FILTERS.map(f => (
            <FilterChip
              key={f.id}
              active={filter === f.id}
              label={f.label}
              onClick={() => setFilter(f.id)}
            />
          ))}
          <button onClick={() => setCreateOpen(true)} style={btn('primary')}>
            + 新增房間
          </button>
        </div>

        {errorMsg && (
          <div style={{
            border: '1px solid var(--accent-danger)',
            background: 'var(--bg-paper-alt)',
            color: 'var(--accent-danger)',
            padding: '6px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
          }}>{errorMsg}</div>
        )}

        {/* 創房 modal（Phase C：取代原本的 inline form） */}
        {createOpen && (
          <RoomCreateModal
            defaultName={`${user?.displayName ?? 'Player'} 的房間`}
            onCreate={handleCreate}
            onClose={() => setCreateOpen(false)}
          />
        )}

        {/* 私人房密碼 prompt（簡化 modal） */}
        {joiningPrivate && (
          <PasswordPrompt
            roomName={joiningPrivate.name}
            onConfirm={handleJoinPrivate}
            onCancel={() => setJoiningPrivate(null)}
          />
        )}

        {/* 房間列表 */}
        <div style={{
          border: '1px solid var(--line-soft)', background: 'var(--bg-input)',
          flex: 1, display: 'flex', flexDirection: 'column', minHeight: 200,
        }}>
          {/* 表頭 */}
          <div style={{
            display: 'grid', gridTemplateColumns: COLS,
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            letterSpacing: 0.8,
          }}>
            {['ROOM ID', 'NAME', 'MODE', 'MAP', 'HOST', 'PLAYERS', 'STATUS', 'TIME', '操作'].map((h, i) => (
              <div key={i} style={{
                padding: '5px 8px',
                borderRight: i < 8 ? '1px solid var(--line-soft)' : 'none',
              }}>{h}</div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredRooms.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-muted)',
              }}>
                <div style={{ fontSize: 26, color: 'var(--ink-faint)', marginBottom: 6 }}>#EMPTY</div>
                <div>{filter === 'all' ? '目前沒有房間 — 點上方「+ 新增房間」開一場' : `沒有 ${filter.toUpperCase()} 狀態的房間`}</div>
              </div>
            ) : filteredRooms.map((r, i) => {
              const full = r.playerCount >= r.capacity;
              const canJoin = r.phase === 'lobby' && !full;
              // 私人房不允許觀戰（server 也會拒絕）
              const canSpec = r.phase === 'playing' && !r.isPrivate;
              const timerFrom = r.phase === 'playing'
                ? (r.matchStartedAt ?? r.createdAt)
                : r.createdAt;
              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: COLS,
                  fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                  background: i % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)',
                  borderBottom: '1px solid var(--line-soft)',
                  alignItems: 'center',
                }}>
                  <div style={{ padding: '6px 8px', color: 'var(--ink-muted)', borderRight: '1px solid var(--line-soft)' }}>
                    {shortRoomId(r.id)}
                  </div>
                  <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.isPrivate && <span style={{ marginRight: 4 }}>🔒</span>}
                    {r.name}
                  </div>
                  <div style={{ padding: '6px 8px', color: 'var(--ink-soft)', borderRight: '1px solid var(--line-soft)' }}>
                    {MODE_LABEL[r.mode] ?? r.mode ?? '—'}
                  </div>
                  <div style={{ padding: '6px 8px', color: 'var(--ink-muted)', borderRight: '1px solid var(--line-soft)' }}>
                    {r.mapId ?? '—'}
                  </div>
                  <div style={{ padding: '6px 8px', color: 'var(--ink-soft)', borderRight: '1px solid var(--line-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.hostUsername ?? '—'}
                  </div>
                  <div style={{
                    padding: '6px 8px', textAlign: 'center',
                    color: full ? 'var(--accent-danger)' : 'var(--ink)',
                    fontWeight: full ? 700 : 400,
                    borderRight: '1px solid var(--line-soft)',
                  }}>
                    {r.playerCount} / {r.capacity}
                  </div>
                  <div style={{ padding: '6px 8px', borderRight: '1px solid var(--line-soft)' }}>
                    <StatusTag phase={r.phase} />
                  </div>
                  <div style={{ padding: '6px 8px', color: 'var(--ink-muted)', borderRight: '1px solid var(--line-soft)' }}>
                    {formatElapsed(timerFrom)}
                  </div>
                  <div style={{ padding: '4px 6px', display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => handleSpectate(r)}
                      disabled={!canSpec}
                      style={btn(canSpec ? 'normal' : 'disabled')}
                    >觀戰</button>
                    <button
                      onClick={() => handleJoin(r)}
                      disabled={!canJoin}
                      style={btn(canJoin ? 'primary' : 'disabled')}
                    >加入</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SheetWindow>
  );
}

const inputStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
  color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12,
  padding: '5px 7px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const btn = (kind = 'normal') => ({
  padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-ui)',
  background: kind === 'primary' ? 'var(--accent)'
            : kind === 'disabled' ? 'var(--bg-chrome)'
            : 'var(--bg-paper)',
  color: kind === 'primary' ? 'var(--bg-paper)'
       : kind === 'disabled' ? 'var(--ink-muted)'
       : 'var(--ink)',
  border: `1px solid ${kind === 'primary' ? 'var(--accent)' : 'var(--line-soft)'}`,
  cursor: kind === 'disabled' ? 'not-allowed' : 'pointer',
  letterSpacing: 0.5,
});

// 私人房密碼 prompt — 簡單的小型 modal
function PasswordPrompt({ roomName, onConfirm, onCancel }) {
  const [pwd, setPwd] = useState('');
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 8500,
      background: 'rgba(40, 30, 18, 0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 360, background: 'var(--bg-paper)',
        border: '1px solid var(--line)',
        boxShadow: '0 6px 22px rgba(0,0,0,0.22)',
      }}>
        <div style={{
          padding: '7px 10px', background: 'var(--bg-chrome)',
          borderBottom: '1px solid var(--line)',
          fontSize: 12,
        }}>🔒 加入私人房 — {roomName}</div>
        <form
          onSubmit={(e) => { e.preventDefault(); onConfirm?.(pwd); }}
          style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <span style={{
            fontSize: 9, color: 'var(--ink-muted)', letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
          }}>PASSWORD</span>
          <input
            autoFocus
            type="text"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            maxLength={64}
            style={inputStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-cell" onClick={onCancel} style={{ padding: '5px 12px' }}>取消</button>
            <button type="submit" className="btn-cell primary" style={{ padding: '5px 12px' }}>加入</button>
          </div>
        </form>
      </div>
    </div>
  );
}
