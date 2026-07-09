// 五子棋 HUD：我方棋色 + 輪到誰 + 回合倒數 + 手數 + 對局雙方。
import { getCharacterById } from '@office-colosseum/shared';

const COLOR_LABEL = { black: '黑棋 ●', white: '白棋 ○' };
const COLOR_SWATCH = { black: '#2b2b2b', white: '#f4f1ea' };

function fmtSec(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudGomoku({ selfId, players, order, turn, turnColor, moveCount, turnEndsAtMs, now, phase, onHome }) {
  const self = players?.[selfId];
  const myColor = self?.color;
  const myTurn = phase === 'playing' && turn === selfId;
  const turnMs = Math.max(0, (turnEndsAtMs ?? 0) - now);

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
      {/* 我方棋色 */}
      {myColor && (
        <div style={{
          background: 'var(--bg-paper)', border: '1px solid var(--line-soft)',
          padding: 8, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: COLOR_SWATCH[myColor], border: '1px solid var(--line)' }} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>你的棋色</div>
            <div style={{ fontWeight: 600 }}>{COLOR_LABEL[myColor]}</div>
          </div>
        </div>
      )}

      {/* 輪到誰 */}
      <div style={{
        background: myTurn ? 'var(--accent)' : 'var(--bg-paper)',
        color: myTurn ? 'var(--bg-paper)' : 'var(--ink)',
        border: '1px solid var(--line-soft)', padding: 8,
      }}>
        <div style={{ fontSize: 10, opacity: 0.8, fontFamily: 'var(--font-mono)' }}>=TURN()</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {phase !== 'playing' ? '對局結束' : (myTurn ? '你的回合' : '對手回合')}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          目前落子：{COLOR_LABEL[turnColor] ?? turnColor}
        </div>
      </div>

      {/* 回合倒數 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>本手時限</div>
        <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: turnMs < 10000 ? 'var(--accent-danger)' : 'var(--ink)' }}>
          {fmtSec(turnMs)}
        </div>
      </div>

      {/* 手數 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>總手數</div>
        <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{moveCount ?? 0}</div>
      </div>

      {/* 對局雙方 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>對局雙方</div>
        {(order ?? Object.keys(players ?? {})).map((pid) => {
          const p = players?.[pid];
          const ch = getCharacterById(p?.characterId);
          return (
            <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', paddingLeft: 2, marginBottom: 2 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR_SWATCH[p?.color] ?? '#888', border: '1px solid var(--line)' }} />
              <span style={{ fontWeight: pid === selfId ? 700 : 400 }}>
                {pid === selfId ? '▶ ' : ''}{ch?.name ?? pid.slice(0, 6)}
              </span>
              {turn === pid && phase === 'playing' && <span style={{ marginLeft: 'auto', color: 'var(--accent-link)' }}>◀ 落子中</span>}
            </div>
          );
        })}
      </div>

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>輪到你時點擊空格落子</div>
        <div>先連成五子者勝</div>
        <div>逾時未落子判負</div>
        <div>ESC 老闆鍵</div>
      </div>

      {/* 放棄回首頁 */}
      <button
        onClick={onHome}
        style={{
          marginTop: 'auto', padding: '8px 0', cursor: 'pointer',
          background: 'var(--bg-input)', color: 'var(--ink)',
          border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 11,
        }}
      >← 放棄回首頁</button>
    </aside>
  );
}
