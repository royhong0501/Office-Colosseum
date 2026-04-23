import { useState, useMemo, useEffect } from 'react';
import { MSG, getCharacterById } from '@office-colosseum/shared';
import {
  getStoredPlayerName, setPlayerName, getPlayerUuid, PLAYER_NAME_MAX,
} from '../lib/playerIdentity.js';
import { getSocket } from '../net/socket.js';
import SheetWindow from '../components/SheetWindow.jsx';

function formatShortId(id) {
  return id ? id.split('-')[1]?.slice(0, 4).toUpperCase() ?? id.slice(-4).toUpperCase() : '----';
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd}`;
}

function computePlayerStats(records, uuid) {
  if (!records || !uuid) return null;
  const rec = records.players?.[uuid];
  if (!rec) return null;
  const winRate = rec.matches > 0 ? (rec.wins / rec.matches) * 100 : 0;
  let favId = null, favCount = 0;
  for (const [id, r] of Object.entries(rec.byCharacter ?? {})) {
    if (r.matches > favCount) { favCount = r.matches; favId = id; }
  }
  const favChar = favId ? getCharacterById(favId)?.name ?? favId : null;
  return {
    matches: rec.matches ?? 0,
    winRate,
    favChar,
    favCount,
  };
}

function computeRecentFiles(records, limit = 4) {
  const matches = (records?.matches ?? []).slice().sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  return matches.slice(0, limit).map((m) => {
    const date = new Date(m.endedAt ?? Date.now());
    const q = Math.floor(date.getMonth() / 3) + 1;
    const sheetId = formatShortId(m.id);
    const participants = m.participants?.length ?? 0;
    return {
      name: `${date.getFullYear()}Q${q}_對戰紀錄_SHEET-${sheetId}.xlsx`,
      date: formatDate(m.endedAt),
      size: `${(participants * 0.3 + 0.8).toFixed(1)} MB`,
      winnerName: m.winnerName ?? '—',
    };
  });
}

const TEMPLATES = [
  {
    id: 'online',
    title: '連線對戰',
    badge: 'ONLINE',
    formula: '=VLOOKUP(ROOM, LOBBY, 2, FALSE)',
    desc: '加入多人競技場，2–8 位同事共用一份工作表',
  },
  {
    id: 'characters',
    title: '角色資料庫',
    badge: 'OFFLINE',
    formula: '=QUERY(CHARACTERS, "SELECT *")',
    desc: '瀏覽 20 位員工完整能力評估',
  },
  {
    id: 'history',
    title: '戰績報表',
    badge: 'REPORT',
    formula: '=PIVOT(MY_MATCHES)',
    desc: '個人 KPI 儀表板與歷史對戰資料',
  },
];

function TemplateThumbnail({ id }) {
  // 用純 SVG 為每種範本畫個簡化示意圖，避免任何 emoji 或彩色 PNG
  const stripe = 'repeating-linear-gradient(135deg, var(--bg-paper-alt) 0 8px, var(--bg-paper) 8px 16px)';
  if (id === 'online') {
    return (
      <div style={{ width: '100%', height: 120, background: stripe, border: '1px solid var(--line-soft)', position: 'relative' }}>
        <svg viewBox="0 0 160 120" width="100%" height="100%" preserveAspectRatio="none">
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`h${i}`} x1="0" x2="160" y1={i * 12} y2={i * 12} stroke="var(--line-soft)" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} y1="0" y2="120" x1={i * 12} x2={i * 12} stroke="var(--line-soft)" strokeWidth="0.5" />
          ))}
          {[[36, 36], [96, 48], [72, 84], [120, 72]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="10" height="10" fill={i === 0 ? 'var(--accent)' : 'var(--ink-soft)'} />
          ))}
          <rect x="60" y="60" width="44" height="20" fill="none" stroke="var(--accent-danger)" strokeWidth="1" strokeDasharray="3,2" />
        </svg>
      </div>
    );
  }
  if (id === 'characters') {
    return (
      <div style={{ width: '100%', height: 120, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
        <svg viewBox="0 0 160 120" width="100%" height="100%" preserveAspectRatio="none">
          {Array.from({ length: 8 }).map((_, i) => (
            <g key={i}>
              <rect x="6" y={6 + i * 14} width="14" height="10" fill="var(--bg-cell-header)" stroke="var(--line-soft)" strokeWidth="0.5" />
              <rect x="22" y={6 + i * 14} width="130" height="10" fill="var(--bg-paper)" stroke="var(--line-soft)" strokeWidth="0.5" />
              <rect x="24" y={8 + i * 14} width={30 + (i * 11) % 60} height="6" fill={i % 2 === 0 ? 'var(--accent)' : 'var(--ink-soft)'} />
            </g>
          ))}
        </svg>
      </div>
    );
  }
  // history — 折線圖
  return (
    <div style={{ width: '100%', height: 120, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
      <svg viewBox="0 0 160 120" width="100%" height="100%" preserveAspectRatio="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`g${i}`} x1="10" x2="154" y1={20 + i * 16} y2={20 + i * 16} stroke="var(--line-soft)" strokeWidth="0.5" />
        ))}
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.6"
          points="12,88 32,70 52,74 72,48 92,58 112,34 132,44 152,22"
        />
        {[ [12,88],[32,70],[52,74],[72,48],[92,58],[112,34],[132,44],[152,22] ].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="var(--accent)" />
        ))}
      </svg>
    </div>
  );
}

export default function MainMenu({ onStart, onOpenCharacters, onOpenHistory }) {
  const [name, setName] = useState(getStoredPlayerName());
  const [records, setRecords] = useState(null);
  const [hoveredTpl, setHoveredTpl] = useState(null);
  const placeholder = useMemo(
    () => `Player-${Math.random().toString(36).slice(2, 6)}`,
    [],
  );
  const uuid = useMemo(() => getPlayerUuid(), []);
  const commitName = () => setPlayerName(name);
  const displayName = name?.trim() || placeholder;

  useEffect(() => {
    const socket = getSocket();
    const onRecords = (data) => setRecords(data ?? null);
    const request = () => socket.emit(MSG.GET_RECORDS);
    socket.on(MSG.RECORDS, onRecords);
    if (socket.connected) request();
    else socket.once('connect', request);
    return () => {
      socket.off(MSG.RECORDS, onRecords);
      socket.off('connect', request);
    };
  }, []);

  const stats = computePlayerStats(records, uuid);
  const recentFiles = computeRecentFiles(records, 4);

  const handleTemplate = (id) => {
    if (id === 'online') onStart?.();
    else if (id === 'characters') onOpenCharacters?.();
    else if (id === 'history') onOpenHistory?.();
  };

  return (
    <SheetWindow
      fileName="新增工作表.xlsx — 新增"
      cellRef="A1"
      formula={`=WELCOME("${displayName}")`}
      tabs={[
        { id: 'new', label: '新增' },
        { id: 'open', label: '開啟' },
        { id: 'main', label: '主選單' },
      ]}
      activeTab="new"
      onTabSelect={(id) => {
        if (id === 'open') onStart?.();
      }}
      statusLeft="就緒 — 請選擇範本以建立新檔案"
      statusRight={stats
        ? `範本數: 3 | 總場次: ${stats.matches} | 常用: ${stats.favChar ?? '—'}`
        : '範本數: 3 | 尚無戰績'}
      fullscreen
    >
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '32px 48px',
        display: 'flex', flexDirection: 'column', gap: 32,
        background: 'var(--bg-paper)',
      }}>
        {/* Hero 區：左右兩欄 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{
              fontSize: 42, fontWeight: 600, color: 'var(--ink)',
              letterSpacing: 1, lineHeight: 1.15, marginBottom: 12,
            }}>
              歡迎回來，<span style={{ fontWeight: 300 }}>{displayName}。</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.7, maxWidth: 560 }}>
              選擇一個範本以開始新的工作表。
              你的上一份檔案
              <span style={{ color: 'var(--accent-link)', margin: '0 4px' }}>
                「{recentFiles[0]?.name ?? 'Q1_營收預測_v3.xlsx'}」
              </span>
              已自動儲存於雲端。按 Ctrl+N 開新檔，或隨時按 Esc 切換至季度報表。
            </div>
          </div>

          {/* Player Card */}
          <div style={{
            background: 'var(--bg-paper-alt)',
            border: '1px solid var(--line-soft)',
            padding: '18px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{
              fontSize: 10, color: 'var(--ink-muted)',
              display: 'flex', alignItems: 'center', gap: 6,
              letterSpacing: 1,
            }}>
              <span style={{
                background: 'var(--accent)', color: 'var(--bg-paper)',
                padding: '1px 6px', fontSize: 9, fontFamily: 'var(--font-mono)',
              }}>fx</span>
              <span>使用者身分 / PLAYER CARD</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48, height: 48,
                background: 'var(--bg-chrome)',
                border: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--ink-soft)',
              }}>
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                  ID: {uuid.slice(0, 8)}
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              {[
                { label: '場次', value: stats?.matches ?? 0 },
                { label: '勝率', value: stats ? `${stats.winRate.toFixed(0)}%` : '—' },
                { label: '常用', value: stats?.favChar ?? '—' },
              ].map((m, i) => (
                <div key={i} style={{
                  background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
                  padding: '6px 8px',
                }}>
                  <div style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, color: 'var(--ink-muted)', marginTop: 4,
            }}>
              <span>編輯名稱</span>
              <input
                value={name}
                placeholder={placeholder}
                maxLength={PLAYER_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); e.currentTarget.blur(); } }}
                style={{
                  flex: 1,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--line-soft)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  padding: '4px 6px', outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* 三張大範本縮圖 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              onMouseEnter={() => setHoveredTpl(tpl.id)}
              onMouseLeave={() => setHoveredTpl(null)}
              onClick={() => handleTemplate(tpl.id)}
              style={{
                background: 'var(--bg-paper-alt)',
                border: `1px solid ${hoveredTpl === tpl.id ? 'var(--accent)' : 'var(--line-soft)'}`,
                padding: 14,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'border-color 0.1s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{tpl.title}</div>
                <div style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  color: 'var(--bg-paper)', background: 'var(--accent)',
                  padding: '1px 6px', letterSpacing: 1,
                }}>{tpl.badge}</div>
              </div>
              <TemplateThumbnail id={tpl.id} />
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                {tpl.desc}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--accent-link)',
                borderTop: '1px dashed var(--line-soft)',
                paddingTop: 6,
              }}>
                {tpl.formula}
              </div>
            </div>
          ))}
        </div>

        {/* 最近檔案 + 快捷鍵 */}
        <div style={{
          border: '1px solid var(--line-soft)',
          background: 'var(--bg-input)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600,
          }}>
            <span>最近開啟的檔案</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
              Ctrl+N 新增 / Ctrl+O 開啟 / Esc 隱藏視窗
            </span>
          </div>
          {recentFiles.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 11, color: 'var(--ink-muted)' }}>
              #N/A — 尚無近期檔案，完成一場對戰後會在此顯示
            </div>
          ) : (
            recentFiles.map((f, i) => (
              <div
                key={i}
                onClick={() => onOpenHistory?.()}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 80px 120px',
                  padding: '8px 12px', fontSize: 11,
                  borderBottom: i < recentFiles.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>{f.name}</span>
                <span style={{ color: 'var(--ink-muted)' }}>{f.date}</span>
                <span style={{ color: 'var(--ink-muted)' }}>{f.size}</span>
                <span style={{ color: 'var(--ink-soft)', textAlign: 'right' }}>勝者: {f.winnerName}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </SheetWindow>
  );
}
