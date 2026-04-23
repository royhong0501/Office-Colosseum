import { useEffect, useMemo, useState } from 'react';
import { MSG, getCharacterById } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getPlayerUuid } from '../lib/playerIdentity.js';
import { excelColors } from '../theme.js';
import {
  ExcelMenuBar,
  ExcelToolbar,
  ExcelSheetTabs,
  ExcelStatusBar,
} from '../components/ExcelChrome.jsx';

function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export default function MatchHistory({ onBack }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const myUuid = useMemo(() => getPlayerUuid(), []);

  useEffect(() => {
    const socket = getSocket();
    const onRecords = (data) => {
      setSnapshot(data);
      setLoading(false);
    };
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

  // 排行榜：按場數多到少，再按勝率，取前 10
  const leaderboard = useMemo(() => {
    if (!snapshot) return [];
    return Object.values(snapshot.players)
      .sort((a, b) => (b.matches - a.matches) || ((b.wins / b.matches) - (a.wins / a.matches)))
      .slice(0, 10);
  }, [snapshot]);

  // 最近對戰：依 endedAt 降冪
  const recentMatches = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.matches].sort((a, b) => b.endedAt - a.endedAt);
  }, [snapshot]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
    }}>
      <ExcelMenuBar currentSheet="History" onNavigate={() => {}} />
      <ExcelToolbar cellRef="A1" formulaText="=COLOSSEUM.HISTORY()" />

      <div style={{
        display: 'flex', flex: 1, overflow: 'hidden', background: excelColors.cellBg,
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px', borderBottom: `2px solid ${excelColors.accent}`,
          background: excelColors.accent, color: '#F5F0E8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>戰績報表</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
              歷史對戰數據分析（最近 {snapshot?.meta?.totalMatches ?? 0} 場）
            </div>
          </div>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px', borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.15)',
              color: '#F5F0E8', fontSize: 11, cursor: 'pointer',
              fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
            }}
          >
            ← 返回主選單
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && <LoadingState />}

          {!loading && snapshot && snapshot.meta.totalMatches === 0 && (
            <EmptyState />
          )}

          {!loading && snapshot && snapshot.meta.totalMatches > 0 && (
            <>
              <SectionTitle text="我的戰績摘要" />
              <StatsGrid me={me} myTopCharName={myTopCharName} />

              <SectionTitle text="最近對戰" marginTop={24} />
              <MatchesTable matches={recentMatches} myUuid={myUuid} />

              <SectionTitle text={`排行榜 (前 ${leaderboard.length})`} marginTop={24} />
              <Leaderboard rows={leaderboard} myUuid={myUuid} />
            </>
          )}
        </div>
      </div>

      <ExcelSheetTabs
        sheets={[
          { id: 'menu', label: '主選單' },
          { id: 'history', label: '戰績報表' },
        ]}
        active="history"
        onSelect={(id) => { if (id === 'menu') onBack(); }}
      />
      <ExcelStatusBar stats={
        loading ? '讀取中…'
          : snapshot?.meta?.totalMatches
            ? `就緒 — 共 ${snapshot.meta.totalMatches} 場、${Object.keys(snapshot.players).length} 位玩家`
            : '戰績資料庫為空'
      } />
    </div>
  );
}

function SectionTitle({ text, marginTop = 0 }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color: excelColors.accent,
      marginTop, marginBottom: 10, paddingLeft: 4,
      borderLeft: `3px solid ${excelColors.accent}`,
    }}>{text}</div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: excelColors.textLight }}>
      讀取戰績中…
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, color: excelColors.cellBorder, fontFamily: 'Consolas, monospace' }}>#N/A</div>
      <div style={{ fontSize: 14, color: excelColors.text, fontWeight: 600, marginTop: 12 }}>
        尚無對戰紀錄
      </div>
      <div style={{ fontSize: 11, color: excelColors.textLight, marginTop: 8, lineHeight: 1.6 }}>
        完成一場 ≥ 2 真人的對戰後，資料會自動累積到這張表。
      </div>
    </div>
  );
}

function StatsGrid({ me, myTopCharName }) {
  const items = [
    { label: '總場數', value: me?.matches ?? 0 },
    { label: '勝場', value: me?.wins ?? 0 },
    { label: '勝率', value: me ? fmtPct(me.wins, me.matches) : '—' },
    { label: '愛用角色', value: myTopCharName },
    { label: '造成傷害', value: (me?.dmgDealt ?? 0).toLocaleString() },
    { label: '承受傷害', value: (me?.dmgTaken ?? 0).toLocaleString() },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{
          padding: 10, background: excelColors.headerBg,
          border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4,
        }}>
          <div style={{ fontSize: 10, color: excelColors.textLight, marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: excelColors.text, fontFamily: 'Consolas, monospace' }}>
            {it.value}
          </div>
        </div>
      ))}
      {!me && (
        <div style={{
          gridColumn: '1 / -1', padding: 8, fontSize: 11,
          color: excelColors.textLight, fontStyle: 'italic',
        }}>
          * 你尚未完成任何對戰（或只跟 bot 打過——那些不計戰績）
        </div>
      )}
    </div>
  );
}

function MatchesTable({ matches, myUuid }) {
  if (matches.length === 0) {
    return <div style={{ fontSize: 11, color: excelColors.textLight, padding: 8 }}>無紀錄</div>;
  }
  return (
    <div style={{ border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 80px 1fr 70px 70px 60px 60px',
        background: excelColors.headerBg, padding: '6px 10px',
        fontSize: 10, fontWeight: 700, color: excelColors.textLight,
        borderBottom: `1px solid ${excelColors.cellBorder}`,
      }}>
        <span>時間</span>
        <span>角色</span>
        <span>對戰玩家</span>
        <span style={{ textAlign: 'right' }}>造成</span>
        <span style={{ textAlign: 'right' }}>承受</span>
        <span style={{ textAlign: 'right' }}>存活</span>
        <span style={{ textAlign: 'center' }}>結果</span>
      </div>
      {matches.map((m) => {
        const mine = m.participants.find(p => p.uuid === myUuid);
        const others = m.participants.filter(p => p.uuid !== myUuid || p.isBot);
        const myChar = mine ? (getCharacterById(mine.characterId)?.name ?? mine.characterId) : '—';
        const opponents = others.map(o => {
          const charName = getCharacterById(o.characterId)?.name ?? o.characterId;
          return `${o.name}(${charName})${o.isBot ? '[BOT]' : ''}`;
        }).join(', ');
        return (
          <div key={m.id} style={{
            display: 'grid',
            gridTemplateColumns: '80px 80px 1fr 70px 70px 60px 60px',
            padding: '6px 10px', fontSize: 11,
            background: mine ? excelColors.selectedCell : 'transparent',
            borderBottom: `1px solid ${excelColors.cellBorder}44`,
            fontFamily: 'Consolas, monospace',
          }}>
            <span style={{ color: excelColors.textLight }}>{fmtTime(m.endedAt)}</span>
            <span>{myChar}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={opponents}>{opponents || '—'}</span>
            <span style={{ textAlign: 'right', color: excelColors.redAccent }}>
              {mine ? mine.dmgDealt.toLocaleString() : '—'}
            </span>
            <span style={{ textAlign: 'right' }}>
              {mine ? mine.dmgTaken.toLocaleString() : '—'}
            </span>
            <span style={{ textAlign: 'right', color: excelColors.blueAccent }}>
              {mine ? mine.survivedTicks.toLocaleString() : '—'}
            </span>
            <span style={{
              textAlign: 'center',
              color: mine?.isWinner ? excelColors.greenAccent : excelColors.textLight,
              fontWeight: mine?.isWinner ? 700 : 400,
            }}>
              {mine?.isWinner ? '🏆 勝' : mine ? '💀 敗' : '觀戰'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ rows, myUuid }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 11, color: excelColors.textLight, padding: 8 }}>無玩家資料</div>;
  }
  return (
    <div style={{ border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 70px 70px 80px 110px',
        background: excelColors.headerBg, padding: '6px 10px',
        fontSize: 10, fontWeight: 700, color: excelColors.textLight,
        borderBottom: `1px solid ${excelColors.cellBorder}`,
      }}>
        <span style={{ textAlign: 'center' }}>#</span>
        <span>玩家</span>
        <span style={{ textAlign: 'right' }}>場數</span>
        <span style={{ textAlign: 'right' }}>勝場</span>
        <span style={{ textAlign: 'right' }}>勝率</span>
        <span>愛用角色</span>
      </div>
      {rows.map((p, idx) => {
        const isMe = p.uuid === myUuid;
        const top = topCharacter(p.byCharacter);
        const topName = top ? (getCharacterById(top.id)?.name ?? top.id) : '—';
        return (
          <div key={p.uuid} style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 70px 70px 80px 110px',
            padding: '6px 10px', fontSize: 11,
            background: isMe ? excelColors.selectedCell : 'transparent',
            borderBottom: `1px solid ${excelColors.cellBorder}44`,
            fontFamily: 'Consolas, monospace',
            fontWeight: isMe ? 700 : 400,
          }}>
            <span style={{ textAlign: 'center', color: excelColors.textLight }}>{idx + 1}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isMe && <span style={{ color: excelColors.greenAccent }}>★ </span>}
              {p.lastName}
              {isMe && <span style={{ color: excelColors.textLight, fontWeight: 400 }}> (你)</span>}
            </span>
            <span style={{ textAlign: 'right' }}>{p.matches}</span>
            <span style={{ textAlign: 'right', color: excelColors.greenAccent }}>{p.wins}</span>
            <span style={{ textAlign: 'right' }}>{fmtPct(p.wins, p.matches)}</span>
            <span style={{ color: excelColors.textLight }}>{topName}</span>
          </div>
        );
      })}
    </div>
  );
}
