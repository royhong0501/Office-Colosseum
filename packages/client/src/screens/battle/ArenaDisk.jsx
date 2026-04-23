import React, { forwardRef } from 'react';
import { getCharacterById, ARENA_WIDTH, ARENA_HEIGHT } from '@office-colosseum/shared';
import { CharacterSpriteSvg } from '../../components/CharacterSprite.jsx';
import { excelColors } from '../../theme.js';

// 投射物 SVG 覆蓋在玩家之上。effects 用 HTML overlay 處理（absolute + transform）。
// 滑鼠事件掛在 forwardRef 的外層 div 上，給 useInputCapture(arenaRef, ...) 使用。
const ArenaDisk = forwardRef(function ArenaDisk({
  players,
  effects,
  projectiles = [],
  shootingIds,
  hurtIds,
  selfId,
}, ref) {
  const W = ARENA_WIDTH;
  const H = ARENA_HEIGHT;
  const halfW = W / 2;
  const halfH = H / 2;
  const viewBox = `${-halfW} ${-halfH} ${W} ${H}`;

  // Excel 格線：每 1 世界單位一條
  const gridStep = 1;
  const vLines = [];
  for (let x = -halfW + gridStep; x < halfW; x += gridStep) vLines.push(x);
  const hLines = [];
  for (let y = -halfH + gridStep; y < halfH; y += gridStep) hLines.push(y);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: excelColors.cellBg,
        userSelect: 'none',
      }}
    >
      <div style={{
        position: 'relative',
        aspectRatio: `${W} / ${H}`,
        maxWidth: '100%',
        maxHeight: 'calc(100vh - 160px)',
        width: '100%',
      }}>
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="auto"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            display: 'block',
          }}
        >
          {/* 場地底色 + 外框（Excel 試算表風） */}
          <rect x={-halfW} y={-halfH} width={W} height={H}
            fill="#F8F4EC" stroke="#8B7355" strokeWidth="0.06" />

          {/* 次要格線（每 gridStep 一條） */}
          {vLines.map(x => (
            <line key={`v${x}`} x1={x} y1={-halfH} x2={x} y2={halfH}
              stroke="#D8CFBE" strokeWidth="0.03" />
          ))}
          {hLines.map(y => (
            <line key={`h${y}`} x1={-halfW} y1={y} x2={halfW} y2={y}
              stroke="#D8CFBE" strokeWidth="0.03" />
          ))}

          {/* 中心十字參考線 */}
          <line x1={-halfW} y1="0" x2={halfW} y2="0" stroke="#E4DCC8" strokeWidth="0.02" />
          <line x1="0" y1={-halfH} x2="0" y2={halfH} stroke="#E4DCC8" strokeWidth="0.02" />

          {/* 玩家 */}
          {players.map(p => {
            if (!p.alive) {
              return (
                <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
                  <circle cx="0" cy="0" r="0.5" fill="#CCC" opacity="0.5" />
                  <text x="0" y="0.25" textAnchor="middle" fontSize="0.7" fill="#666">✝</text>
                </g>
              );
            }
            const character = getCharacterById(p.characterId);
            if (!character) return null;
            const isSelf = p.id === selfId;
            // 自己底下加綠色高亮環
            return (
              <g key={p.id}>
                {isSelf && (
                  <circle cx={p.x} cy={p.y} r="0.5"
                    fill="none" stroke={excelColors.greenAccent} strokeWidth="0.04" opacity="0.7" />
                )}
                {/* 敵人底下加淡紅環 */}
                {!isSelf && (
                  <circle cx={p.x} cy={p.y} r="0.4"
                    fill="none" stroke="#B85450" strokeWidth="0.03" opacity="0.5" />
                )}
                <CharacterSpriteSvg
                  character={character}
                  x={p.x} y={p.y}
                  facing={p.facing ?? 0}
                  shooting={shootingIds?.has(p.id) ?? false}
                  hurt={hurtIds?.has(p.id) ?? false}
                  paused={p.paused}
                />
              </g>
            );
          })}

          {/* 投射物（浮點座標） */}
          {projectiles.map(proj => (
            <circle
              key={proj.id}
              cx={proj.x}
              cy={proj.y}
              r={proj.isSkill ? 0.15 : 0.1}
              fill={proj.isSkill ? '#B85450' : '#DAA520'}
              style={{
                transition: 'cx 33ms linear, cy 33ms linear',
                filter: `drop-shadow(0 0 3px ${proj.isSkill ? '#B85450' : '#DAA520'})`,
              }}
            />
          ))}
        </svg>

        {/* Effects overlay（HTML 層，用 world→viewport 換算到 %） */}
        {effects.map(eff => {
          const pctX = ((eff.x + halfW) / W) * 100;
          const pctY = ((eff.y + halfH) / H) * 100;
          return (
            <div
              key={eff.id}
              style={{
                position: 'absolute',
                left: `${pctX}%`,
                top: `${pctY}%`,
                transform: 'translate(-50%, -100%)',
                color: eff.color,
                fontWeight: 900,
                fontSize: 13,
                fontFamily: 'Consolas, "Courier New", monospace',
                textShadow: '0 0 6px rgba(0,0,0,0.35)',
                animation: 'floatUp 0.8s ease-out forwards',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 50,
              }}
            >{eff.text}</div>
          );
        })}
      </div>
    </div>
  );
});

export default ArenaDisk;
