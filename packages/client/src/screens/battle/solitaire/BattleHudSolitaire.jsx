// 接龍 HUD：四花色歸位進度 + 手數 + 計時 + 自動歸位按鈕 + 結果。
import { SUIT_SYMBOLS } from '@office-colosseum/shared/src/games/solitaire/constants.js';

function fmtSec(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudSolitaire({ foundations, moves, elapsedMs, phase, result, onAuto, onDraw }) {
  const totalDone = (foundations ?? []).reduce((n, f) => n + f.length, 0);

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
      {phase === 'ended' && (
        <div style={{
          background: result === 'won' ? 'var(--accent)' : 'var(--accent-danger)',
          color: 'var(--bg-paper)', padding: 10, textAlign: 'center', fontWeight: 700, fontSize: 15,
        }}>
          {result === 'won' ? '✓ 全部歸位！' : '結束'}
        </div>
      )}

      {/* 歸位進度 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
          歸位進度 {totalDone}/52
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(foundations ?? [[], [], [], []]).map((f, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', border: '1px solid var(--line-soft)', padding: '4px 0', background: 'var(--bg-input)' }}>
              <div style={{ fontSize: 14, color: (i === 1 || i === 2) ? '#c0392b' : '#2b2b2b' }}>{SUIT_SYMBOLS[i]}</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{f.length}/13</div>
            </div>
          ))}
        </div>
      </div>

      {/* 手數 + 計時 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>手數</div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{moves ?? 0}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>計時</div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtSec(elapsedMs)}</div>
        </div>
      </div>

      {/* 動作按鈕 */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-cell" onClick={onDraw} style={{ flex: 1, padding: '6px 0' }}>抽牌</button>
          <button className="btn-cell primary" onClick={onAuto} style={{ flex: 1, padding: '6px 0' }}>自動歸位</button>
        </div>
      )}

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>點牌堆左上抽牌</div>
        <div>拖曳牌到目標堆移動</div>
        <div>雙擊快速歸位</div>
        <div>tableau 降序異色、空列放 K</div>
        <div>ESC 老闆鍵</div>
      </div>
    </aside>
  );
}
