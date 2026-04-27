// Territory SVG 渲染：22×13 塗色格 + players，隊色由 state.teams 提供。

import { forwardRef, memo } from 'react';
import {
  ARENA_COLS, ARENA_ROWS, PLAYER_RADIUS,
} from '@office-colosseum/shared/src/games/territory/constants.js';
import { getCharacterById } from '@office-colosseum/shared';
import { CharacterSpriteSvg } from '../../../components/CharacterSprite.jsx';
import {
  useRafTick, useTrackSnapshot, lerpT, interpolateMap,
} from '../../../hooks/useInterpolation.js';

const ArenaTerritory = memo(forwardRef(function ArenaTerritory(
  { teams, players, cells, selfId },
  ref,
) {
  // 60Hz 補幀，只補 players（cells 是 server 增量更新的塗色，不需 lerp）
  useRafTick();
  const playersSnap = useTrackSnapshot(players);
  const renderPlayers = interpolateMap(playersSnap.prev, playersSnap.curr, lerpT(playersSnap.currAt));

  const teamColor = (tid) => {
    const t = teams?.find((x) => x.id === tid);
    return t?.color ?? { base: '#ccc', deep: '#999' };
  };

  const cellEls = [];
  for (const [key, tid] of Object.entries(cells ?? {})) {
    const [c, r] = key.split(',').map(Number);
    const col = teamColor(tid);
    cellEls.push(
      <rect key={`c-${key}`} x={c} y={r} width={1} height={1} fill={col.base} opacity={0.85} />,
    );
  }

  const playerEls = [];
  for (const p of Object.values(renderPlayers ?? {})) {
    if (!p.alive) continue;
    const ch = getCharacterById(p.characterId);
    const col = teamColor(p.teamId);
    const isSelf = p.id === selfId;
    playerEls.push(
      <g key={p.id}>
        {/* 隊色環 */}
        <circle
          cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.12}
          fill="none" stroke={col.edge ?? col.deep} strokeWidth={0.08}
          opacity={0.85}
        />
        {/* 自己綠邊高亮 */}
        {isSelf && (
          <circle cx={p.x} cy={p.y} r={PLAYER_RADIUS + 0.22}
                  fill="none" stroke="var(--accent)" strokeWidth={0.05} strokeDasharray="0.2 0.1" opacity={0.8} />
        )}
        <CharacterSpriteSvg character={ch} x={p.x} y={p.y} facing={p.facing ?? 0} />
      </g>,
    );
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${ARENA_COLS} ${ARENA_ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: '100%', height: '100%',
        background: 'var(--bg-paper)',
        userSelect: 'none',
      }}
    >
      {/* 格線 — pattern 化 */}
      <defs>
        <pattern id="grid-territory" width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 L 0 1" fill="none" stroke="var(--line-soft)" strokeWidth={0.02} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={ARENA_COLS} height={ARENA_ROWS} fill="url(#grid-territory)" />
      {cellEls}
      {playerEls}
    </svg>
  );
}));

export default ArenaTerritory;
