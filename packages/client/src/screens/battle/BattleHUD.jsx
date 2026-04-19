import React from 'react';
import { getCharacterById } from '@office-colosseum/shared';
import { excelColors } from '../../theme.js';

// Props: { players: Array<Player>, selfId: string, now: number }
export default function BattleHUD({ players, selfId, now }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
      gap: 4, padding: '4px 8px',
      background: excelColors.headerBg,
      borderBottom: `2px solid ${excelColors.accent}`,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 10,
      flexShrink: 0,
    }}>
      {players.map((p, idx) => {
        const character = getCharacterById(p.characterId);
        const isSelf = p.id === selfId;
        const hpPct = p.maxHp > 0 ? Math.max(0, p.hp / p.maxHp) : 0;
        const isLowHp = hpPct < 0.3;
        const cdRemaining = Math.max(0, Math.ceil((p.skillCdUntil - now) / 1000));
        const skillReady = cdRemaining <= 0;

        return (
          <div key={p.id} style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: '3px 6px',
            border: `1px solid ${isSelf ? excelColors.greenAccent : excelColors.cellBorder}`,
            borderRadius: 3,
            background: isSelf ? '#E8F0E0' : excelColors.cellBg,
            minWidth: 100, maxWidth: 150, flex: '1 1 100px',
            opacity: p.alive ? 1 : 0.5,
            boxShadow: isSelf ? `0 0 4px ${excelColors.greenAccent}60` : 'none',
          }}>
            {/* Player label */}
            <div style={{
              fontWeight: isSelf ? 700 : 600,
              color: isSelf ? excelColors.greenAccent : excelColors.accent,
              fontSize: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              textDecoration: p.alive ? 'none' : 'line-through',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isSelf ? '★ ' : `P${idx + 1} `}{character?.name ?? p.id.slice(0, 6)}
              </span>
              {p.alive && p.paused && (
                <span style={{ fontSize: 9, color: excelColors.textLight, marginLeft: 2 }}>[P]</span>
              )}
            </div>

            {/* HP bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: excelColors.textLight, flexShrink: 0 }}>HP</span>
              <div style={{
                flex: 1, height: 6,
                background: excelColors.cellBorder,
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${hpPct * 100}%`, height: '100%',
                  background: isLowHp ? excelColors.redAccent : excelColors.greenAccent,
                  transition: 'width 0.2s',
                }} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: 600,
                color: isLowHp ? excelColors.redAccent : excelColors.text,
                flexShrink: 0,
              }}>{p.hp}/{p.maxHp}</span>
            </div>

            {/* Skill cooldown */}
            <div style={{
              fontSize: 9, color: skillReady ? excelColors.greenAccent : excelColors.textLight,
              fontWeight: skillReady ? 700 : 400,
            }}>
              {skillReady ? '✓ SKL:READY' : `⏱ SKL:${cdRemaining}s`}
            </div>
          </div>
        );
      })}

      {/* Controls reminder */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '3px 8px', marginLeft: 'auto',
        color: excelColors.textLight, fontSize: 9, lineHeight: 1.5,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 600, color: excelColors.accent }}>WASD/↑↓←→ Move</div>
        <div>J=Attack  K=Skill</div>
      </div>
    </div>
  );
}
