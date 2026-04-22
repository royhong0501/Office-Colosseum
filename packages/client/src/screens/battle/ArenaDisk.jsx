import React, { forwardRef } from 'react';
import { getCharacterById, ARENA_RADIUS } from '@office-colosseum/shared';
import { PixelCharacterSvg } from '../../components/PixelCharacter.jsx';
import { excelColors } from '../../theme.js';

// 將整個 PixelCharacter 的 viewBox (-1 0 18 16) 壓縮到世界 1 單位（直徑）內。
// 角色腳底約在 y=15；我們把玩家世界座標對應到角色身體中心（viewBox 大約 8, 10）。
const CHAR_VIEW_W = 18;
const CHAR_VIEW_H = 16;
const CHAR_CENTER_X = 8;
const CHAR_CENTER_Y = 10;
const CHAR_WORLD_SIZE = 1.6;  // 世界單位（角色高度比 player hit radius 稍大，視覺較有存在感）

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
  const r = ARENA_RADIUS;
  const viewBox = `${-r} ${-r} ${2 * r} ${2 * r}`;
  const charScale = CHAR_WORLD_SIZE / CHAR_VIEW_H;

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
        aspectRatio: '1 / 1',
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'min(100%, 100vh - 160px)',
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
          {/* 場地：同心圓「網格」仿 Excel 紙風格 */}
          <circle cx="0" cy="0" r={r} fill="#F8F4EC" stroke="#8B7355" strokeWidth="0.06" />
          <circle cx="0" cy="0" r={r * 0.25} fill="none" stroke="#D8CFBE" strokeWidth="0.03" />
          <circle cx="0" cy="0" r={r * 0.5}  fill="none" stroke="#D8CFBE" strokeWidth="0.03" />
          <circle cx="0" cy="0" r={r * 0.75} fill="none" stroke="#D8CFBE" strokeWidth="0.03" />

          {/* 十字線（像 Excel 座標的視覺參考）*/}
          <line x1={-r} y1="0" x2={r} y2="0" stroke="#E4DCC8" strokeWidth="0.02" />
          <line x1="0" y1={-r} x2="0" y2={r} stroke="#E4DCC8" strokeWidth="0.02" />

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
                  <circle cx={p.x} cy={p.y} r="0.7"
                    fill="none" stroke={excelColors.greenAccent} strokeWidth="0.05" opacity="0.7" />
                )}
                {/* 敵人底下加淡紅環 */}
                {!isSelf && (
                  <circle cx={p.x} cy={p.y} r="0.55"
                    fill="none" stroke="#B85450" strokeWidth="0.04" opacity="0.5" />
                )}
                <g
                  transform={`translate(${p.x} ${p.y}) scale(${charScale}) translate(${-CHAR_CENTER_X} ${-CHAR_CENTER_Y})`}
                  style={{ filter: p.paused ? 'grayscale(0.8)' : 'none' }}
                >
                  <PixelCharacterSvg
                    character={character}
                    facing={p.facing ?? 0}
                    shooting={shootingIds?.has(p.id) ?? false}
                    hurt={hurtIds?.has(p.id) ?? false}
                    highlight={isSelf}
                  />
                </g>
              </g>
            );
          })}

          {/* 投射物（浮點座標） */}
          {projectiles.map(proj => (
            <circle
              key={proj.id}
              cx={proj.x}
              cy={proj.y}
              r={proj.isSkill ? 0.24 : 0.18}
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
          const pctX = ((eff.x + r) / (2 * r)) * 100;
          const pctY = ((eff.y + r) / (2 * r)) * 100;
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
