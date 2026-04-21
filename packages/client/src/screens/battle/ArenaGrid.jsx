import React from 'react';
import { getCharacterById } from '@office-colosseum/shared';
import PixelCharacter from '../../components/PixelCharacter.jsx';
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

// Props: { players, effects, projectiles, shootingIds, hurtIds, selfId }
export default function ArenaGrid({
  players,
  effects,
  projectiles = [],
  shootingIds,
  hurtIds,
  selfId,
}) {
  const playerByCell = {};
  for (const p of players) playerByCell[`${p.x},${p.y}`] = p;

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
        {/* Projectile overlay — above cells, below floating damage text */}
        {projectiles.length > 0 && (
          <svg
            viewBox={`0 0 ${GRID_W} ${GRID_H}`}
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              top: 0, left: 28, right: 0, bottom: 0,
              pointerEvents: 'none',
              zIndex: 30,
            }}
          >
            {projectiles.map(proj => (
              <circle
                key={proj.id}
                cx={proj.x + 0.5}
                cy={proj.y + 0.5}
                r={proj.isSkill ? 0.12 : 0.08}
                fill={proj.isSkill ? '#B85450' : '#DAA520'}
                style={{
                  transition: 'cx 33ms linear, cy 33ms linear',
                  filter: `drop-shadow(0 0 1.5px ${proj.isSkill ? '#B85450' : '#DAA520'})`,
                }}
              />
            ))}
          </svg>
        )}

        {Array.from({ length: GRID_H }, (_, row) => [
          <div key={`r${row}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: excelColors.textLight,
            background: excelColors.headerBg,
            borderRight: `0.5px solid ${excelColors.cellBorder}`,
            borderBottom: `0.5px solid ${excelColors.cellBorder}`,
          }}>{row + 1}</div>,

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

            return (
              <div key={`c${row}-${col}`} style={{
                border: `0.5px solid ${excelColors.cellBorder}`,
                background: bg,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'visible',
                boxShadow: isSelf
                  ? `inset 0 0 0 2px ${excelColors.greenAccent}`
                  : inArena ? 'inset 0 0 4px rgba(139,115,85,0.08)' : 'none',
                filter: p && p.paused ? 'grayscale(0.8)' : 'none',
              }}>
                {!p && inArena && (
                  <span style={{ color: excelColors.cellBorder, fontSize: 7 }}>·</span>
                )}

                {p && p.alive && character && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PixelCharacter
                      character={character}
                      facing={p.facing}
                      shooting={shootingIds?.has(p.id) ?? false}
                      hurt={hurtIds?.has(p.id) ?? false}
                      highlight={isSelf}
                      size={28}
                    />
                  </div>
                )}

                {p && !p.alive && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: excelColors.textLight,
                    opacity: 0.6,
                  }}>✝</div>
                )}

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
