import { useEffect, useMemo, useRef, useState } from 'react';
import { MSG, getCharacterById, TICK_MS } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getPlayerUuid, getStoredPlayerName } from '../lib/playerIdentity.js';
import SheetWindow from '../components/SheetWindow.jsx';

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(ticks) {
  const sec = Math.floor((ticks * TICK_MS) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPct(wins, matches) {
  if (!matches) return '—';
  return `${((wins / matches) * 100).toFixed(1)}%`;
}

function topCharacter(byCharacter) {
  let best = null;
  for (const [id, rec] of Object.entries(byCharacter ?? {})) {
    if (!best || rec.matches > best.matches) best = { id, ...rec };
  }
  return best;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--bg-paper-alt)',
      border: '1px solid var(--line-soft)',
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LineChart({ matches, myUuid }) {
  // X 軸：最近 N 場，最早 → 最新
  const series = matches
    .slice()
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
    .map((m) => {
      const mine = m.participants?.find((p) => p.uuid === myUuid);
      return {
        matchId: m.id,
        endedAt: m.endedAt,
        dmg: mine?.dmgDealt ?? 0,
        isWin: mine?.isWinner ?? false,
      };
    });

  // 量測容器寬度，讓 viewBox 寬度 = 實際 render 寬度，
  // 避免 preserveAspectRatio="none" 把文字橫向拉扁。
  const containerRef = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.max(320, Math.floor(w)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const height = 260;
  const padL = 40, padR = 12, padT = 12, padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const hasData = series.length > 0;
  const maxDmg = Math.max(1, ...series.map((s) => s.dmg));
  const niceMax = Math.ceil(maxDmg / 50) * 50 || 50;

  const x = (i) => padL + (series.length > 1 ? (i / (series.length - 1)) * innerW : innerW / 2);
  const y = (v) => padT + innerH - (v / niceMax) * innerH;

  const polyline = series.map((s, i) => `${x(i).toFixed(1)},${y(s.dmg).toFixed(1)}`).join(' ');

  return (
    <div ref={containerRef} style={{
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
        <span style={{ fontWeight: 600 }}>近 {series.length} 場傷害輸出趨勢</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
          =CHART(D2:D{series.length + 1}, &quot;line&quot;)
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {/* 斜紋底 */}
        <defs>
          <pattern id="gridStripes" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--bg-input)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--line-soft)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="url(#gridStripes)" />
        {/* Y 軸格線 */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <g key={i}>
            <line
              x1={padL} x2={padL + innerW}
              y1={padT + innerH * (1 - r)} y2={padT + innerH * (1 - r)}
              stroke="var(--line-soft)" strokeWidth="0.5"
            />
            <text
              x={padL - 6} y={padT + innerH * (1 - r) + 3}
              textAnchor="end" fontSize="9" fontFamily="var(--font-mono)"
              fill="var(--ink-muted)"
            >
              {Math.round(niceMax * r)}
            </text>
          </g>
        ))}
        {/* X 軸 */}
        <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="var(--line)" strokeWidth="0.6" />
        {series.length > 0 && series.map((s, i) => (
          <text
            key={i}
            x={x(i)} y={height - 6}
            textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)"
            fill="var(--ink-muted)"
          >
            {`#${i + 1}`}
          </text>
        ))}
        {/* 折線 */}
        {hasData && (
          <polyline fill="none" stroke="var(--accent)" strokeWidth="1.6" points={polyline} />
        )}
        {/* 資料點 */}
        {series.map((s, i) => (
          <circle
            key={s.matchId}
            cx={x(i)} cy={y(s.dmg)} r="3"
            fill={s.isWin ? 'var(--accent)' : 'var(--bg-paper)'}
            stroke="var(--accent)" strokeWidth="1.2"
          />
        ))}
        {!hasData && (
          <text x={width / 2} y={height / 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink-muted)">
            #N/A — 尚無資料
          </text>
        )}
      </svg>
    </div>
  );
}

function CharacterUsage({ me }) {
  const list = Object.entries(me?.byCharacter ?? {})
    .map(([id, r]) => ({ id, ...r, name: getCharacterById(id)?.name ?? id }))
    .sort((a, b) => b.matches - a.matches);
  const maxMatches = Math.max(1, ...list.map((l) => l.matches));

  return (
    <div style={{
      border: '1px solid var(--line-soft)',
      background: 'var(--bg-input)',
    }}>
      <div style={{
        padding: '6px 10px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 11, color: 'var(--ink-soft)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 600 }}>角色使用分布</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
          =COUNTIF GROUP BY 角色
        </span>
      </div>
      {list.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--ink-muted)' }}>
          #N/A — 尚未登場任何角色
        </div>
      ) : (
        list.map((l, i) => (
          <div key={l.id} style={{
            display: 'grid', gridTemplateColumns: '110px 1fr 90px',
            fontSize: 11, fontFamily: 'var(--font-mono)',
            padding: '6px 10px',
            borderBottom: i < list.length - 1 ? '1px solid var(--line-soft)' : 'none',
            alignItems: 'center',
          }}>
            <span style={{ color: 'var(--ink)' }}>{l.name}</span>
            <div style={{
              position: 'relative', height: 10,
              background: 'var(--bg-paper-alt)',
              border: '1px solid var(--line-soft)',
              marginRight: 12,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${(l.matches / maxMatches) * 100}%`,
                background: 'var(--accent)',
              }} />
            </div>
            <span style={{ textAlign: 'right', color: 'var(--ink-soft)' }}>
              {l.matches} 場 / {fmtPct(l.wins, l.matches)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function RecentMatches({ matches, myUuid }) {
  if (matches.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--ink-muted)', padding: 8, fontFamily: 'var(--font-mono)' }}>#N/A</div>;
  }
  return (
    <div style={{
      border: '1px solid var(--line-soft)',
      background: 'var(--bg-input)',
    }}>
      <div style={{
        padding: '6px 10px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600,
      }}>
        最近場次 (最多 10 場)
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '90px 90px 56px 72px 72px 64px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
      }}>
        {['時間', '角色', '結果', '傷害輸出', '傷害承受', '存活'].map((h, i) => (
          <div key={i} style={{
            padding: '4px 8px',
            borderRight: i < 5 ? '1px solid var(--line-soft)' : 'none',
            textAlign: i >= 3 ? 'right' : 'left',
          }}>{h}</div>
        ))}
      </div>
      {matches.map((m, i) => {
        const mine = m.participants?.find((p) => p.uuid === myUuid);
        const char = mine ? (getCharacterById(mine.characterId)?.name ?? mine.characterId) : '—';
        return (
          <div key={m.id} style={{
            display: 'grid',
            gridTemplateColumns: '90px 90px 56px 72px 72px 64px',
            fontSize: 11, fontFamily: 'var(--font-mono)',
            background: i % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)',
            borderBottom: '1px solid var(--line-soft)',
          }}>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>
              {fmtTime(m.endedAt)}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)' }}>
              {char}
            </div>
            <div style={{
              padding: '5px 8px', borderRight: '1px solid var(--line-soft)',
              color: mine?.isWinner ? 'var(--accent)' : mine ? 'var(--accent-danger)' : 'var(--ink-muted)',
              fontWeight: 600,
            }}>
              {mine?.isWinner ? '勝' : mine ? '負' : '觀戰'}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
              {mine?.dmgDealt?.toLocaleString() ?? '—'}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right', color: 'var(--ink-soft)' }}>
              {mine?.dmgTaken?.toLocaleString() ?? '—'}
            </div>
            <div style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--accent-link)' }}>
              {mine ? fmtDuration(mine.survivedTicks) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ rows, myUuid }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--ink-muted)', padding: 8 }}>尚無玩家資料</div>;
  }
  return (
    <div style={{ border: '1px solid var(--line-soft)', background: 'var(--bg-input)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 60px 60px 70px 110px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
      }}>
        {['#', '玩家', '場數', '勝場', '勝率', '愛用角色'].map((h, i) => (
          <div key={i} style={{
            padding: '4px 8px',
            borderRight: i < 5 ? '1px solid var(--line-soft)' : 'none',
            textAlign: i >= 2 && i <= 4 ? 'right' : 'left',
          }}>{h}</div>
        ))}
      </div>
      {rows.map((p, idx) => {
        const isMe = p.uuid === myUuid;
        const top = topCharacter(p.byCharacter);
        const topName = top ? (getCharacterById(top.id)?.name ?? top.id) : '—';
        return (
          <div key={p.uuid} style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 60px 60px 70px 110px',
            fontSize: 11, fontFamily: 'var(--font-mono)',
            background: isMe ? 'var(--bg-paper-alt)' : (idx % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)'),
            borderBottom: '1px solid var(--line-soft)',
            fontWeight: isMe ? 600 : 400,
          }}>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'center', color: 'var(--ink-muted)' }}>
              {idx + 1}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink)' }}>
              {isMe && <span style={{ color: 'var(--accent)' }}>★ </span>}
              {p.lastName}
              {isMe && <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}> (你)</span>}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
              {p.matches}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right', color: 'var(--accent)' }}>
              {p.wins}
            </div>
            <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
              {fmtPct(p.wins, p.matches)}
            </div>
            <div style={{ padding: '5px 8px', color: 'var(--ink-soft)' }}>
              {topName}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MatchHistory({ onBack }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const myUuid = useMemo(() => getPlayerUuid(), []);
  const playerName = getStoredPlayerName() || 'Player';

  useEffect(() => {
    const socket = getSocket();
    const onRecords = (data) => { setSnapshot(data); setLoading(false); };
    const requestRecords = () => socket.emit(MSG.GET_RECORDS);
    socket.on(MSG.RECORDS, onRecords);
    if (socket.connected) requestRecords();
    else socket.once('connect', requestRecords);
    return () => {
      socket.off(MSG.RECORDS, onRecords);
      socket.off('connect', requestRecords);
    };
  }, []);

  const me = snapshot?.players?.[myUuid] ?? null;
  const myTopChar = me ? topCharacter(me.byCharacter) : null;
  const myTopCharName = myTopChar
    ? (getCharacterById(myTopChar.id)?.name ?? myTopChar.id)
    : '—';
  const avgDmg = me && me.matches > 0 ? Math.round(me.dmgDealt / me.matches) : 0;

  const leaderboard = useMemo(() => {
    if (!snapshot) return [];
    return Object.values(snapshot.players)
      .sort((a, b) => (b.matches - a.matches) || ((b.wins / (b.matches || 1)) - (a.wins / (a.matches || 1))))
      .slice(0, 10);
  }, [snapshot]);

  const recentMatches = useMemo(() => {
    if (!snapshot) return [];
    return [...(snapshot.matches ?? [])].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  }, [snapshot]);

  return (
    <SheetWindow
      fileName={`個人KPI_2026Q2_${playerName}.xlsx`}
      cellRef="A1"
      formula="=PIVOT(MY_MATCHES) GROUP BY CHARACTER"
      tabs={[
        { id: 'mine', label: '我的戰績' },
        { id: 'all', label: '全部對戰' },
        { id: 'leader', label: '排行榜' },
      ]}
      activeTab={tab}
      onTabSelect={setTab}
      statusLeft={loading
        ? '讀取中…'
        : snapshot?.meta?.totalMatches
          ? `就緒 — 共 ${snapshot.meta.totalMatches} 場資料`
          : '戰績資料庫為空'}
      statusRight={me ? `總傷害: ${me.dmgDealt.toLocaleString()} | 勝率: ${fmtPct(me.wins, me.matches)}` : '—'}
      fullscreen
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
            讀取戰績中…
          </div>
        )}

        {!loading && snapshot?.meta?.totalMatches === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 42, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>#N/A</div>
            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginTop: 10 }}>
              尚無對戰紀錄
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.6 }}>
              完成一場 ≥ 2 真人的對戰後，資料會自動累積到這張表。
            </div>
          </div>
        )}

        {!loading && snapshot && snapshot.meta?.totalMatches > 0 && tab === 'mine' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <SummaryCard label="總場次" value={me?.matches ?? 0} sub={me ? `最近更新: ${fmtTime(me.lastSeenAt)}` : '—'} />
              <SummaryCard label="勝率" value={me ? fmtPct(me.wins, me.matches) : '—'} sub={me ? `${me.wins} 勝 / ${me.matches} 場` : ''} />
              <SummaryCard label="平均傷害輸出" value={avgDmg.toLocaleString()} sub={me ? `累計 ${me.dmgDealt.toLocaleString()}` : ''} />
              <SummaryCard label="常用角色" value={myTopCharName} sub={myTopChar ? `${myTopChar.matches} 場 · 勝率 ${fmtPct(myTopChar.wins, myTopChar.matches)}` : ''} />
            </div>

            <LineChart matches={snapshot.matches ?? []} myUuid={myUuid} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
              <CharacterUsage me={me} />
              <RecentMatches matches={recentMatches} myUuid={myUuid} />
            </div>
          </>
        )}

        {!loading && snapshot && tab === 'all' && (
          <RecentMatches matches={recentMatches} myUuid={myUuid} />
        )}

        {!loading && snapshot && tab === 'leader' && (
          <Leaderboard rows={leaderboard} myUuid={myUuid} />
        )}

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
