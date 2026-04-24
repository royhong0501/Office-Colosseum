// Territory HUD：隊伍分數條 + 倒數 + 自己隊色 + 名單。
import { getCharacterById } from '@office-colosseum/shared';

function fmtSec(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudTerritory({ selfId, teams, players, counts, roundEndsAtMs, now }) {
  const self = players?.[selfId];
  const myTeam = teams?.find((t) => t.id === self?.teamId);
  const total = (counts ?? []).reduce((a, b) => a + b, 0) || 1;
  const roundMs = Math.max(0, (roundEndsAtMs ?? 0) - now);

  return (
    <aside style={{
      width: 240,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--line-soft)',
      background: 'var(--bg-paper-alt)',
      padding: 10, gap: 10,
      fontFamily: 'var(--font-ui)', fontSize: 11,
      color: 'var(--ink)', overflow: 'auto',
    }}>
      {/* 自己隊色 */}
      {myTeam && (
        <div style={{
          background: 'var(--bg-paper)', border: '1px solid var(--line-soft)',
          padding: 8, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 24, height: 24, background: myTeam.color.deep, border: '1px solid var(--line)' }} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>你的隊伍</div>
            <div style={{ fontWeight: 600 }}>{myTeam.name}</div>
          </div>
        </div>
      )}

      {/* 計分板 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          =COUNTIF(COLOR=TEAM)
        </div>
        {/* 比例條 */}
        <div style={{ display: 'flex', height: 12, border: '1px solid var(--line)', marginBottom: 6 }}>
          {(teams ?? []).map((t, i) => {
            const pct = (counts?.[i] ?? 0) / total * 100;
            return <span key={t.id} style={{ width: `${pct}%`, background: t.color.deep }} />;
          })}
        </div>
        {(teams ?? []).map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 2 }}>
            <span style={{ width: 12, height: 12, background: t.color.deep, border: '1px solid var(--line)' }} />
            <span style={{ fontWeight: t.id === self?.teamId ? 600 : 400 }}>{t.name}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>
              {counts?.[i] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* 倒數 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>回合倒數</div>
        <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: roundMs < 30000 ? 'var(--accent-danger)' : 'var(--ink)' }}>
          {fmtSec(roundMs)}
        </div>
      </div>

      {/* 隊伍名單 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>參賽者</div>
        {(teams ?? []).map((t) => (
          <div key={t.id} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: t.color.edge ?? t.color.deep, fontWeight: 600 }}>{t.name}</div>
            {t.playerIds.map((pid) => {
              const p = players?.[pid];
              const ch = getCharacterById(p?.characterId);
              return (
                <div key={pid} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', paddingLeft: 8 }}>
                  {pid === selfId ? '▶ ' : '· '}{ch?.name ?? pid.slice(0, 6)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>WASD / ↑↓←→ 移動 = 塗色</div>
        <div>圍成封閉區 → 內部連鎖填滿</div>
        <div>ESC 老闆鍵</div>
      </div>
    </aside>
  );
}
