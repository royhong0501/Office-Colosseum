import React from 'react';
import { getCharacterById } from '@office-colosseum/shared';
import AsciiCharacter from '../../components/AsciiCharacter.jsx';
import { excelColors } from '../../theme.js';

const GRID_W = 16;
const GRID_H = 10;
const COL_LABELS = 'ABCDEFGHIJKLMNOP'.split('');

function isArenaCenter(x, y) {
  const cx = GRID_W / 2, cy = GRID_H / 2;
  const dx = (x - cx + 0.5) / (GRID_W / 2);
  const dy = (y - cy + 0.5) / (GRID_H / 2);
  return dx * dx + dy * dy < 1;
}

// Props: { players: Array<Player>, effects: Array<{id,x,y,text,color}>, selfId: string }
export default function ArenaGrid({ players, effects, selfId }) {
  // Build lookup maps for fast cell rendering
  const playerByCell = {};
  for (const p of players) {
    const key = `${p.x},${p.y}`;
    playerByCell[key] = p;
  }

  const effectsByCell = {};
  for (const eff of effects) {
    const key = `${eff.x},${eff.y}`;
    if (!effectsByCell[key]) effectsByCell[key] = [];
    effectsByCell[key].push(eff);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Consolas, "Courier New", monospace' }}>
      {/* Column header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `28px repeat(${GRID_W}, 1fr)`,
        background: excelColors.headerBg,
        flexShrink: 0,
      }}>
        <div style={{
          borderRight: `0.5px solid ${excelColors.cellBorder}`,
          borderBottom: `0.5px solid ${excelColors.cellBorder}`,
        }} />
        {COL_LABELS.slice(0, GRID_W).map(l => (
          <div key={l} style={{
            textAlign: 'center', fontSize: 9, padding: '1px 0',
            color: excelColors.textLight,
            borderRight: `0.5px solid ${excelColors.cellBorder}`,
            borderBottom: `0.5px solid ${excelColors.cellBorder}`,
          }}>{l}</div>
        ))}
      </div>

      {/* Grid body */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `28px repeat(${GRID_W}, 1fr)`,
        gridTemplateRows: `repeat(${GRID_H}, 1fr)`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {Array.from({ length: GRID_H }, (_, row) => [
          // Row number header
          <div key={`r${row}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: excelColors.textLight,
            background: excelColors.headerBg,
            borderRight: `0.5px solid ${excelColors.cellBorder}`,
            borderBottom: `0.5px solid ${excelColors.cellBorder}`,
          }}>{row + 1}</div>,

          // Grid cells
          ...Array.from({ length: GRID_W }, (_, col) => {
            const cellKey = `${col},${row}`;
            const p = playerByCell[cellKey];
            const cellEffects = effectsByCell[cellKey];
            const inArena = isArenaCenter(col, row);
            const isSelf = p && p.id === selfId;

            let bg = inArena ? '#F8F4EC' : excelColors.cellBg;
            if (p) {
              if (!p.alive) bg = '#E8E8E8';
              else if (isSelf) bg = '#E8F0E0';
              else bg = '#F0E8E8';
            }

            const character = p ? getCharacterById(p.characterId) : null;
            const facing = p && p.facing === 'left' ? -1 : 1;

            return (
              <div key={`c${row}-${col}`} style={{
                border: `0.5px solid ${excelColors.cellBorder}`,
                background: bg,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: isSelf
                  ? `inset 0 0 0 2px ${excelColors.greenAccent}`
                  : inArena ? 'inset 0 0 4px rgba(139,115,85,0.08)' : 'none',
                // Greyscale overlay for paused players
                filter: p && p.paused ? 'grayscale(0.8)' : 'none',
              }}>
                {/* Arena center dot */}
                {!p && inArena && (
                  <span style={{ color: excelColors.cellBorder, fontSize: 7 }}>·</span>
                )}

                {/* Player: alive */}
                {p && p.alive && character && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    // Self-halo glow
                    boxShadow: isSelf ? `0 0 6px ${excelColors.greenAccent}80` : 'none',
                  }}>
                    <AsciiCharacter
                      character={character}
                      scale={0.55}
                      highlight={isSelf}
                      direction={facing}
                    />
                  </div>
                )}

                {/* Player: dead (grave marker) */}
                {p && !p.alive && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: excelColors.textLight,
                    opacity: 0.6,
                  }}>✝</div>
                )}

                {/* Floating damage effects */}
                {cellEffects && cellEffects.map(eff => (
                  <div key={eff.id} style={{
                    position: 'absolute', top: -8, left: '50%',
                    transform: 'translateX(-50%)',
                    color: eff.color, fontWeight: 900, fontSize: 13,
                    zIndex: 50, animation: 'floatUp 0.8s ease-out forwards',
                    pointerEvents: 'none',
                    textShadow: '0 0 6px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                  }}>{eff.text}</div>
                ))}
              </div>
            );
          }),
        ]).flat()}
      </div>
    </div>
  );
}
