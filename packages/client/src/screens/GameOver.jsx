import { getSocket } from '../net/socket.js';
import { getCharacterById } from '@office-colosseum/shared';
import { excelColors } from '../theme.js';

const cell = (content, style = {}) => (
  <td style={{
    border: `1px solid ${excelColors.cellBorder}`,
    padding: '3px 8px',
    fontFamily: 'Consolas, "Microsoft JhengHei", monospace',
    fontSize: 12,
    color: excelColors.text,
    whiteSpace: 'nowrap',
    ...style,
  }}>{content}</td>
);

export default function GameOver({ winnerId, summary, players, onBack }) {
  const selfId = getSocket()?.id;
  const isSelfWinner = selfId && selfId === winnerId;

  // Build rows sorted by dmgDealt descending
  const rows = Object.entries(summary ?? {})
    .map(([pid, stats]) => {
      const player = players?.[pid];
      const char = getCharacterById(player?.characterId);
      return {
        pid,
        name: char?.name ?? pid.slice(0, 6),
        charNameEn: char?.nameEn ?? '',
        dmgDealt: stats.dmgDealt ?? 0,
        dmgTaken: stats.dmgTaken ?? 0,
        survivedTicks: stats.survivedTicks ?? 0,
        isSelf: pid === selfId,
        isWinner: pid === winnerId,
      };
    })
    .sort((a, b) => b.dmgDealt - a.dmgDealt);

  const winnerName = (() => {
    if (!winnerId) return null;
    const p = players?.[winnerId];
    const char = getCharacterById(p?.characterId);
    return char?.name ?? winnerId.slice(0, 6);
  })();

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: excelColors.cellBg,
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", Calibri, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Title bar */}
      <div style={{
        background: '#217346',
        color: '#FFFFFF',
        padding: '4px 12px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span>📊</span>
        <span>戰績報表.xlsx — HiiiColosseum</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.8 }}>✕</span>
      </div>

      {/* Menu bar */}
      <div style={{
        background: excelColors.menuBg,
        borderBottom: `1px solid ${excelColors.menuBorder}`,
        padding: '3px 8px',
        fontSize: 12,
        color: excelColors.text,
        display: 'flex',
        gap: 12,
        flexShrink: 0,
      }}>
        {['檔案(F)', '編輯(E)', '檢視(V)', '插入(I)', '格式(O)', '競技場(C)', '說明(H)'].map(m => (
          <span key={m} style={{ cursor: 'default', padding: '1px 4px' }}>{m}</span>
        ))}
      </div>

      {/* Formula bar */}
      <div style={{
        background: excelColors.toolbarBg,
        borderBottom: `1px solid ${excelColors.cellBorder}`,
        padding: '3px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        flexShrink: 0,
      }}>
        <div style={{
          width: 60, padding: '1px 6px', background: excelColors.formulaBg,
          border: `1px solid ${excelColors.cellBorder}`, textAlign: 'center',
          fontFamily: 'Consolas, monospace', fontSize: 11,
        }}>A1</div>
        <span style={{ color: excelColors.textLight, fontStyle: 'italic' }}>fx</span>
        <div style={{
          flex: 1, padding: '1px 6px', background: excelColors.formulaBg,
          border: `1px solid ${excelColors.cellBorder}`,
          fontFamily: 'Consolas, monospace', fontSize: 11,
        }}>=MATCH.RESULT(winnerId, summary)</div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Winner banner */}
        <div style={{
          border: `2px solid ${isSelfWinner ? excelColors.greenAccent : excelColors.accentLight}`,
          borderRadius: 3,
          padding: '16px 24px',
          background: isSelfWinner ? '#EEF7EC' : excelColors.headerBg,
          textAlign: 'center',
        }}>
          {winnerId == null ? (
            <div style={{ fontSize: 28, fontWeight: 700, color: excelColors.text }}>平局 / DRAW</div>
          ) : isSelfWinner ? (
            <>
              <div style={{ fontSize: 36, fontWeight: 900, color: excelColors.greenAccent, letterSpacing: 2 }}>
                你贏了 / YOU WIN
              </div>
              <div style={{ fontSize: 14, color: excelColors.textLight, marginTop: 6 }}>
                🏆 恭喜！戰鬥報表已自動存檔。
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: excelColors.accent }}>
                勝者：{winnerName}
              </div>
              <div style={{ fontSize: 13, color: excelColors.textLight, marginTop: 6 }}>
                失敗者小心點… 下次記得帶午餐來賄賂勝者。
              </div>
            </>
          )}
        </div>

        {/* Summary table */}
        <div>
          <div style={{
            fontSize: 11, color: excelColors.textLight, marginBottom: 4,
            fontFamily: 'Consolas, monospace',
          }}>
            =SORT(FILTER(戰績資料表, 擊傷&gt;0), 擊傷, -1)
          </div>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
            tableLayout: 'fixed',
          }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: excelColors.headerBg }}>
                {cell('#', { fontWeight: 700, textAlign: 'center' })}
                {cell('Player', { fontWeight: 700 })}
                {cell('角色', { fontWeight: 700 })}
                {cell('擊傷 dmgDealt', { fontWeight: 700, textAlign: 'right' })}
                {cell('受傷 dmgTaken', { fontWeight: 700, textAlign: 'right' })}
                {cell('存活 Tick', { fontWeight: 700, textAlign: 'right' })}
                {cell('狀態', { fontWeight: 700, textAlign: 'center' })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rowBg = row.isSelf
                  ? excelColors.selectedCell
                  : i % 2 === 0 ? excelColors.cellBg : '#F8F4EF';
                const s = { background: rowBg };
                return (
                  <tr key={row.pid}>
                    {cell(i + 1, { ...s, textAlign: 'center', color: excelColors.textLight })}
                    {cell(
                      <span>
                        {row.isWinner && <span style={{ color: excelColors.greenAccent }}>🏆 </span>}
                        {row.isSelf && !row.isWinner && <span style={{ color: excelColors.blueAccent }}>▶ </span>}
                        {row.pid.slice(0, 8)}
                        {row.isSelf && <span style={{ color: excelColors.textLight }}> (你)</span>}
                      </span>,
                      { ...s, fontFamily: 'Consolas, monospace', fontSize: 11 }
                    )}
                    {cell(`${row.name}${row.charNameEn ? ` (${row.charNameEn})` : ''}`, s)}
                    {cell(row.dmgDealt.toLocaleString(), { ...s, textAlign: 'right', color: row.dmgDealt > 0 ? excelColors.redAccent : excelColors.text, fontWeight: row.isWinner ? 700 : 400 })}
                    {cell(row.dmgTaken.toLocaleString(), { ...s, textAlign: 'right' })}
                    {cell(row.survivedTicks.toLocaleString(), { ...s, textAlign: 'right', color: excelColors.blueAccent })}
                    {cell(
                      row.isWinner ? '🏆 勝者' : '💀 淘汰',
                      { ...s, textAlign: 'center', color: row.isWinner ? excelColors.greenAccent : excelColors.textLight }
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Back button */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 24px',
              background: excelColors.accent,
              color: '#FDFBF7',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: '"Microsoft JhengHei", sans-serif',
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
            onMouseEnter={e => e.target.style.background = excelColors.accentLight}
            onMouseLeave={e => e.target.style.background = excelColors.accent}
          >
            ← 返回大廳
          </button>
          <span style={{ fontSize: 11, color: excelColors.textLight, alignSelf: 'center' }}>
            (回到大廳後可重新選角並就緒)
          </span>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        background: excelColors.accent,
        color: '#F5F0E8',
        padding: '2px 12px',
        fontSize: 10,
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span>就緒</span>
        <span>
          平均擊傷: {rows.length ? Math.round(rows.reduce((s, r) => s + r.dmgDealt, 0) / rows.length).toLocaleString() : 0} | 個數: {rows.length} | 加總: {rows.reduce((s, r) => s + r.dmgDealt, 0).toLocaleString()}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}
