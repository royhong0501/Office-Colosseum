// hold T 期間出現在畫面下方的 6 格 emote bar。
// 試算表偽裝風：白底 + 細黑線 + 等寬字體 + 無圓角。
// cooldown 中：整條變灰並顯示倒數秒。

import { EMOTES } from '@office-colosseum/shared';

export default function EmoteBar({ open, cooldownUntil = 0 }) {
  if (!open) return null;
  const now = Date.now();
  const inCooldown = cooldownUntil > now;
  const remainSec = inCooldown ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6000,
        display: 'flex',
        gap: 0,
        background: 'var(--bg-paper)',
        border: '1px solid var(--ink)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        opacity: inCooldown ? 0.55 : 1,
        filter: inCooldown ? 'grayscale(0.8)' : 'none',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {EMOTES.map((e) => (
        <div
          key={e.slot}
          style={{
            padding: '4px 10px',
            borderRight: '1px solid var(--line-soft)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 56,
          }}
        >
          <span style={{ color: 'var(--ink-muted)', fontSize: 9 }}>[{e.key}]</span>
          <span style={{ color: 'var(--ink)', fontSize: 13, lineHeight: 1.1 }}>{e.kaomoji}</span>
          <span style={{ color: 'var(--ink-muted)', fontSize: 9 }}>{e.label}</span>
        </div>
      ))}
      {inCooldown && (
        <div style={{
          padding: '4px 10px',
          background: 'var(--accent-danger)',
          color: 'var(--bg-paper)',
          fontSize: 11,
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
        }}>
          CD {remainSec}s
        </div>
      )}
    </div>
  );
}
