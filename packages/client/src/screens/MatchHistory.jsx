// 個人戰績報表 — 偽裝成 Excel 季度 KPI Dashboard。
// - 頂部 4 格跨模式總覽（場次 / 達標率 / MVP 次數 / 工時）
// - 3 個子分頁：Sheet A 大逃殺 / Sheet B 道具戰 / Sheet C 領地爭奪
//   每款各自 4 KPI + 圖表 + 雙欄
// - 底部最近場次列表，可依模式 chip 跳分頁

import { useEffect, useMemo, useState } from 'react';
import { MSG, getCharacterById, TICK_MS } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getCurrentUser } from '../lib/auth.js';
import SheetWindow from '../components/SheetWindow.jsx';

const SUB_TABS = [
  { id: 'br',   label: 'Sheet A · 大逃殺',   formula: 'BATTLE_ROYALE', gameType: 'battle-royale' },
  { id: 'item', label: 'Sheet B · 道具戰',   formula: 'ITEM_WAR',      gameType: 'items' },
  { id: 'terr', label: 'Sheet C · 領地爭奪', formula: 'TERRITORY',     gameType: 'territory' },
];
const ITEMS_SKILLS = [
  { id: 'freeze',   key: 'F1', name: '凍結窗格',     fn: '=FREEZE()',   color: '#6a8fb5' },
  { id: 'undo',     key: 'F2', name: 'Ctrl+Z 撤銷',  fn: '=UNDO()',     color: '#b59a6a' },
  { id: 'merge',    key: 'F3', name: '合併儲存格',   fn: '=MERGE()',    color: '#9e8fb0' },
  { id: 'readonly', key: 'F4', name: '唯讀模式炸彈', fn: '=READONLY()', color: '#b58a6a' },
  { id: 'validate', key: 'F5', name: '資料驗證',     fn: '=VALIDATE()', color: '#8a9e70' },
];
const MODE_CHIP_BG = {
  'battle-royale': '#e8d9c8',
  'items': '#d8dfe8',
  'territory': '#dae0cf',
};

/* ------------------------------------------------------------
   Formatters
   ------------------------------------------------------------ */
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())}`;
}
function fmtTicks(ticks) {
  const sec = Math.floor((ticks * TICK_MS) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtHours(ms) {
  if (!ms) return '0.0h';
  return `${(ms / 3600000).toFixed(1)}h`;
}
function fmtPct(num, den, decimals = 1) {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(decimals)}%`;
}
function fmtRatio(hit, total, decimals = 1) {
  if (!total) return '—';
  return `${((hit / total) * 100).toFixed(decimals)}%`;
}
function charName(id) { return getCharacterById(id)?.name ?? id ?? '—'; }
function departmentForChar(charId) {
  const c = getCharacterById(charId);
  if (!c) return '—';
  return c.type === 'cat' ? '財務部' : '工程部';
}

/* 簡易線性回歸（y = a + b·x） */
function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: ys[0] ?? 0, b: 0 };
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return { a: sy / n, b: 0 };
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

/* ------------------------------------------------------------
   Generic UI bricks
   ------------------------------------------------------------ */
function BigStat({ label, value, sub, good, span = 1 }) {
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: 'var(--bg-paper)',
      border: '1px solid var(--line-soft)',
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4, minHeight: 92,
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: good ? 'var(--accent)' : 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
          {good ? '▲ ' : ''}{sub}
        </div>
      )}
    </div>
  );
}

function WinRateBar({ wr }) {
  const pct = Math.max(0, Math.min(100, wr * 100));
  const color = pct >= 60 ? '#4f8d4f' : pct >= 50 ? '#c79a1a' : '#cc4a3a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 60, height: 10, background: 'var(--bg-input)',
        border: '1px solid var(--line-soft)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', minWidth: 42 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

/** SVG 折線圖：data = [{x, y, label?}]，含實線資料 + 虛線回歸趨勢線 + 5×5 方塊點 */
function FakeLineChart({ data, yMin = 0, yMax = 100, height = 140 }) {
  const W = 600, H = height, pad = { l: 36, r: 12, t: 8, b: 22 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  if (data.length === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        — 尚無足夠資料 —
      </div>
    );
  }
  const xMax = Math.max(1, data.length - 1);
  const xPos = (i) => pad.l + (i / xMax) * innerW;
  const yPos = (v) => pad.t + innerH * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));
  const linePts = data.map((d, i) => `${xPos(i)},${yPos(d.y)}`).join(' ');
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.y);
  const { a, b } = linearRegression(xs, ys);
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {tickVals.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={yPos(v)} y2={yPos(v)} stroke="var(--line-soft)" strokeWidth="0.5" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={yPos(v) + 3} textAnchor="end" fontSize="9" fill="var(--ink-muted)" fontFamily="var(--font-mono)">
            {Math.round(v)}{yMax === 100 ? '%' : ''}
          </text>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--ink-muted)" fontFamily="var(--font-mono)">
          {d.label ?? `#${i + 1}`}
        </text>
      ))}
      <line x1={xPos(0)} y1={yPos(a)} x2={xPos(xMax)} y2={yPos(a + b * xMax)}
        stroke="var(--ink-faint)" strokeWidth="1.2" strokeDasharray="4 3" />
      <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      {data.map((d, i) => (
        <rect key={i} x={xPos(i) - 2.5} y={yPos(d.y) - 2.5} width="5" height="5" fill="var(--accent)" />
      ))}
    </svg>
  );
}

/** SVG 縱向柱狀圖：data = [{ value, label, highlight? }] */
function BarChartVertical({ data, yMax, height = 160, accentColor = '#8a9e70', baseColor = '#b5a988' }) {
  const W = 600, H = height, pad = { l: 36, r: 12, t: 18, b: 28 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  if (data.length === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        — 尚無資料 —
      </div>
    );
  }
  const max = yMax ?? Math.max(1, ...data.map(d => d.value));
  const barW = (innerW / data.length) * 0.62;
  const gap = (innerW / data.length) * 0.38;
  const tickVals = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {tickVals.map((v, i) => {
        const y = pad.t + innerH * (1 - v / max);
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--line-soft)" strokeWidth="0.5" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--ink-muted)" fontFamily="var(--font-mono)">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + (innerW / data.length) * i + gap / 2;
        const h = innerH * (d.value / max);
        const y = pad.t + (innerH - h);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={d.highlight ? accentColor : baseColor} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="var(--ink)" fontFamily="var(--font-mono)" fontWeight="700">
              {d.value}
            </text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--ink-muted)" fontFamily="var(--font-mono)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Items 5 技能水平長條 */
function SkillsBarChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.key} style={{
            display: 'grid', gridTemplateColumns: '40px 110px 1fr 90px',
            alignItems: 'center', gap: 8, fontSize: 11,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>{d.key}</span>
            <span style={{ color: 'var(--ink)' }}>{d.name}</span>
            <div style={{ position: 'relative', height: 16, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: d.color, opacity: 0.85 }} />
              <span style={{ position: 'absolute', right: 6, top: 1, fontSize: 10, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                {d.value} 次
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-link)' }}>{d.fn}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{children}</div>
      {right && <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{right}</div>}
    </div>
  );
}

function HighlightCard({ tag, name, fn, color, stats, note }) {
  return (
    <div style={{
      background: 'var(--bg-paper)', border: '1px solid var(--line-soft)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>{tag}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{name}</span>
        <span style={{ fontSize: 11, color: 'var(--accent-link)', fontFamily: 'var(--font-mono)' }}>{fn}</span>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 2 }}>
        {stats.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{s.label}</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{
        background: '#fbf4dc', border: '1px solid #d8c990',
        padding: '4px 8px', fontSize: 10.5, color: '#5a4f1a', fontFamily: 'var(--font-mono)',
        marginTop: 'auto',
      }}>
        ※ {note}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   從 snapshot.matches 萃取資料：個人聚合 + 各 game-type 衍生
   server 不再給 byGameType，全部由 client 從 matches 算（last 20 場上限）。
   ------------------------------------------------------------ */
function myMatchesFor(matches, userId, gameType) {
  return matches
    .filter(m => m.gameType === gameType)
    .map(m => ({ ...m, mine: m.participants.find(p => p.userId === userId) }))
    .filter(m => !!m.mine)
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));  // 由舊到新
}

function aggregateGameType(myMatches) {
  const out = { matches: 0, wins: 0 };
  for (const m of myMatches) {
    out.matches++;
    if (m.mine.isWinner) out.wins++;
    const s = m.mine.stats ?? {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof v !== 'number') continue;
      out[k] = (out[k] ?? 0) + v;
    }
    out.survivedTicks = (out.survivedTicks ?? 0) + (m.mine.survivedTicks ?? 0);
  }
  return out;
}

function brTrendData(brMatches, take = 14) {
  const tail = brMatches.slice(-take);
  let wins = 0;
  return tail.map((m, i) => {
    if (m.mine.isWinner) wins++;
    return { x: i, y: ((wins / (i + 1)) * 100), label: `#${i + 1}` };
  });
}

function brMapStats(brMatches) {
  const map = new Map();
  for (const m of brMatches) {
    const id = m.config?.mapId ?? '—';
    if (!map.has(id)) map.set(id, { id, matches: 0, wins: 0, kills: 0 });
    const r = map.get(id);
    r.matches++;
    if (m.mine.isWinner) r.wins++;
    r.kills += m.mine.stats?.kills ?? 0;
  }
  return [...map.values()].sort((a, b) => b.matches - a.matches);
}

function brMapName(id) {
  // 不能 import shared/games/br/index.js（可能 sideeffect 太大），直接 hardcode 5 張地圖名對映
  const names = {
    'annual-budget': '年度預算報表',
    'gantt': '甘特圖工程進度',
    'pivot': '樞紐分析表',
    'candlestick': '股價 K 線',
    'heatmap': '銷售熱區',
  };
  return names[id] ?? id;
}

function charStatsFor(myMatches) {
  const map = new Map();
  for (const m of myMatches) {
    const id = m.mine.characterId;
    if (!id) continue;
    if (!map.has(id)) map.set(id, { id, matches: 0, wins: 0 });
    const r = map.get(id);
    r.matches++;
    if (m.mine.isWinner) r.wins++;
  }
  return [...map.values()].sort((a, b) => b.matches - a.matches);
}

function terrRecent10(terrMatches) {
  return terrMatches.slice(-10).map((m, i) => ({
    value: m.mine.stats?.teamCellsAtEnd ?? 0,
    label: `#${i + 1}`,
    highlight: false,
  }));
}

function terrTeammates(terrMatches, userId) {
  const map = new Map();
  for (const m of terrMatches) {
    const myTeamId = m.mine.stats?.teamId;
    if (myTeamId == null) continue;
    for (const p of m.participants) {
      if (p.userId === userId || !p.userId) continue;
      if (p.stats?.teamId !== myTeamId) continue;
      if (!map.has(p.userId)) map.set(p.userId, { userId: p.userId, displayName: p.displayName, characterId: p.characterId, matches: 0, wins: 0 });
      const r = map.get(p.userId);
      r.matches++;
      if (m.mine.isWinner) r.wins++;
    }
  }
  return [...map.values()].sort((a, b) => b.matches - a.matches);
}

/* ------------------------------------------------------------
   Sub-tab sections
   ------------------------------------------------------------ */
function BRSection({ matches, userId }) {
  const my = useMemo(() => myMatchesFor(matches, userId, 'battle-royale'), [matches, userId]);
  const g = useMemo(() => aggregateGameType(my), [my]);
  const trend = useMemo(() => brTrendData(my, 14), [my]);
  const mapStats = useMemo(() => brMapStats(my), [my]);
  const charStats = useMemo(() => charStatsFor(my), [my]);

  const kd = g.matches ? ((g.kills ?? 0) / g.matches).toFixed(2) : '0.00';
  const longest = my.reduce((mx, x) => Math.max(mx, x.mine.survivedTicks ?? 0), 0);
  const mvp = g.wins ?? 0;
  const charColor = (id) => (getCharacterById(id)?.type === 'cat' ? '#9e8fb0' : '#b59a6a');

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <BigStat label="場次" value={g.matches ?? 0} sub={`Q2 累計 · ${charStats.length} 種角色`} />
        <BigStat label="勝率" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} good={(g.wins ?? 0) > 0} />
        <BigStat label="平均 K/D" value={kd} sub="同位階前 15%" good={parseFloat(kd) > 1} />
        <BigStat label="最長存活 / MVP" value={`${fmtTicks(longest)} · ${mvp} ★`} sub={`本季最佳一場 · MVP ${mvp} 次`} />
      </div>

      <div>
        <SectionHeader right="近 14 場勝率趨勢（含線性回歸）">
          <span className="fn">=CHART</span>(D2:D15, &quot;line&quot;)
        </SectionHeader>
        <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <FakeLineChart data={trend} yMin={0} yMax={100} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <SectionHeader right="按地圖樞紐">
            <span className="fn">=PIVOT</span>(MATCHES) BY MAP
          </SectionHeader>
          <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 50px 110px 50px',
              padding: '6px 10px', background: 'var(--bg-cell-header)',
              borderBottom: '1px solid var(--line-soft)',
              fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            }}>
              <span>地圖</span>
              <span style={{ textAlign: 'right' }}>場</span>
              <span>勝率</span>
              <span style={{ textAlign: 'right' }}>均K</span>
            </div>
            {(mapStats.length === 0 ? [{ id: '—', matches: 0, wins: 0, kills: 0 }] : mapStats).map((r) => {
              const wr = r.matches ? r.wins / r.matches : 0;
              const avgK = r.matches ? (r.kills / r.matches).toFixed(2) : '—';
              return (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 50px 110px 50px',
                  padding: '6px 10px', alignItems: 'center',
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid var(--line-soft)',
                }}>
                  <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}>{brMapName(r.id)}</span>
                  <span style={{ color: 'var(--ink-muted)', textAlign: 'right' }}>{r.matches}</span>
                  <WinRateBar wr={wr} />
                  <span style={{ color: 'var(--ink)', textAlign: 'right' }}>{avgK}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <SectionHeader right="按角色 GROUP BY">
            <span className="fn">=COUNTIF</span> GROUP BY 角色
          </SectionHeader>
          <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 10 }}>
            {charStats.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>— 尚未使用過任何角色 —</div>
            ) : (
              <>
                {charStats.slice(0, 6).map((r) => {
                  const max = Math.max(1, ...charStats.map(x => x.matches));
                  const pct = (r.matches / max) * 100;
                  return (
                    <div key={r.id} style={{
                      display: 'grid', gridTemplateColumns: '12px 90px 1fr 60px',
                      gap: 8, alignItems: 'center', marginBottom: 4,
                    }}>
                      <span style={{ width: 10, height: 10, background: charColor(r.id), border: '1px solid var(--line)' }} />
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{charName(r.id)}</span>
                      <div style={{ height: 12, background: 'var(--bg-input)', border: '1px solid var(--line-soft)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                          position: 'absolute', inset: 0, width: `${pct}%`,
                          background: `repeating-linear-gradient(135deg, ${charColor(r.id)} 0 4px, ${charColor(r.id)}aa 4px 8px)`,
                        }} />
                      </div>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', textAlign: 'right' }}>{r.matches} 場</span>
                    </div>
                  );
                })}
                <div style={{
                  borderTop: '1px dashed var(--line-soft)', paddingTop: 6, marginTop: 8,
                  fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
                }}>
                  最愛角色：{charName(charStats[0].id)}（{charStats[0].matches} 場 · 占 {Math.round((charStats[0].matches / my.length) * 100)}%）
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ItemsSection({ matches, userId }) {
  const my = useMemo(() => myMatchesFor(matches, userId, 'items'), [matches, userId]);
  const g = useMemo(() => aggregateGameType(my), [my]);

  const skillCasts = {
    freeze: g.skill_freeze ?? 0,
    undo: g.undoUsed ?? 0,
    merge: g.skill_merge ?? 0,
    readonly: g.skill_readonly ?? 0,
    validate: g.skill_validate ?? 0,
  };
  const skillTrigs = {
    freeze: g.trig_freeze ?? 0,
    merge: g.trig_merge ?? 0,
    readonly: g.trig_readonly ?? 0,
    validate: g.trig_validate ?? 0,
  };
  const totalCast = Object.values(skillCasts).reduce((a, b) => a + b, 0);
  const totalTrig = Object.values(skillTrigs).reduce((a, b) => a + b, 0);

  const mostCast = ITEMS_SKILLS.reduce((best, s) => {
    const v = skillCasts[s.id] ?? 0;
    return (!best || v > best.value) ? { ...s, value: v } : best;
  }, null);
  const mostTrig = ITEMS_SKILLS.filter(s => s.id !== 'undo').reduce((best, s) => {
    const v = skillTrigs[s.id] ?? 0;
    return (!best || v > best.value) ? { ...s, value: v } : best;
  }, null);
  const barData = ITEMS_SKILLS.map(s => ({
    key: s.key, name: s.name, fn: s.fn, value: skillCasts[s.id] ?? 0, color: s.color,
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <BigStat label="場次" value={g.matches ?? 0} sub="Q2 累計" />
        <BigStat label="勝率" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} />
        <BigStat label="技能總施放" value={totalCast} sub={g.matches ? `平均 ${(totalCast / g.matches).toFixed(1)} / 場` : '—'} />
        <BigStat label="陷阱觸發率" value={fmtRatio(totalTrig, totalCast)} sub={`觸發 ${totalTrig} / 施 ${totalCast}`} />
      </div>

      <div>
        <SectionHeader right="技能施放頻率">
          <span className="fn">=CHART</span>(E2:E6, &quot;bar&quot;)
        </SectionHeader>
        <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 12 }}>
          <SkillsBarChart data={barData} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <HighlightCard
          tag="最常用技能 / Most Cast"
          name={mostCast?.name ?? '—'}
          fn={mostCast?.fn ?? '—'}
          color={mostCast?.color ?? 'var(--accent)'}
          stats={[
            { label: '本季施放', value: mostCast ? `${mostCast.value} 次` : '—' },
            { label: '平均', value: g.matches ? `${((mostCast?.value ?? 0) / g.matches).toFixed(1)} 次/場` : '—' },
          ]}
          note="主管認為你流程自動化使用率偏高"
        />
        <HighlightCard
          tag="最常觸發 / Top Triggerer"
          name={mostTrig?.name ?? '—'}
          fn={mostTrig?.fn ?? '—'}
          color={mostTrig?.color ?? 'var(--accent)'}
          stats={[
            { label: '本季觸發', value: mostTrig ? `${mostTrig.value} 次` : '—' },
            { label: '觸發率', value: fmtRatio(totalTrig, totalCast) },
          ]}
          note="建議列入本季關鍵績效指標"
        />
      </div>
    </>
  );
}

function TerritorySection({ matches, userId }) {
  const my = useMemo(() => myMatchesFor(matches, userId, 'territory'), [matches, userId]);
  const g = useMemo(() => aggregateGameType(my), [my]);
  const recent = useMemo(() => terrRecent10(my), [my]);
  const teammates = useMemo(() => terrTeammates(my, userId), [my, userId]);

  // 標出最高那場
  if (recent.length > 0) {
    const maxIdx = recent.reduce((mi, r, i, arr) => (r.value > arr[mi].value ? i : mi), 0);
    recent[maxIdx] = { ...recent[maxIdx], highlight: true };
  }

  const avgCells = g.matches ? Math.round((g.cellsPainted ?? 0) / g.matches) : 0;
  const maxRecord = my.reduce((max, m) => {
    const v = m.mine.stats?.teamCellsAtEnd ?? 0;
    return v > (max?.value ?? 0) ? { value: v, ts: m.endedAt } : max;
  }, null);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <BigStat label="場次" value={g.matches ?? 0} sub="Q2 累計" />
        <BigStat label="勝率（隊伍）" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} />
        <BigStat label="平均佔領格數" value={avgCells} sub={`本季塗格 ${g.cellsPainted ?? 0}`} />
        <BigStat
          label="單場最高佔領"
          value={maxRecord?.value ?? '—'}
          sub={maxRecord ? `${fmtDate(maxRecord.ts)} · 條件式格式化部` : '—'}
          good={!!maxRecord}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
        <div>
          <SectionHeader right="近 10 場（深綠＝最高）">
            <span className="fn">=CHART</span>(G2:G11, &quot;column&quot;)
          </SectionHeader>
          <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
            <BarChartVertical data={recent} accentColor="#8a9e70" baseColor="#b5a988" />
          </div>
        </div>
        <div>
          <SectionHeader right="同隊出現次數">最常搭配的同仁</SectionHeader>
          <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 50px 80px',
              padding: '6px 10px', background: 'var(--bg-cell-header)',
              borderBottom: '1px solid var(--line-soft)',
              fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            }}>
              <span>#</span>
              <span>搭檔</span>
              <span style={{ textAlign: 'right' }}>合作</span>
              <span style={{ textAlign: 'right' }}>勝率</span>
            </div>
            {teammates.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                — 尚未與其他玩家組過隊 —
              </div>
            ) : (
              teammates.slice(0, 5).map((t, i) => (
                <div key={t.userId} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 50px 80px',
                  padding: '6px 10px', alignItems: 'center',
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid var(--line-soft)',
                }}>
                  <span style={{ color: i === 0 ? '#c9a14a' : 'var(--ink-muted)' }}>{i === 0 ? '★' : i + 1}</span>
                  <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}>
                    {departmentForChar(t.characterId)} · {charName(t.characterId)}
                    <span style={{ color: 'var(--ink-muted)', marginLeft: 4 }}>（{t.displayName}）</span>
                  </span>
                  <span style={{ color: 'var(--ink-muted)', textAlign: 'right' }}>{t.matches}</span>
                  <span style={{ color: 'var(--ink)', textAlign: 'right' }}>{fmtPct(t.wins, t.matches)}</span>
                </div>
              ))
            )}
            {teammates[0] && (
              <div style={{
                padding: '6px 10px', fontSize: 10.5, color: 'var(--ink-muted)',
                fontFamily: 'var(--font-mono)', borderTop: '1px dashed var(--line-soft)',
              }}>
                最佳搭檔：{departmentForChar(teammates[0].characterId)} · {charName(teammates[0].characterId)}（{teammates[0].matches} 場合作 · {fmtPct(teammates[0].wins, teammates[0].matches)} 勝率）
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------
   最近場次（跨模式 + chip 跳分頁）
   ------------------------------------------------------------ */
function RecentMatchesSection({ matches, userId, filterGT, setFilterGT, jumpToTab }) {
  const filtered = filterGT === 'all' ? matches : matches.filter(m => m.gameType === filterGT);

  return (
    <>
      <SectionHeader right={
        <select
          value={filterGT}
          onChange={(e) => setFilterGT(e.target.value)}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
            color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11,
            padding: '2px 6px',
          }}
        >
          <option value="all">所有工作表</option>
          <option value="battle-royale">Sheet A · 大逃殺</option>
          <option value="items">Sheet B · 道具戰</option>
          <option value="territory">Sheet C · 領地</option>
        </select>
      }>
        Sheet · 最近對戰記錄 ｜ <span className="fn">=FILTER</span>(MATCH_LOG, DATE&gt;=TODAY-7)
      </SectionHeader>
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 50px 110px 1fr 70px 110px 1fr',
          padding: '6px 10px', background: 'var(--bg-cell-header)',
          borderBottom: '1px solid var(--line-soft)',
          fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
          gap: 6,
        }}>
          <span>日期</span>
          <span>時間</span>
          <span>工作表</span>
          <span>角色 · 部門</span>
          <span>結果</span>
          <span>成果</span>
          <span>備註</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '14px 10px', fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
            #N/A — 範圍內無紀錄
          </div>
        ) : (
          filtered.map((m, i) => {
            const mine = m.participants.find(p => p.userId === userId);
            const result = mine?.isWinner ? { txt: '勝', color: '#4f8d4f' } : { txt: '負', color: '#cc4a3a' };
            const tab = SUB_TABS.find(t => t.gameType === m.gameType);
            const dept = departmentForChar(mine?.characterId);
            const summary = matchSummary(m, mine);
            const note = matchNote(m, mine);
            return (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '60px 50px 110px 1fr 70px 110px 1fr',
                padding: '6px 10px', alignItems: 'center', gap: 6,
                fontSize: 11, fontFamily: 'var(--font-mono)',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--line-soft)' : 'none',
              }}>
                <span style={{ color: 'var(--ink-muted)' }}>{fmtDate(m.endedAt)}</span>
                <span style={{ color: 'var(--ink-muted)' }}>{fmtTime(m.endedAt)}</span>
                <span
                  onClick={() => tab && jumpToTab(tab.id)}
                  style={{
                    cursor: 'pointer', padding: '1px 8px',
                    background: MODE_CHIP_BG[m.gameType] ?? '#eee',
                    color: '#3a3a3a', fontSize: 10,
                    border: '1px solid var(--line-soft)',
                  }}
                >
                  {tab?.label.replace('Sheet ', '').replace(/[A-C] · /, '') ?? m.gameType}
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
                  {charName(mine?.characterId)} · {dept}
                </span>
                <span style={{
                  padding: '1px 6px', background: result.color, color: 'var(--bg-paper)',
                  fontWeight: 700, textAlign: 'center', fontSize: 10,
                }}>
                  {result.txt}
                </span>
                <span style={{ color: 'var(--ink)' }}>{summary}</span>
                <span style={{ color: 'var(--ink-muted)', fontSize: 10 }}>{note}</span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function matchSummary(m, mine) {
  const s = mine?.stats ?? {};
  if (m.gameType === 'battle-royale') return `K${s.kills ?? 0} · ${mine?.dmgDealt ?? 0}↑/${mine?.dmgTaken ?? 0}↓`;
  if (m.gameType === 'items')         return `擊殺 ${s.kills ?? 0} · 控場 ${(s.trapsPlaced ?? 0) + (s.undoUsed ?? 0)}`;
  if (m.gameType === 'territory')     return `佔領 ${s.teamCellsAtEnd ?? 0}`;
  return '—';
}
function matchNote(m, mine) {
  const s = mine?.stats ?? {};
  if (m.gameType === 'battle-royale') return brMapName(m.config?.mapId);
  if (m.gameType === 'items')         return `傷害 ${s.damageDealt ?? 0} · undo ${s.undoUsed ?? 0}`;
  if (m.gameType === 'territory')     return `塗格 ${s.cellsPainted ?? 0} · 封閉 ${s.areasCaptured ?? 0}`;
  return '';
}

/* ------------------------------------------------------------
   主元件
   ------------------------------------------------------------ */
export default function MatchHistory({ onBack }) {
  const [snapshot, setSnapshot] = useState(null);
  const [tab, setTab] = useState('br');
  const [recentFilter, setRecentFilter] = useState('all');
  const me = useMemo(() => getCurrentUser(), []);
  const userId = me?.id ?? null;

  useEffect(() => {
    const socket = getSocket();
    const onRecords = (data) => setSnapshot(data ?? null);
    const request = () => socket.emit(MSG.GET_RECORDS);
    socket.on(MSG.RECORDS, onRecords);
    if (socket.connected) request();
    else socket.once('connect', request);
    return () => {
      socket.off(MSG.RECORDS, onRecords);
      socket.off('connect', request);
    };
  }, []);

  const matches = useMemo(() => {
    return [...(snapshot?.matches ?? [])].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  }, [snapshot]);

  // 我自己跨模式的場次
  const myMatchesAll = useMemo(() => matches.filter(m => m.participants.some(p => p.userId === userId)), [matches, userId]);
  const totalMatches = myMatchesAll.length;
  const totalWins = myMatchesAll.filter(m => m.participants.find(p => p.userId === userId)?.isWinner).length;
  const totalWinRate = totalMatches ? totalWins / totalMatches : 0;
  const totalMs = myMatchesAll.reduce((s, m) => s + (m.durationMs ?? 0), 0);

  // 跨模式最愛角色（簡化：跨所有 myMatchesAll 統計 characterId）
  const allCharStats = useMemo(() => {
    const map = new Map();
    for (const m of myMatchesAll) {
      const mine = m.participants.find(p => p.userId === userId);
      if (!mine) continue;
      const id = mine.characterId;
      if (!map.has(id)) map.set(id, { id, matches: 0, wins: 0 });
      const r = map.get(id);
      r.matches++;
      if (mine.isWinner) r.wins++;
    }
    return [...map.values()].sort((a, b) => b.matches - a.matches);
  }, [myMatchesAll, userId]);

  // 最常玩的模式
  const byGameTypeCount = useMemo(() => {
    const map = new Map();
    for (const m of myMatchesAll) {
      const mine = m.participants.find(p => p.userId === userId);
      if (!mine) continue;
      if (!map.has(m.gameType)) map.set(m.gameType, { gt: m.gameType, matches: 0, wins: 0 });
      const r = map.get(m.gameType);
      r.matches++;
      if (mine.isWinner) r.wins++;
    }
    return [...map.values()].sort((a, b) => b.matches - a.matches);
  }, [myMatchesAll, userId]);
  const topGT = byGameTypeCount[0];
  const topCh = allCharStats[0];

  const currentTab = SUB_TABS.find(t => t.id === tab) ?? SUB_TABS[0];

  // 子分頁場次（顯示在 tab 上）
  const tabCounts = {
    br: byGameTypeCount.find(g => g.gt === 'battle-royale')?.matches ?? 0,
    item: byGameTypeCount.find(g => g.gt === 'items')?.matches ?? 0,
    terr: byGameTypeCount.find(g => g.gt === 'territory')?.matches ?? 0,
  };

  let modeContent;
  if (tab === 'br')   modeContent = <BRSection matches={matches} userId={userId} />;
  if (tab === 'item') modeContent = <ItemsSection matches={matches} userId={userId} />;
  if (tab === 'terr') modeContent = <TerritorySection matches={matches} userId={userId} />;

  const GAME_LABELS = { 'battle-royale': '經典大逃殺', 'items': '道具戰', 'territory': '數據領地爭奪戰' };

  return (
    <SheetWindow
      fileName="個人KPI_2026Q2_終局測試.xlsx"
      cellRef="B3"
      formula={
        <>
          <span className="fn">=DASHBOARD</span>(Q2_2026, mode=
          <span style={{ color: 'var(--accent-danger)' }}>&quot;{currentTab.formula}&quot;</span>)
        </>
      }
      tabs={[
        { id: 'main', label: '主選單' },
        { id: 'hall', label: '連線大廳' },
        { id: 'report', label: '個人報表' },
        { id: 'history', label: '歷史紀錄' },
      ]}
      activeTab="report"
      onTabSelect={(id) => { if (id === 'main') onBack?.(); }}
      statusLeft={`就緒 — 已同步 ${snapshot?.meta?.totalMatches ?? 0} 場對戰紀錄`}
      statusRight={`總達標率: ${(totalWinRate * 100).toFixed(1)}%  |  計數: ${totalMatches}  |  工作表: ${currentTab.label}`}
      fullscreen
    >
      <div style={{
        flex: 1, overflow: 'auto', padding: '20px 28px',
        display: 'flex', flexDirection: 'column', gap: 18,
        background: 'var(--bg-paper-alt)',
      }}>
        {/* 頂部跨模式總覽 */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              <span className="fn">=SUMMARIZE</span>(ALL_MODES, &quot;2026Q2&quot;)
            </div>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              ▲ 季目標達成率 {totalMatches >= 50 ? '107%' : `${Math.round((totalMatches / 50) * 100)}%`}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <BigStat label="累計場次" value={totalMatches} sub={`橫跨 ${byGameTypeCount.length} 種工作表`} />
            <BigStat label="綜合達標率" value={fmtPct(totalWins, totalMatches)} sub={totalWinRate >= 0.6 ? 'Q2 目標 60% · 已達標' : 'Q2 目標 60%'} good={totalWinRate >= 0.6} />
            <BigStat label="MVP 次數" value={totalWins} sub="同位階前 12%" good={totalWins > 0} />
            <BigStat label="本季工時" value={fmtHours(totalMs)} sub={totalMs ? `相當於 ${(totalMs / 3600000 / 160).toFixed(2)} 人月` : '—'} />
          </div>
          {(topGT || topCh) && (
            <div style={{
              marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)',
            }}>
              {topGT && (
                <div style={{ background: 'var(--bg-paper)', border: '1px dashed var(--line-soft)', padding: '6px 10px' }}>
                  最常玩的模式：<span style={{ color: 'var(--ink)', fontWeight: 600 }}>{GAME_LABELS[topGT.gt] ?? topGT.gt}</span>（{topGT.matches} 場 · 勝率 {fmtPct(topGT.wins, topGT.matches)}）
                </div>
              )}
              {topCh && (
                <div style={{ background: 'var(--bg-paper)', border: '1px dashed var(--line-soft)', padding: '6px 10px' }}>
                  最愛角色：<span style={{ color: 'var(--ink)', fontWeight: 600 }}>{charName(topCh.id)}</span>（{topCh.matches} 場 · 勝率 {fmtPct(topCh.wins, topCh.matches)}）
                </div>
              )}
            </div>
          )}
        </div>

        {/* 模式子分頁 */}
        <div>
          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid var(--line-soft)',
            background: 'var(--bg-cell-header)',
          }}>
            {SUB_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '6px 14px', cursor: 'pointer',
                    background: active ? 'var(--bg-paper)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-muted)',
                    fontWeight: active ? 600 : 400,
                    borderTop: active ? '2px solid var(--accent)' : '2px solid transparent',
                    fontSize: 12, fontFamily: 'var(--font-ui)',
                  }}
                >
                  {t.label}
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    ({tabCounts[t.id]})
                  </span>
                </div>
              );
            })}
            <div style={{ flex: 1 }} />
            <div style={{
              padding: '6px 12px', fontSize: 10.5,
              color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            }}>
              ↑ 切換工作表以檢視各部門成果
            </div>
          </div>
        </div>

        {/* 模式內容 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {modeContent}
        </div>

        {/* 最近場次（跨模式） */}
        <div>
          <RecentMatchesSection
            matches={matches}
            userId={userId}
            filterGT={recentFilter}
            setFilterGT={setRecentFilter}
            jumpToTab={(id) => setTab(id)}
          />
        </div>

        <div>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px', background: 'var(--bg-input)', color: 'var(--ink-soft)',
              border: '1px solid var(--line-soft)', fontSize: 11, cursor: 'pointer',
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
