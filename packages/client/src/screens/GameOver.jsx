import { getSocket } from '../net/socket.js';
import { getCharacterById, TICK_MS } from '@office-colosseum/shared';
import { getMapById } from '@office-colosseum/shared/src/games/br/index.js';
import SheetWindow from '../components/SheetWindow.jsx';

const GAME_NAMES = {
  'battle-royale': '經典大逃殺',
  'items': '道具戰',
  'territory': '數據領地爭奪戰',
};

function formatDuration(ticks) {
  const sec = Math.floor((ticks * TICK_MS) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Stat({ label, value, emphasize }) {
  return (
    <div style={{
      background: 'var(--bg-input)',
      border: '1px solid var(--line-soft)',
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 600, color: emphasize ? 'var(--accent)' : 'var(--ink)',
        fontFamily: 'var(--font-mono)',
      }}>
        {value}
      </div>
    </div>
  );
}

function DmgBar({ value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{
      position: 'relative', height: 12,
      background: 'var(--bg-paper-alt)',
      border: '1px solid var(--line-soft)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: 'var(--accent)',
      }} />
    </div>
  );
}

export default function GameOver({ gameType, config, winnerId, summary, players, onBack }) {
  const selfId = getSocket()?.id;
  const isSelfWinner = selfId && selfId === winnerId;

  const rows = Object.entries(summary ?? {})
    .map(([pid, stats]) => {
      const player = players?.[pid];
      const char = getCharacterById(player?.characterId);
      return {
        pid,
        displayName: pid.startsWith('bot-') ? `Bot-${pid.slice(-2)}` : pid.slice(0, 6).toUpperCase(),
        charName: char?.name ?? '#N/A',
        charNameEn: char?.nameEn ?? '',
        type: char?.type ?? null,
        dmgDealt: stats?.dmgDealt ?? 0,
        dmgTaken: stats?.dmgTaken ?? 0,
        survivedTicks: stats?.survivedTicks ?? 0,
        isSelf: pid === selfId,
        isWinner: pid === winnerId,
      };
    })
    .sort((a, b) => {
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      return b.dmgDealt - a.dmgDealt;
    });

  const maxDmg = rows.reduce((m, r) => Math.max(m, r.dmgDealt), 0);
  const totalDmg = rows.reduce((s, r) => s + r.dmgDealt, 0);
  const avgDmg = rows.length ? Math.round(totalDmg / rows.length) : 0;
  const maxSurvived = rows.reduce((m, r) => Math.max(m, r.survivedTicks), 0);

  const winner = rows.find((r) => r.isWinner);
  const me = rows.find((r) => r.isSelf);
  const mvp = rows.length ? rows.slice().sort((a, b) => b.dmgDealt - a.dmgDealt)[0] : null;

  const dogSurvived = rows.filter((r) => r.type === 'dog' && r.survivedTicks > 0).length;
  const catSurvived = rows.filter((r) => r.type === 'cat' && r.survivedTicks > 0).length;

  const shortId = `SH-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const timestamp = formatTimestamp();
  const gameName = GAME_NAMES[gameType] ?? '對戰';
  const mapName = gameType === 'battle-royale' && config?.mapId
    ? (getMapById(config.mapId)?.name ?? null)
    : null;
  const titleLabel = mapName ? `${gameName} · ${mapName}` : gameName;

  return (
    <SheetWindow
      fileName={`${titleLabel}_${shortId}_彙整.xlsx`}
      cellRef="A1"
      formula={`=SUMIFS(MATCH_LOG, PLAYER="${me?.displayName ?? '—'}")`}
      tabs={[
        { id: 'summary', label: '結算' },
        { id: 'detail', label: '個人表現' },
        { id: 'all', label: '全員成績' },
      ]}
      activeTab="summary"
      statusLeft={`完成 — 匹配結束於 ${timestamp}`}
      statusRight={`存活最久: ${formatDuration(maxSurvived)} | 總傷害: ${totalDmg.toLocaleString()} | 平均: ${avgDmg.toLocaleString()}`}
      fullscreen
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ==== 頂部 Banner ==== */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr',
          gap: 16,
          border: '1px solid var(--line-soft)',
          background: 'var(--bg-paper-alt)',
          padding: 20,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              H1 · 績效評語
            </div>
            <div style={{
              fontSize: 32, fontWeight: 700, marginTop: 6,
              color: winnerId == null ? 'var(--ink)'
                : isSelfWinner ? 'var(--accent)' : 'var(--accent-danger)',
            }}>
              {winnerId == null ? '流會 / DRAW' : isSelfWinner ? '績效達標 ✓' : '未達標 ✗'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {winnerId == null
                ? '無人存活，請下次安排人力冗餘'
                : isSelfWinner
                ? `${winner?.type === 'dog' ? '狗方' : winner?.type === 'cat' ? '貓方' : ''} = WIN · 本週目標達成率 100%`
                : `勝者 ${winner?.displayName} (${winner?.charName}) · 建議檢討執行策略`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              工作表編號
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
              {shortId}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              建立時間: {timestamp}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)' }}>
              總時長: {formatDuration(maxSurvived)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              陣營存活人數
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {dogSurvived}
              </span>
              <span style={{ color: 'var(--ink-muted)' }}>:</span>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-danger)', fontFamily: 'var(--font-mono)' }}>
                {catSurvived}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
              狗方 : 貓方 · 存活計分
            </div>
          </div>
        </div>

        {/* ==== 中段 MVP 卡 + 你的表現 ==== */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
          {/* MVP 便利貼 */}
          <div style={{
            background: 'var(--sticky)',
            border: '1px solid var(--line-soft)',
            padding: 16,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{
              fontSize: 10, color: 'var(--ink-muted)',
              fontFamily: 'var(--font-mono)', letterSpacing: 1,
            }}>
              便利貼 · MVP — 最高輸出
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
              {mvp?.displayName ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {mvp ? `${mvp.charName} · ${mvp.charNameEn}` : ''}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
              borderTop: '1px dashed var(--line-soft)', paddingTop: 8, marginTop: 4,
            }}>
              傷害輸出: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{mvp?.dmgDealt?.toLocaleString() ?? 0}</span>
              <br />存活: <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatDuration(mvp?.survivedTicks ?? 0)}</span>
            </div>
          </div>

          {/* 你的表現 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
              你的表現 / SELF KPI
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Stat label="傷害輸出" value={me?.dmgDealt?.toLocaleString() ?? 0} emphasize />
              <Stat label="傷害承受" value={me?.dmgTaken?.toLocaleString() ?? 0} />
              <Stat label="存活時間" value={me ? formatDuration(me.survivedTicks) : '—'} />
              <Stat
                label="結算"
                value={winnerId == null ? '平局' : me?.isWinner ? '勝' : '負'}
                emphasize={me?.isWinner}
              />
            </div>
          </div>
        </div>

        {/* ==== 全員成績表 ==== */}
        <div>
          <div style={{
            fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            marginBottom: 4,
          }}>
            =SORT(FILTER(成績表, dmgDealt≥0), isWinner DESC, dmgDealt DESC)
          </div>
          <div style={{ border: '1px solid var(--line-soft)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 72px 1fr 1fr 90px 90px 80px 56px',
              background: 'var(--bg-cell-header)',
              borderBottom: '1px solid var(--line-soft)',
              fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600,
            }}>
              {['#', '編號', '暱稱', '角色 / 陣營', '傷害輸出', '傷害承受', '存活', '備註'].map((h, i) => (
                <div key={i} style={{
                  padding: '6px 8px',
                  borderRight: i < 7 ? '1px solid var(--line-soft)' : 'none',
                  textAlign: i >= 4 && i <= 6 ? 'right' : 'left',
                }}>{h}</div>
              ))}
            </div>
            {rows.map((row, i) => (
              <div
                key={row.pid}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 72px 1fr 1fr 90px 90px 80px 56px',
                  fontSize: 11, color: 'var(--ink)',
                  background: row.isSelf ? 'var(--bg-paper-alt)' : (i % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)'),
                  borderBottom: '1px solid var(--line-soft)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)', textAlign: 'center' }}>{i + 1}</div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>
                  SH-{row.pid.slice(0, 4).toUpperCase()}
                </div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {row.isWinner && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>★</span>}
                  <span style={{ fontWeight: row.isSelf ? 700 : 400 }}>{row.displayName}</span>
                  {row.isSelf && <span style={{ color: 'var(--ink-muted)' }}>(你)</span>}
                </div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)' }}>
                  {row.charName} <span style={{ color: 'var(--ink-muted)' }}>· {row.type === 'dog' ? '狗方' : row.type === 'cat' ? '貓方' : '—'}</span>
                </div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
                  <div style={{ marginBottom: 2 }}>{row.dmgDealt.toLocaleString()}</div>
                  <DmgBar value={row.dmgDealt} max={maxDmg} />
                </div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right', color: 'var(--ink-soft)' }}>
                  {row.dmgTaken.toLocaleString()}
                </div>
                <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right', color: 'var(--accent-link)' }}>
                  {formatDuration(row.survivedTicks)}
                </div>
                <div style={{ padding: '5px 8px', color: row.isWinner ? 'var(--accent)' : 'var(--ink-muted)', textAlign: 'center' }}>
                  {row === mvp ? 'MVP' : row.isWinner ? '勝者' : '淘汰'}
                </div>
              </div>
            ))}
            {/* 合計列 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 72px 1fr 1fr 90px 90px 80px 56px',
              fontSize: 11, color: 'var(--ink-soft)',
              background: 'var(--bg-cell-header)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'center' }}>Σ</div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)' }}>合計</div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>=SUM</div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>=AVERAGE</div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>{totalDmg.toLocaleString()}</div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
                {rows.reduce((s, r) => s + r.dmgTaken, 0).toLocaleString()}
              </div>
              <div style={{ padding: '5px 8px', borderRight: '1px solid var(--line-soft)', textAlign: 'right' }}>
                {formatDuration(maxSurvived)}
              </div>
              <div style={{ padding: '5px 8px', textAlign: 'center' }}>—</div>
            </div>
          </div>
        </div>

        {/* ==== 底部按鈕 ==== */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onBack}
            style={{
              padding: '7px 20px',
              background: 'var(--accent)',
              color: 'var(--bg-paper)',
              border: '1px solid var(--line)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            再來一場
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '6px 16px',
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
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
            匯出 PDF · 儲存分享（未啟用）
          </span>
        </div>
      </div>
    </SheetWindow>
  );
}
