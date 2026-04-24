// BR 戰鬥場地渲染（SVG，corner-origin viewBox="0 0 ARENA_COLS ARENA_ROWS"）。
// 靜態層：grid 線 + covers（合併儲存格深色塊）
// 動態層：poison cells（紅底 + #REF!/#VALUE!/#NULL! 文字）、players（sprite + HP 條 + shield glow）、bullets（圓點 + trail）

import { forwardRef } from 'react';
import {
  ARENA_COLS, ARENA_ROWS, PLAYER_RADIUS, PROJECTILE_RADIUS,
} from '@office-colosseum/shared/src/games/br/constants.js';
import { getCharacterById } from '@office-colosseum/shared';
import { CharacterSpriteSvg } from '../../../components/CharacterSprite.jsx';

const POISON_LABELS = ['#REF!', '#VALUE!', '#NULL!'];

const ArenaBR = forwardRef(function ArenaBR(
  { map, players, bullets, poison, selfId, hurtIds, now },
  ref,
) {
  const coverCells = [];
  for (const [c, r, w, h] of map?.covers ?? []) {
    coverCells.push(
      <rect
        key={`cv-${c}-${r}-${w}-${h}`}
        x={c} y={r} width={w} height={h}
        fill="var(--accent)"
        opacity="0.78"
        stroke="var(--line)"
        strokeWidth={0.04}
      />,
    );
  }

  const infectedCells = [];
  const severeSet = new Set(poison?.severe ?? []);
  for (const key of poison?.infected ?? []) {
    const [c, r] = key.split(',').map(Number);
    const isSevere = severeSet.has(key);
    const label = POISON_LABELS[(c + r) % POISON_LABELS.length];
    infectedCells.push(
      <g key={`ps-${key}`}>
        <rect
          x={c} y={r} width={1} height={1}
          fill="var(--accent-danger)"
          opacity={isSevere ? 0.5 : 0.28}
        />
        <text
          x={c + 0.5} y={r + 0.62}
          textAnchor="middle"
          fontSize="0.26"
          fontFamily="var(--font-mono)"
          fill="var(--accent-danger)"
          opacity={0.7}
        >
          {label}
        </text>
      </g>,
    );
  }

  const playerEls = [];
  for (const p of Object.values(players ?? {})) {
    if (!p.alive) continue;
    const ch = getCharacterById(p.characterId);
    const isSelf = p.id === selfId;
    const hurt = hurtIds?.has(p.id);
    // Shield glow
    const shieldRing = p.shielding ? (
      <circle
        cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.18}
        fill="none"
        stroke="var(--accent-link)"
        strokeWidth={0.08}
        opacity={0.75}
        style={{ animation: 'shieldBreath 0.9s ease-in-out infinite' }}
      />
    ) : null;
    // 自己綠、敵人紅高亮
    const selfRing = (
      <circle
        cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.08}
        fill="none"
        stroke={isSelf ? 'var(--accent)' : 'var(--accent-danger)'}
        strokeWidth={0.04}
        opacity={0.5}
      />
    );
    // HP mini bar above head
    const hpPct = Math.max(0, p.hp / p.maxHp);
    const hpColor = hpPct < 0.3 ? 'var(--accent-danger)' : hpPct < 0.6 ? '#c79a1a' : '#4f8d4f';
    playerEls.push(
      <g key={p.id}>
        {shieldRing}
        {selfRing}
        <CharacterSpriteSvg character={ch} x={p.x} y={p.y} facing={p.facing ?? 0} hurt={hurt} paused={p.paused} />
        {/* HP bar */}
        <rect x={p.x - 0.45} y={p.y - 0.7} width={0.9} height={0.12} fill="var(--bg-input)" stroke="var(--line)" strokeWidth={0.02} />
        <rect x={p.x - 0.45} y={p.y - 0.7} width={0.9 * hpPct} height={0.12} fill={hpColor} />
      </g>,
    );
  }

  const bulletEls = (bullets ?? []).map((b) => (
    <g key={b.id}>
      <circle cx={b.x} cy={b.y} r={PROJECTILE_RADIUS + 0.04} fill="#DAA520" opacity="0.3" />
      <circle cx={b.x} cy={b.y} r={PROJECTILE_RADIUS} fill="#DAA520" stroke="var(--ink)" strokeWidth={0.015} />
    </g>
  ));

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${ARENA_COLS} ${ARENA_ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-input)',
        cursor: 'crosshair',
        userSelect: 'none',
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
      {/* covers */}
      {coverCells}
      {/* poison */}
      {infectedCells}
      {/* bullets（在 player 底下，避免遮住角色） */}
      {bulletEls}
      {/* players */}
      {playerEls}
    </svg>
  );
});

export default ArenaBR;
