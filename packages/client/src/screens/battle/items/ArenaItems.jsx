// Items 戰場 SVG 渲染：18×9 格子 + traps + players + bullets + debuff 視覺。

import { forwardRef } from 'react';
import {
  ARENA_COLS, ARENA_ROWS, PLAYER_RADIUS, PROJECTILE_RADIUS,
} from '@office-colosseum/shared/src/games/items/constants.js';
import { getCharacterById } from '@office-colosseum/shared';
import { CharacterSpriteSvg } from '../../../components/CharacterSprite.jsx';

const TRAP_STYLE = {
  freeze:   { fill: '#bdd7e6', glyph: '❄', color: '#2f5a7a' },
  merge:    { fill: '#dcc9a0', glyph: '⊞', color: '#8a6a3a' },
  readonly: { fill: '#e0dccc', glyph: '🔒', color: '#6a5f4a' },
  validate: { fill: '#f5f0c8', glyph: '▼', color: '#7a6830' },
};

const ArenaItems = forwardRef(function ArenaItems(
  { players, bullets, traps, selfId, hurtIds, now },
  ref,
) {
  const trapEls = (traps ?? []).map((t) => {
    const s = TRAP_STYLE[t.kind] ?? { fill: '#ccc', glyph: '?', color: '#333' };
    return (
      <g key={`trap-${t.id}`}>
        <rect x={t.cx} y={t.cy} width={1} height={1} fill={s.fill} stroke="var(--line)" strokeWidth={0.04} opacity={0.85} />
        <text x={t.cx + 0.5} y={t.cy + 0.7} textAnchor="middle" fontSize="0.55" fill={s.color}>{s.glyph}</text>
      </g>
    );
  });

  const playerEls = [];
  for (const p of Object.values(players ?? {})) {
    if (!p.alive) continue;
    const ch = getCharacterById(p.characterId);
    const isSelf = p.id === selfId;
    const hurt = hurtIds?.has(p.id);
    const frozen = now < (p.frozenUntil ?? 0);
    const slowed = now < (p.slowedUntil ?? 0);
    const silenced = now < (p.silencedUntil ?? 0);

    const hpPct = Math.max(0, p.hp / p.maxHp);
    const mpPct = Math.max(0, (p.mp ?? 0) / (p.maxMp ?? 1));
    const hpColor = hpPct < 0.3 ? 'var(--accent-danger)' : hpPct < 0.6 ? '#c79a1a' : '#4f8d4f';

    playerEls.push(
      <g key={p.id}>
        {/* 自己綠 / 敵人紅 高亮環 */}
        <circle
          cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.08}
          fill="none"
          stroke={isSelf ? 'var(--accent)' : 'var(--accent-danger)'}
          strokeWidth={0.04} opacity={0.5}
        />
        {/* debuff 光環 */}
        {frozen && (
          <circle cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.2}
                  fill="none" stroke="#5aa0c8" strokeWidth={0.08} opacity={0.7} />
        )}
        {slowed && (
          <circle cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.16}
                  fill="none" stroke="#b5894a" strokeWidth={0.06} opacity={0.6} strokeDasharray="0.2 0.1" />
        )}
        {silenced && (
          <circle cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.18}
                  fill="none" stroke="var(--ink-muted)" strokeWidth={0.06} opacity={0.6} strokeDasharray="0.1 0.1" />
        )}
        <CharacterSpriteSvg character={ch} x={p.x} y={p.y} facing={p.facing ?? 0} hurt={hurt} paused={p.paused} />
        {/* HP / MP 條 */}
        <rect x={p.x - 0.45} y={p.y - 0.8} width={0.9} height={0.1} fill="var(--bg-input)" stroke="var(--line)" strokeWidth={0.02} />
        <rect x={p.x - 0.45} y={p.y - 0.8} width={0.9 * hpPct} height={0.1} fill={hpColor} />
        <rect x={p.x - 0.45} y={p.y - 0.68} width={0.9} height={0.08} fill="var(--bg-input)" stroke="var(--line)" strokeWidth={0.02} />
        <rect x={p.x - 0.45} y={p.y - 0.68} width={0.9 * mpPct} height={0.08} fill="var(--accent-link)" />
      </g>,
    );
  }

  const bulletEls = (bullets ?? []).map((b) => (
    <circle key={b.id} cx={b.x} cy={b.y} r={PROJECTILE_RADIUS} fill="#DAA520" stroke="var(--ink)" strokeWidth={0.015} />
  ));

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${ARENA_COLS} ${ARENA_ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%', height: '100%',
        background: 'var(--bg-input)',
        cursor: 'crosshair', userSelect: 'none',
      }}
    >
      {/* 格線 */}
      <g>
        {Array.from({ length: ARENA_COLS + 1 }).map((_, i) => (
          <line key={`vl-${i}`} x1={i} x2={i} y1={0} y2={ARENA_ROWS} stroke="var(--line-soft)" strokeWidth={0.02} />
        ))}
        {Array.from({ length: ARENA_ROWS + 1 }).map((_, i) => (
          <line key={`hl-${i}`} x1={0} x2={ARENA_COLS} y1={i} y2={i} stroke="var(--line-soft)" strokeWidth={0.02} />
        ))}
      </g>
      {trapEls}
      {bulletEls}
      {playerEls}
    </svg>
  );
});

export default ArenaItems;
