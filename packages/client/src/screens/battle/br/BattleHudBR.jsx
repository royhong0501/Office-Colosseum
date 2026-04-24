// BR HUD 側欄：HP bar / dash CD / shield 狀態 / 毒圈下一波倒數 / 存活人數。

import { getCharacterById } from '@office-colosseum/shared';
import {
  DASH_CD_MS, MAX_HP,
} from '@office-colosseum/shared/src/games/br/constants.js';

function fmtSec(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudBR({ selfId, players, poison, now }) {
  const self = players?.[selfId];
  const aliveN = Object.values(players ?? {}).filter(p => p.alive).length;
  const totalN = Object.keys(players ?? {}).length;

  const hpPct = self ? Math.max(0, self.hp / MAX_HP) : 0;
  const hpColor = hpPct < 0.3 ? 'var(--accent-danger)' : hpPct < 0.6 ? '#c79a1a' : '#4f8d4f';
  const dashRemainingMs = self ? Math.max(0, (self.dashCdUntil ?? 0) - now) : 0;
  const dashPct = 1 - dashRemainingMs / DASH_CD_MS;

  const nextWaveMs = poison?.nextWaveAtMs ?? 0;
  const nextWaveIn = Math.max(0, nextWaveMs - now);

  return (
    <aside style={{
      width: 220,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--line-soft)',
      background: 'var(--bg-paper-alt)',
      padding: 10,
      gap: 10,
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      color: 'var(--ink)',
      overflow: 'auto',
    }}>
      {/* 自己的資訊 */}
      {self && (
        <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            你 · {getCharacterById(self.characterId)?.name ?? '—'}
          </div>
          {/* HP bar */}
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
            HP {self.hp} / {self.maxHp}
          </div>
          <div style={{ height: 10, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
            <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor }} />
          </div>
          {/* Dash CD */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, border: '1px solid var(--line)',
              background: dashRemainingMs > 0 ? 'var(--bg-chrome)' : 'var(--bg-paper-alt)',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: dashRemainingMs > 0 ? 'var(--ink-muted)' : 'var(--accent)',
              position: 'relative', overflow: 'hidden',
            }}>
              <span style={{ zIndex: 1 }}>{dashRemainingMs > 0 ? fmtSec(dashRemainingMs) : 'DASH'}</span>
              <span style={{
                position: 'absolute', bottom: 0, left: 0,
                width: '100%', height: `${(1 - dashPct) * 100}%`,
                background: 'var(--line-soft)', opacity: 0.4,
              }} />
            </span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>Shift 衝刺</span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
                CD {DASH_CD_MS / 1000}s · 無敵 0.2s
              </span>
            </div>
          </div>
          {/* Shield status */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 24, border: '1px solid var(--line)',
              background: self.shielding ? 'var(--accent-link)' : 'var(--bg-paper-alt)',
              color: self.shielding ? 'var(--bg-paper)' : 'var(--ink-muted)',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}>
              SHIELD
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
              {self.shielding ? 'RMB 舉盾中 · −40% 移速' : 'RMB 按住舉盾'}
            </span>
          </div>
        </div>
      )}

      {/* 毒圈資訊 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          報錯毒圈 #REF!
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          第 {poison?.waveCount ?? 0} 波 · 下一波 {fmtSec(nextWaveIn)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2 }}>
          汙染格數 {poison?.infected?.length ?? 0}
          {poison?.severe?.length ? ` · severe ${poison.severe.length}` : ''}
        </div>
      </div>

      {/* 全員名單 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{
          fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>參賽者</span>
          <span>{aliveN} / {totalN}</span>
        </div>
        {Object.values(players ?? {}).map((p) => {
          const ch = getCharacterById(p.characterId);
          const pct = Math.max(0, p.hp / (p.maxHp || 1));
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px',
              gap: 6, alignItems: 'center',
              opacity: p.alive ? 1 : 0.5,
              marginTop: 4,
            }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.id === selfId ? '▶ ' : ''}{ch?.name ?? p.id.slice(0, 6)}
                {!p.alive && ' ✕'}
              </span>
              <span style={{
                height: 6, background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
                position: 'relative', overflow: 'hidden',
              }}>
                <span style={{
                  position: 'absolute', inset: 0,
                  width: `${pct * 100}%`,
                  background: p.alive ? (pct < 0.3 ? 'var(--accent-danger)' : 'var(--accent)') : 'var(--ink-muted)',
                }} />
              </span>
            </div>
          );
        })}
      </div>

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>WASD / ↑↓←→ 移動</div>
        <div>滑鼠 aim · LMB 射擊</div>
        <div>RMB 舉盾（−70% 傷害）</div>
        <div>Shift 衝刺（2 格 · 0.2s 無敵）</div>
        <div>ESC 老闆鍵</div>
      </div>
    </aside>
  );
}
