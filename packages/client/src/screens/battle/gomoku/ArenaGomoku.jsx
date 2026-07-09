// 五子棋棋盤 SVG：15×15 格線 + 黑白棋子 + 最後一手標記 + 勝連高亮。
// 每格一個透明可點 rect（座標已知，免去 letterbox 換算）；輪到自己才吃點擊。

import { forwardRef, memo } from 'react';
import { BOARD_SIZE } from '@office-colosseum/shared/src/games/gomoku/constants.js';

const STONE_FILL = { black: '#2b2b2b', white: '#f4f1ea' };
const STONE_STROKE = { black: '#000', white: '#b9b2a2' };

const ArenaGomoku = memo(forwardRef(function ArenaGomoku(
  { board = {}, lastMove, winningLine, myTurn = false, onCellClick },
  ref,
) {
  const winSet = new Set((winningLine ?? []).map(([c, r]) => `${c},${r}`));

  const stoneEls = [];
  for (const [key, color] of Object.entries(board)) {
    const [c, r] = key.split(',').map(Number);
    stoneEls.push(
      <circle
        key={`s-${key}`}
        cx={c + 0.5} cy={r + 0.5} r={0.4}
        fill={STONE_FILL[color] ?? '#888'}
        stroke={STONE_STROKE[color] ?? '#555'} strokeWidth={0.03}
      />,
    );
  }

  // 勝連高亮：在棋子下墊一層底色
  const winEls = [...winSet].map((key) => {
    const [c, r] = key.split(',').map(Number);
    return <rect key={`w-${key}`} x={c + 0.05} y={r + 0.05} width={0.9} height={0.9}
                 fill="var(--accent)" opacity={0.35} />;
  });

  // 可點擊的透明格（永遠可點，實際能不能落子由 handler 判斷）
  const clickEls = [];
  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      clickEls.push(
        <rect
          key={`h-${c},${r}`}
          x={c} y={r} width={1} height={1}
          fill="transparent"
          style={{ cursor: myTurn ? 'pointer' : 'default' }}
          onClick={() => onCellClick?.(c, r)}
        />,
      );
    }
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', background: 'var(--bg-paper)', userSelect: 'none' }}
    >
      <defs>
        <pattern id="grid-gomoku" width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 L 0 1" fill="none" stroke="var(--line-soft)" strokeWidth={0.03} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={BOARD_SIZE} height={BOARD_SIZE} fill="url(#grid-gomoku)" />
      {winEls}
      {stoneEls}
      {/* 最後一手標記 */}
      {lastMove && (
        <rect x={lastMove.c + 0.32} y={lastMove.r + 0.32} width={0.36} height={0.36}
              fill="none" stroke="var(--accent-danger)" strokeWidth={0.06} />
      )}
      {clickEls}
    </svg>
  );
}));

export default ArenaGomoku;
