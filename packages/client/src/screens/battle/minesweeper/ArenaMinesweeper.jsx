// 踩地雷盤面：CSS grid 儲存格。左鍵翻開、右鍵插旗。
// 視覺走試算表儲存格風：未翻=凸起 var(--bg-input)、已翻=平面 var(--bg-paper)。
// 用單色字元（⚑ 旗 / ✳ 雷）而非 emoji，貼合 mono 外觀。

import { memo } from 'react';

// 經典踩地雷數字配色
const NUM_COLORS = {
  1: '#2b62c9', 2: '#2f8a3b', 3: '#c0392b', 4: '#1f3a93',
  5: '#8a3d2c', 6: '#0f8b8d', 7: '#2b2b2b', 8: '#7a7a7a',
};

const ArenaMinesweeper = memo(function ArenaMinesweeper({
  cols, rows, revealed, flagged, mineCells, explodedKey, phase, onReveal, onFlag,
}) {
  const mineSet = mineCells ? new Set(mineCells.map(([c, r]) => `${c},${r}`)) : null;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = `${c},${r}`;
      const isRevealed = revealed.has(k);
      const isFlagged = flagged.has(k);
      const isMine = mineSet?.has(k);
      const isExploded = explodedKey === k;
      const adj = isRevealed ? revealed.get(k) : null;

      let bg = 'var(--bg-input)';
      let content = null;
      let color = 'var(--ink)';

      if (isExploded) {
        bg = 'var(--accent-danger)'; content = '✳'; color = 'var(--bg-paper)';
      } else if (isMine) {
        bg = 'var(--bg-paper)'; content = '✳'; color = 'var(--ink)';
      } else if (isRevealed) {
        bg = 'var(--bg-paper)';
        if (adj > 0) { content = String(adj); color = NUM_COLORS[adj] ?? 'var(--ink)'; }
      } else if (isFlagged) {
        content = '⚑'; color = 'var(--accent-danger)';
      }

      cells.push(
        <div
          key={k}
          onClick={() => phase === 'playing' && !isRevealed && !isFlagged && onReveal?.(c, r)}
          onContextMenu={(e) => { e.preventDefault(); if (phase === 'playing' && !isRevealed) onFlag?.(c, r); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: bg,
            border: '1px solid var(--line-soft)',
            borderColor: isRevealed || isMine || isExploded
              ? 'var(--line-soft)'
              : 'var(--line)',
            boxShadow: isRevealed || isMine || isExploded
              ? 'none'
              : 'inset 1px 1px 0 rgba(255,255,255,0.5), inset -1px -1px 0 rgba(0,0,0,0.15)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 'min(2.6vh, 15px)',
            color,
            cursor: phase === 'playing' && !isRevealed ? 'pointer' : 'default',
            userSelect: 'none',
            aspectRatio: '1 / 1',
          }}
        >{content}</div>,
      );
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 12, minHeight: 0, overflow: 'auto', background: 'var(--bg-paper-alt)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 0,
        width: `min(100%, ${cols / rows * 82}vh)`,
        maxWidth: '100%',
        border: '1px solid var(--line)',
      }}>
        {cells}
      </div>
    </div>
  );
});

export default ArenaMinesweeper;
