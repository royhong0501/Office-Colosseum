// Items HUD：HP + MP 雙條 + 5 技能槽（顯示 CD / MP 狀態）+ 回合倒數 + 全員名單。

import { getCharacterById } from '@office-colosseum/shared';
import {
  MAX_HP, MAX_MP, SKILLS, SKILL_KEYS,
} from '@office-colosseum/shared/src/games/items/constants.js';

const SKILL_META = {
  freeze:   { emoji: '❄', name: '凍結窗格', fn: '=FREEZE(cell)' },
  undo:     { emoji: '↶', name: 'Ctrl+Z', fn: '=UNDO()' },
  merge:    { emoji: '⊞', name: '合併儲存格', fn: '=MERGE(range)' },
  readonly: { emoji: '🔒', name: '唯讀炸彈', fn: '=READONLY()' },
  validate: { emoji: '▼', name: '資料驗證', fn: '=VALIDATE()' },
};

function fmtSec(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BattleHudItems({ selfId, players, roundEndsAtMs, now }) {
  const self = players?.[selfId];
  const aliveN = Object.values(players ?? {}).filter(p => p.alive).length;
  const totalN = Object.keys(players ?? {}).length;

  const hpPct = self ? Math.max(0, self.hp / MAX_HP) : 0;
  const mpPct = self ? Math.max(0, self.mp / MAX_MP) : 0;
  const hpColor = hpPct < 0.3 ? 'var(--accent-danger)' : hpPct < 0.6 ? '#c79a1a' : '#4f8d4f';
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
      {/* 自己資訊 */}
      {self && (
        <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            你 · {getCharacterById(self.characterId)?.name ?? '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
            HP {Math.round(self.hp)} / {self.maxHp}
          </div>
          <div style={{ height: 10, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
            <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            MP {Math.round(self.mp)} / {self.maxMp}
          </div>
          <div style={{ height: 8, background: 'var(--bg-input)', border: '1px solid var(--line-soft)' }}>
            <div style={{ width: `${mpPct * 100}%`, height: '100%', background: 'var(--accent-link)' }} />
          </div>
          {/* Debuffs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>
            {now < (self.frozenUntil ?? 0) && <span style={{ padding: '1px 4px', background: '#bdd7e6', color: '#2f5a7a' }}>凍結</span>}
            {now < (self.slowedUntil ?? 0) && <span style={{ padding: '1px 4px', background: '#dcc9a0', color: '#8a6a3a' }}>減速</span>}
            {now < (self.silencedUntil ?? 0) && <span style={{ padding: '1px 4px', background: 'var(--ink-muted)', color: 'var(--bg-paper)' }}>封技</span>}
          </div>
        </div>
      )}

      {/* 5 技能槽 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
          儲存格技能（按 1–5）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {SKILL_KEYS.map((kind, i) => {
            const meta = SKILL_META[kind];
            const cfg = SKILLS[kind];
            const cd = Math.max(0, (self?.skillCdUntil?.[kind] ?? 0) - now);
            const mpShort = (self?.mp ?? 0) < cfg.mpCost;
            const unavailable = cd > 0 || mpShort;
            return (
              <div key={kind}
                   title={`${meta.name} · MP ${cfg.mpCost} · CD ${cfg.cdMs / 1000}s`}
                   style={{
                     position: 'relative',
                     aspectRatio: '1', border: '1px solid var(--line)',
                     background: unavailable ? 'var(--bg-chrome)' : 'var(--bg-input)',
                     display: 'grid', placeItems: 'center',
                     color: unavailable ? 'var(--ink-faint)' : 'var(--ink)',
                     overflow: 'hidden',
                   }}>
                <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                <span style={{ position: 'absolute', top: 1, left: 3, fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>
                  {i + 1}
                </span>
                {cd > 0 && (
                  <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)' }}>
                    {(cd / 1000).toFixed(1)}s
                  </span>
                )}
                {mpShort && cd === 0 && (
                  <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--accent-link)' }}>
                    {cfg.mpCost}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 回合資訊 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>回合倒數</div>
        <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 600, color: roundMs < 30000 ? 'var(--accent-danger)' : 'var(--ink)' }}>
          {fmtSec(roundMs)}
        </div>
      </div>

      {/* 全員名單 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between' }}>
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
              opacity: p.alive ? 1 : 0.5, marginTop: 4,
            }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.id === selfId ? '▶ ' : ''}{ch?.name ?? p.id.slice(0, 6)}
                {!p.alive && ' ✕'}
              </span>
              <span style={{ height: 6, background: 'var(--bg-input)', border: '1px solid var(--line-soft)', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: p.alive ? (pct < 0.3 ? 'var(--accent-danger)' : 'var(--accent)') : 'var(--ink-muted)' }} />
              </span>
            </div>
          );
        })}
      </div>

      {/* 操作提示 */}
      <div style={{ background: 'var(--bg-paper)', border: '1px solid var(--line-soft)', padding: 8, fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        <div style={{ color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 4 }}>操作提示</div>
        <div>WASD 移動</div>
        <div>滑鼠 aim · LMB 射擊</div>
        <div>1–5 施放技能</div>
        <div>ESC 老闆鍵</div>
      </div>
    </aside>
  );
}
