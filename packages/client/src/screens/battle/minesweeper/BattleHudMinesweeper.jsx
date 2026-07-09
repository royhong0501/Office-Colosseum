// 踩地雷 HUD：剩餘雷數（雷數 - 旗數）+ 計時 + 難度 + 進度 + 結果。
const DIFF_NAME = { easy: '新手', normal: '普通', hard: '專家' };

function fmtSec(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudMinesweeper({
  difficulty, mineCount, flagsUsed, revealedCount, safeTotal, phase, result, elapsedMs,
}) {
  const minesLeft = mineCount - flagsUsed;
  const pct = safeTotal ? Math.round((revealedCount / safeTotal) * 100) : 0;

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
      {/* 結果 banner */}
      {phase === 'ended' && (
        <div style={{
          background: result === 'won' ? 'var(--accent)' : 'var(--accent-danger)',
          color: 'var(--bg-paper)', padding: 10, textAlign: 'center', fontWeight: 700, fontSize: 15,
        }}>
          {result === 'won' ? '✓ 清盤成功！' : '✳ 踩到地雷'}
        </div>
      )}

      {/* 剩餘雷數 + 計時 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>剩餘雷數</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-danger)' }}>
            {String(minesLeft).padStart(3, '0')}
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>計時</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtSec(elapsedMs)}</div>
        </div>
      </div>

      {/* 難度 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>難度</div>
        <div style={{ fontWeight: 600 }}>{DIFF_NAME[difficulty] ?? difficulty} · {mineCount} 雷</div>
      </div>

      {/* 進度 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          翻開進度 {revealedCount}/{safeTotal}
        </div>
        <div style={{ height: 10, border: '1px solid var(--line)', background: 'var(--bg-input)' }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>左鍵 翻開儲存格</div>
        <div>右鍵 插旗 / 取消旗</div>
        <div>翻開所有非雷格即勝</div>
        <div>ESC 老闆鍵</div>
      </div>
    </aside>
  );
}
