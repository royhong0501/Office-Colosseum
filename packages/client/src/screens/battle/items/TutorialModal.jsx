// Items 進場教學 modal — 列出 5 個技能 + 快捷鍵。
import { SKILLS, SKILL_KEYS } from '@office-colosseum/shared/src/games/items/constants.js';

const SKILL_META = {
  freeze:   { emoji: '❄', name: '凍結窗格', fn: '=FREEZE(cell)', desc: '經過後施放，格子顯示灰底；下一個踩到的敵人原地定身 2 秒。' },
  undo:     { emoji: '↶', name: 'Ctrl+Z · 撤銷', fn: '=UNDO()', desc: '立即恢復自身 2 秒前的生命值，並解除移動減緩、定身等負面狀態。' },
  merge:    { emoji: '⊞', name: '合併儲存格', fn: '=MERGE(range)', desc: '施放後格子合併，下位踏入的玩家移動速度減緩 50%。' },
  readonly: { emoji: '🔒', name: '唯讀模式炸彈', fn: '=READONLY()', desc: '經過後格子上鎖；下一位玩家踩到後 5 秒內無法施放任何技能。' },
  validate: { emoji: '▼', name: '資料驗證', fn: '=VALIDATE()', desc: '下拉選單箭頭放置在地板；下一位踏入玩家會被傳送到隨機座標。' },
};

export default function TutorialModal({ onClose }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: 560,
          background: 'var(--bg-paper)',
          border: '1px solid var(--line)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.22)',
          fontSize: 12,
        }}
      >
        <div style={{
          padding: '7px 10px',
          background: 'var(--bg-chrome)',
          borderBottom: '1px solid var(--line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>進階儲存格格式工具 · 快速入門</span>
          <span style={{ cursor: 'pointer' }} onClick={onClose}>✕</span>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
            歡迎首次使用 · 以下 5 個技能可在工具列 ƒx 隨時查看
          </div>
          <h3 style={{ fontSize: 14, margin: '6px 0 10px' }}>5 種儲存格技能</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 6, marginBottom: 10,
          }}>
            {SKILL_KEYS.map((kind, i) => {
              const meta = SKILL_META[kind];
              const cfg = SKILLS[kind];
              return (
                <div key={kind} style={{
                  border: '1px solid var(--line)',
                  background: 'var(--bg-input)',
                  padding: 8,
                  display: 'flex', flexDirection: 'column', gap: 4,
                  alignItems: 'center', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22 }}>{meta.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{meta.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--accent-link)', fontFamily: 'var(--font-mono)' }}>{meta.fn}</div>
                  <div style={{ fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    {i + 1} · MP {cfg.mpCost} · CD {cfg.cdMs / 1000}s
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', lineHeight: 1.6, marginBottom: 10 }}>
            {SKILL_KEYS.map((k) => (
              <div key={k}>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{SKILL_META[k].emoji} {SKILL_META[k].name}：</span>
                {SKILL_META[k].desc}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10, lineHeight: 1.6 }}>
            快捷鍵：<code>WASD</code> 移動 · <code>滑鼠左鍵</code> 射擊 · <code>1–5</code> 施放技能 · <code>Esc</code> 切換老闆鍵
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <div className="btn-cell" onClick={onClose}>稍後查看</div>
            <div className="btn-cell primary" onClick={onClose}>開始對戰</div>
          </div>
        </div>
      </div>
    </div>
  );
}
