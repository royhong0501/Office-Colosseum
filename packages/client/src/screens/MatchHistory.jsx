// 戰績報表（v2：多遊戲平台）
// - 頂部 tab: 全部 / BR / Items / Territory
// - 每 tab 4 張 KPI 卡（依 gameType 切換指標）
// - Recent matches：依當前 tab 篩選，表格欄位依 gameType 不同
// - 全站排行榜 6 張：擊殺王 / 塗色王 / 控場王 / 命中王 / 老將 / 勝率王
// - 角色使用分佈（跨 gameType 聚合 byCharacter）

import { useEffect, useMemo, useState } from 'react';
import { MSG, getCharacterById, TICK_MS } from '@office-colosseum/shared';
import { getMapById } from '@office-colosseum/shared/src/games/br/index.js';
import { getSocket } from '../net/socket.js';
import { getPlayerUuid } from '../lib/playerIdentity.js';
import SheetWindow from '../components/SheetWindow.jsx';

const GAME_TYPES = ['battle-royale', 'items', 'territory'];
const GAME_LABELS = {
  'battle-royale': '經典大逃殺',
  'items': '道具戰',
  'territory': '數據領地爭奪戰',
};

/* ------------------------------------------------------------
   Formatters
   ------------------------------------------------------------ */
function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDurationTicks(ticks) {
  const sec = Math.floor((ticks * TICK_MS) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDurationMs(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPct(wins, matches, decimals = 1) {
  if (!matches) return '—';
  return `${((wins / matches) * 100).toFixed(decimals)}%`;
}

function fmtRatio(hit, total, decimals = 1) {
  if (!total) return '—';
  return `${((hit / total) * 100).toFixed(decimals)}%`;
}

function charName(id) {
  return getCharacterById(id)?.name ?? id ?? '—';
}

/* ------------------------------------------------------------
   Aggregation helpers
   ------------------------------------------------------------ */
function topCharacter(byCharacter) {
  let best = null;
  for (const [id, rec] of Object.entries(byCharacter ?? {})) {
    if (!best || rec.matches > best.matches) best = { id, ...rec };
  }
  return best;
}

function topGameType(byGameType) {
  let best = null;
  for (const [gt, rec] of Object.entries(byGameType ?? {})) {
    if (!best || rec.matches > best.matches) best = { gt, ...rec };
  }
  return best;
}

function safeGT(player, gt) {
  return player?.byGameType?.[gt] ?? { matches: 0, wins: 0 };
}

/* ------------------------------------------------------------
   Common presentation components
   ------------------------------------------------------------ */
function KpiCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--bg-paper-alt)',
      border: '1px solid var(--line-soft)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
      minHeight: 100,
    }}>
      <div style={{
        fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
        letterSpacing: 0.5,
      }}>{label}</div>
      <div style={{
        fontSize: 26, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)',
        lineHeight: 1.1, marginTop: 2,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ children, right }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{children}</div>
      {right && <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{right}</div>}
    </div>
  );
}

/* ------------------------------------------------------------
   KPI card sets per gameType
   ------------------------------------------------------------ */
function KpiCardsAll({ me, snapshot }) {
  if (!me) return <EmptyKpi />;
  const topGT = topGameType(me.byGameType);
  const topCh = topCharacter(me.byCharacter);
  return (
    <>
      <KpiCard label="總場次" value={me.matches ?? 0} sub={`最近更新 ${fmtTime(me.lastSeenAt)}`} />
      <KpiCard label="總勝率" value={fmtPct(me.wins, me.matches)} sub={`${me.wins} / ${me.matches} 勝`} />
      <KpiCard
        label="最常玩的模式"
        value={topGT ? GAME_LABELS[topGT.gt] : '—'}
        sub={topGT ? `${topGT.matches} 場 · 勝率 ${fmtPct(topGT.wins, topGT.matches)}` : '—'}
      />
      <KpiCard
        label="最愛角色"
        value={topCh ? charName(topCh.id) : '—'}
        sub={topCh ? `${topCh.matches} 場 · 勝率 ${fmtPct(topCh.wins, topCh.matches)}` : '—'}
      />
    </>
  );
}

function KpiCardsBR({ me }) {
  if (!me) return <EmptyKpi />;
  const g = safeGT(me, 'battle-royale');
  return (
    <>
      <KpiCard label="BR 場次" value={g.matches ?? 0} />
      <KpiCard label="BR 勝率" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} />
      <KpiCard
        label="總擊殺"
        value={g.kills ?? 0}
        sub={g.matches ? `平均 ${((g.kills ?? 0) / g.matches).toFixed(1)} / 場` : '—'}
      />
      <KpiCard
        label="命中率"
        value={fmtRatio(g.bulletsHit, g.bulletsFired)}
        sub={`${g.bulletsHit ?? 0} / ${g.bulletsFired ?? 0} 發`}
      />
    </>
  );
}

function KpiCardsItems({ me }) {
  if (!me) return <EmptyKpi />;
  const g = safeGT(me, 'items');
  const control = (g.trapsPlaced ?? 0) + (g.undoUsed ?? 0);
  return (
    <>
      <KpiCard label="Items 場次" value={g.matches ?? 0} />
      <KpiCard label="Items 勝率" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} />
      <KpiCard
        label="控場次數"
        value={control}
        sub={`trap ${g.trapsPlaced ?? 0} · undo ${g.undoUsed ?? 0}`}
      />
      <KpiCard
        label="陷阱命中"
        value={g.trapsTriggered ?? 0}
        sub={g.trapsPlaced ? `${fmtRatio(g.trapsTriggered, g.trapsPlaced)} 觸發率` : '—'}
      />
    </>
  );
}

function KpiCardsTerritory({ me }) {
  if (!me) return <EmptyKpi />;
  const g = safeGT(me, 'territory');
  return (
    <>
      <KpiCard label="Territory 場次" value={g.matches ?? 0} />
      <KpiCard label="隊伍勝率" value={fmtPct(g.wins, g.matches)} sub={`${g.wins ?? 0} 勝`} />
      <KpiCard
        label="總塗格數"
        value={g.cellsPainted ?? 0}
        sub={g.matches ? `平均 ${Math.round((g.cellsPainted ?? 0) / g.matches)} / 場` : '—'}
      />
      <KpiCard
        label="封閉填滿"
        value={g.areasCaptured ?? 0}
        sub={`格式刷共 ${g.cellsCapturedByFormatbrush ?? 0} 格`}
      />
    </>
  );
}

function EmptyKpi() {
  return [0, 1, 2, 3].map(i => (
    <div key={i} style={{
      background: 'var(--bg-paper-alt)', border: '1px solid var(--line-soft)',
      padding: '14px 16px', minHeight: 100,
      color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 12,
    }}>
      #N/A
    </div>
  ));
}

/* ------------------------------------------------------------
   Recent matches：依 gameType 不同欄位
   ------------------------------------------------------------ */
function RecentMatchesTable({ matches, myUuid, gameTypeFilter }) {
  const filtered = gameTypeFilter === 'all'
    ? matches
    : matches.filter(m => m.gameType === gameTypeFilter);

  if (filtered.length === 0) {
    return (
      <div style={{
        padding: 28, background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
        textAlign: 'center', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ fontSize: 22, color: 'var(--ink-faint)', marginBottom: 4 }}>#N/A</div>
        <div style={{ fontSize: 12 }}>尚無對戰紀錄</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {filtered.map((m) => (
        <MatchRow key={m.id} match={m} myUuid={myUuid} />
      ))}
    </div>
  );
}

function MatchRow({ match, myUuid }) {
  const mine = match.participants.find(p => p.uuid === myUuid);
  const gt = match.gameType;
  const gameLabel = GAME_LABELS[gt] ?? gt;
  const result = mine?.isWinner ? 'WIN' : '—';
  const resultColor = mine?.isWinner ? 'var(--accent)' : 'var(--ink-muted)';

  let details = null;
  if (gt === 'battle-royale') {
    const s = mine?.stats ?? {};
    const mapName = getMapById(match.config?.mapId)?.name ?? '—';
    details = (
      <>
        <DetailItem label="地圖" value={mapName} />
        <DetailItem label="擊殺" value={s.kills ?? 0} />
        <DetailItem label="命中率" value={fmtRatio(s.bulletsHit, s.bulletsFired)} />
        <DetailItem label="存活" value={fmtDurationTicks(mine?.survivedTicks ?? 0)} />
      </>
    );
  } else if (gt === 'items') {
    const s = mine?.stats ?? {};
    details = (
      <>
        <DetailItem label="傷害" value={s.damageDealt ?? 0} />
        <DetailItem label="控場" value={(s.trapsPlaced ?? 0) + (s.undoUsed ?? 0)} />
        <DetailItem label="undo" value={s.undoUsed ?? 0} />
        <DetailItem label="存活" value={fmtDurationTicks(mine?.survivedTicks ?? 0)} />
      </>
    );
  } else if (gt === 'territory') {
    const s = mine?.stats ?? {};
    details = (
      <>
        <DetailItem label="隊" value={s.teamId != null ? `T${s.teamId}` : '—'} />
        <DetailItem label="塗格" value={s.cellsPainted ?? 0} />
        <DetailItem label="封閉" value={s.areasCaptured ?? 0} />
        <DetailItem label="隊總佔地" value={s.teamCellsAtEnd ?? 0} />
      </>
    );
  } else {
    details = <DetailItem label="—" value="—" />;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '100px 160px 1fr 60px 90px',
      alignItems: 'center',
      padding: '8px 12px',
      background: mine?.isWinner ? 'var(--bg-paper-alt)' : 'var(--bg-input)',
      border: '1px solid var(--line-soft)',
      borderLeft: `3px solid ${mine?.isWinner ? 'var(--accent)' : 'var(--line-soft)'}`,
      gap: 8,
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
        {fmtTime(match.endedAt)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink)' }}>
        <span style={{
          padding: '1px 6px', fontSize: 9, fontFamily: 'var(--font-mono)',
          background: 'var(--accent)', color: 'var(--bg-paper)', marginRight: 6,
        }}>
          {gameLabel}
        </span>
        <span>{charName(mine?.characterId)}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{details}</div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
        {fmtDurationMs(match.durationMs)}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
        textAlign: 'right', color: resultColor,
      }}>
        {result}
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------
   排行榜：6 張跨玩家 KPI 卡
   ------------------------------------------------------------ */
function buildLeaderboards(players) {
  const arr = Object.values(players ?? {});
  const MIN_BR = 30;     // 命中率最少要 30 發才計
  const MIN_WR = 3;      // 勝率王最少要 3 場

  const killsAll = (p) => (safeGT(p, 'battle-royale').kills ?? 0) + (safeGT(p, 'items').kills ?? 0);
  const paintedAll = (p) => safeGT(p, 'territory').cellsPainted ?? 0;
  const controlAll = (p) => (safeGT(p, 'items').trapsPlaced ?? 0) + (safeGT(p, 'items').undoUsed ?? 0);
  const hitRate = (p) => {
    const g = safeGT(p, 'battle-royale');
    const f = g.bulletsFired ?? 0;
    return f >= MIN_BR ? (g.bulletsHit ?? 0) / f : -1;
  };

  function top(getVal, formatVal) {
    let best = null, bestV = -Infinity;
    for (const p of arr) {
      const v = getVal(p);
      if (v > bestV) { bestV = v; best = p; }
    }
    return best && bestV > -Infinity && bestV > 0 ? {
      name: best.lastName ?? best.uuid?.slice(0, 6),
      value: formatVal ? formatVal(bestV) : bestV,
    } : null;
  }

  return [
    { id: 'kills', title: '擊殺王', sub: 'BR + Items 總擊殺',
      winner: top(killsAll) },
    { id: 'paint', title: '塗色王', sub: 'Territory 總塗格',
      winner: top(paintedAll) },
    { id: 'control', title: '控場王', sub: 'Items trap + undo',
      winner: top(controlAll) },
    { id: 'hitrate', title: '命中王', sub: `BR 命中率（≥${MIN_BR} 發）`,
      winner: top(hitRate, v => `${(v * 100).toFixed(1)}%`) },
    { id: 'veteran', title: '老將', sub: '總場次最多',
      winner: top(p => p.matches ?? 0) },
    { id: 'winrate', title: '勝率王', sub: `≥${MIN_WR} 場`,
      winner: top(p => (p.matches >= MIN_WR ? (p.wins / p.matches) : -1),
                  v => `${(v * 100).toFixed(1)}%`) },
  ];
}

function LeaderboardCard({ title, sub, winner }) {
  return (
    <div style={{
      background: 'var(--bg-paper-alt)', border: '1px solid var(--line-soft)',
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
      minHeight: 90,
    }}>
      <div style={{ fontSize: 11, color: 'var(--accent-link)', fontFamily: 'var(--font-mono)' }}>
        👑 {title}
      </div>
      {winner ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{winner.name}</div>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
            {winner.value}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>— 尚無資料 —</div>
      )}
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 'auto' }}>{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------
   角色使用分佈（跨 gameType 聚合 byCharacter）
   ------------------------------------------------------------ */
function CharacterUsage({ me }) {
  const list = useMemo(() => {
    return Object.entries(me?.byCharacter ?? {})
      .map(([id, rec]) => ({ id, ...rec }))
      .sort((a, b) => b.matches - a.matches);
  }, [me]);
  if (list.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>尚未使用過任何角色</div>;
  }
  const maxMatches = Math.max(1, ...list.map(l => l.matches));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {list.slice(0, 8).map((l) => (
        <div key={l.id} style={{
          display: 'grid', gridTemplateColumns: '120px 1fr 100px', alignItems: 'center',
          fontSize: 11, fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--ink)' }}>{charName(l.id)}</span>
          <div style={{ height: 12, background: 'var(--bg-input)', border: '1px solid var(--line-soft)', overflow: 'hidden' }}>
            <div style={{
              width: `${(l.matches / maxMatches) * 100}%`, height: '100%',
              background: 'var(--accent)',
            }} />
          </div>
          <span style={{ color: 'var(--ink-muted)', textAlign: 'right', paddingLeft: 8 }}>
            {l.matches} 場 · {fmtPct(l.wins, l.matches)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------
   主元件
   ------------------------------------------------------------ */
export default function MatchHistory({ onBack }) {
  const [snapshot, setSnapshot] = useState(null);
  const [tab, setTab] = useState('all');
  const uuid = useMemo(() => getPlayerUuid(), []);

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

  const me = snapshot?.players?.[uuid] ?? null;
  const matches = useMemo(() => {
    return [...(snapshot?.matches ?? [])].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  }, [snapshot]);
  const leaderboards = useMemo(() => buildLeaderboards(snapshot?.players), [snapshot]);

  let kpiContent;
  if (tab === 'all') kpiContent = <KpiCardsAll me={me} snapshot={snapshot} />;
  else if (tab === 'battle-royale') kpiContent = <KpiCardsBR me={me} />;
  else if (tab === 'items') kpiContent = <KpiCardsItems me={me} />;
  else if (tab === 'territory') kpiContent = <KpiCardsTerritory me={me} />;

  const totalMatches = snapshot?.meta?.totalMatches ?? 0;

  return (
    <SheetWindow
      fileName="戰績報表.xlsx — 個人 + 全站"
      cellRef="A1"
      formula={
        <>
          <span className="fn">=REPORT.MATCHES</span>(
          <span style={{ color: 'var(--accent-danger)' }}>&quot;{tab === 'all' ? '全部' : GAME_LABELS[tab]}&quot;</span>)
        </>
      }
      tabs={[
        { id: 'all', label: `全部 (${me?.matches ?? 0})` },
        { id: 'battle-royale', label: `大逃殺 (${safeGT(me, 'battle-royale').matches})` },
        { id: 'items', label: `道具戰 (${safeGT(me, 'items').matches})` },
        { id: 'territory', label: `領地 (${safeGT(me, 'territory').matches})` },
      ]}
      activeTab={tab}
      onTabSelect={setTab}
      statusLeft={me ? `就緒 — 個人總場 ${me.matches} 勝率 ${fmtPct(me.wins, me.matches)}` : '就緒 — 尚無戰績'}
      statusRight={`全站已記錄 ${totalMatches} 場`}
      fullscreen
    >
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '24px 32px',
        display: 'flex', flexDirection: 'column', gap: 22,
        background: 'var(--bg-paper)',
      }}>
        {/* 頁首 */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
            戰績報表 · {tab === 'all' ? '全部模式' : GAME_LABELS[tab]}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}>
            切換上方分頁看不同遊戲的個人 KPI · 全站排行榜位於頁面下方
          </div>
        </div>

        {/* KPI 卡 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {kpiContent}
        </div>

        {/* Recent matches */}
        <div>
          <SectionHeader right={`最近 ${totalMatches <= 10 ? totalMatches : 10} 場`}>
            最近對戰紀錄
          </SectionHeader>
          <RecentMatchesTable matches={matches} myUuid={uuid} gameTypeFilter={tab} />
        </div>

        {/* 排行榜 6 張 */}
        <div>
          <SectionHeader right="全站跨玩家">排行榜</SectionHeader>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}>
            {leaderboards.map((lb) => (
              <LeaderboardCard key={lb.id} {...lb} />
            ))}
          </div>
        </div>

        {/* 角色使用分佈 */}
        <div>
          <SectionHeader right="跨所有模式聚合">角色（皮膚）使用分佈</SectionHeader>
          <CharacterUsage me={me} />
        </div>

        {/* 回主選單 */}
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
