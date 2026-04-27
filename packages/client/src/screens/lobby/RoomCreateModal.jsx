// 創房 modal — Excel「插入」對話框風格。
// 樣式仿 screens/battle/br/MapSelect.jsx：浮層 + 縮圖 + 大預覽。
//
// 內容：
//   - 房名（24 字內）
//   - MODE（3 模式 radio cards）
//   - MAP（僅 BR；5 張地圖卡片預覽）
//   - CAPACITY（2/4/6/8）
//   - 私人房 checkbox + 密碼 input（私人才出現）
//
// 提交 → onCreate({ roomName, mode, mapId, capacity, isPrivate, password })。

import { useState, useMemo } from 'react';
import {
  MAPS, ARENA_COLS, ARENA_ROWS,
} from '@office-colosseum/shared/src/games/br/index.js';
import { GAME_TYPES, DEFAULT_GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS } from '@office-colosseum/shared';

const MODE_META = {
  'battle-royale': { label: '街頭混戰', desc: '射擊 + 毒圈 + 掩體；最後存活贏', formula: '=BATTLE.ROYALE()' },
  'items':         { label: '道具戰',   desc: 'HP+MP 雙資源；5 種儲存格技能', formula: '=ITEMS()' },
  'territory':     { label: '領地戰',   desc: '塗色 + flood fill；佔地最多隊贏', formula: '=TERRITORY()' },
};

function MiniMap({ map }) {
  const coverRects = (map?.covers ?? []).map(([c, r, w, h], i) => (
    <rect key={`cv-${i}`} x={c} y={r} width={w} height={h}
          fill="var(--accent)" opacity={0.7}
          stroke="var(--line)" strokeWidth={0.04} />
  ));
  const poison = [];
  for (let c = 0; c < ARENA_COLS; c++) {
    poison.push(<rect key={`pt-${c}`} x={c} y={0} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
    poison.push(<rect key={`pb-${c}`} x={c} y={ARENA_ROWS - 1} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
  }
  for (let r = 0; r < ARENA_ROWS; r++) {
    poison.push(<rect key={`pl-${r}`} x={0} y={r} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
    poison.push(<rect key={`pr-${r}`} x={ARENA_COLS - 1} y={r} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
  }
  return (
    <svg viewBox={`0 0 ${ARENA_COLS} ${ARENA_ROWS}`} preserveAspectRatio="xMidYMid meet"
         style={{ width: '100%', height: '100%', background: 'var(--bg-input)' }}>
      {Array.from({ length: ARENA_COLS + 1 }).map((_, i) => (
        <line key={`v-${i}`} x1={i} x2={i} y1={0} y2={ARENA_ROWS} stroke="var(--line-soft)" strokeWidth={0.02} />
      ))}
      {Array.from({ length: ARENA_ROWS + 1 }).map((_, i) => (
        <line key={`h-${i}`} x1={0} x2={ARENA_COLS} y1={i} y2={i} stroke="var(--line-soft)" strokeWidth={0.02} />
      ))}
      {poison}
      {coverRects}
    </svg>
  );
}

const CAPACITY_OPTIONS = [2, 4, 6, 8].filter(n => n >= MIN_PLAYERS && n <= MAX_PLAYERS);

export default function RoomCreateModal({ defaultName = '', onCreate, onClose }) {
  const [roomName, setRoomName] = useState(defaultName);
  const [mode, setMode] = useState(DEFAULT_GAME_TYPE);
  const [mapIdx, setMapIdx] = useState(0);
  const [capacity, setCapacity] = useState(MAX_PLAYERS);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');

  const selectedMap = MAPS[mapIdx] ?? MAPS[0];

  const canSubmit = useMemo(() => {
    if (isPrivate && password.trim().length === 0) return false;
    return true;
  }, [isPrivate, password]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onCreate?.({
      roomName: roomName.trim() || undefined,
      mode,
      mapId: mode === 'battle-royale' ? selectedMap.id : null,
      capacity,
      isPrivate,
      password: isPrivate ? password : null,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(40, 30, 18, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720, maxWidth: '92vw',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-paper)',
          border: '1px solid var(--line)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.14)',
          fontSize: 12,
        }}
      >
        {/* 標題列 */}
        <div style={{
          padding: '7px 10px',
          background: 'var(--bg-chrome)',
          borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span><span className="fn">=INSERT.ROOM</span>() — 新增對戰房間</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--ink-muted)' }}>×</span>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} style={{
          flex: 1, overflowY: 'auto',
          padding: '14px 18px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* 房名 */}
          <Field label="ROOM NAME">
            <input
              autoFocus
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="留空自動命名「房間-N」"
              maxLength={24}
              style={inputStyle}
            />
          </Field>

          {/* 模式 */}
          <Field label="MODE">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {GAME_TYPES.map((g) => {
                const meta = MODE_META[g];
                const active = mode === g;
                return (
                  <div
                    key={g}
                    onClick={() => setMode(g)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--line-soft)'}`,
                      background: active ? 'var(--bg-paper-alt)' : 'var(--bg-paper)',
                      boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', marginTop: 2 }}>
                      {meta.formula}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.4 }}>
                      {meta.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </Field>

          {/* 地圖：只在 BR 顯示 */}
          {mode === 'battle-royale' && (
            <Field label="MAP">
              <div style={{
                display: 'grid', gridTemplateColumns: '170px 1fr',
                border: '1px solid var(--line-soft)',
                background: 'var(--bg-paper)',
              }}>
                {/* 縮圖列 */}
                <div style={{
                  borderRight: '1px solid var(--line-soft)',
                  padding: 8, maxHeight: 220, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {MAPS.map((m, i) => (
                    <div
                      key={m.id}
                      onClick={() => setMapIdx(i)}
                      style={{
                        padding: 4,
                        border: i === mapIdx ? '2px solid var(--accent-link)' : '1px solid var(--line-soft)',
                        background: 'var(--bg-paper)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ aspectRatio: '20 / 9' }}>
                        <MiniMap map={m} />
                      </div>
                      <div style={{
                        fontSize: 9.5, fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-muted)', marginTop: 3, textAlign: 'center',
                      }}>
                        MAP {String(i + 1).padStart(2, '0')} · {m.name}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 大預覽 */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--ink)' }}>
                    {selectedMap.name}
                  </div>
                  <div style={{
                    aspectRatio: '20 / 9',
                    background: 'var(--bg-paper)',
                    border: '1px solid var(--line-soft)',
                    marginBottom: 8,
                  }}>
                    <MiniMap map={selectedMap} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 6 }}>
                    {selectedMap.pitch}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(selectedMap.tags ?? []).map((t) => (
                      <span key={t} className="mc-tag">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Field>
          )}

          {/* 容量 + 私人房 + 密碼 */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
            <Field label="CAPACITY">
              <select
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10))}
                style={inputStyle}
              >
                {CAPACITY_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} 人</option>
                ))}
              </select>
            </Field>
            <Field label="ACCESS">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 30 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                  />
                  🔒 私人房（需密碼）
                </label>
                {isPrivate && (
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密碼（最多 64 字）"
                    maxLength={64}
                    style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                  />
                )}
              </div>
            </Field>
          </div>
        </form>

        {/* 底部按鈕 */}
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--line)',
          background: 'var(--bg-paper-alt)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            type="button"
            className="btn-cell"
            onClick={onClose}
            style={{ minWidth: 80, padding: '6px 14px' }}
          >取消</button>
          <button
            type="button"
            className={`btn-cell primary ${canSubmit ? '' : 'disabled'}`}
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ minWidth: 80, padding: '6px 14px' }}
          >建立</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--line-soft)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9, color: 'var(--ink-muted)', letterSpacing: 1,
        fontFamily: 'var(--font-mono)',
      }}>{label}</span>
      {children}
    </div>
  );
}
