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
  skillCasts = [],
  dashTrails = [],
  muzzleFlashes = [],
  hurtIds,
  selfId,
  now = Date.now(),
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
            const shielded = (p.shieldedUntil ?? 0) > now;
            return (
              <g key={p.id}>
                {isSelf && (
                  <circle cx={p.x} cy={p.y} r="0.5"
                    fill="none" stroke={excelColors.greenAccent} strokeWidth="0.04" opacity="0.7" />
                )}
                {!isSelf && (
                  <circle cx={p.x} cy={p.y} r="0.4"
                    fill="none" stroke="#B85450" strokeWidth="0.03" opacity="0.5" />
                )}
                {shielded && (
                  <g transform={`translate(${p.x} ${p.y})`} style={{ transformOrigin: '0 0' }}>
                    <circle cx="0" cy="0" r="0.7"
                      fill="none" stroke="#5B7FA5" strokeWidth="0.06"
                      style={{
                        animation: 'shieldBreath 1200ms ease-in-out infinite',
                        transformOrigin: '0 0',
                        filter: 'drop-shadow(0 0 4px #5B7FA5)',
                      }} />
                    <circle cx="0" cy="0" r="0.58"
                      fill="#5B7FA5" opacity="0.08" />
                  </g>
                )}
                {(p.speedBuffUntil ?? 0) > now && (
                  <g transform={`translate(${p.x} ${p.y})`} style={{ transformOrigin: '0 0' }}>
                    <circle cx="0" cy="0" r="0.62"
                      fill="none" stroke="#E8A040" strokeWidth="0.05" strokeDasharray="0.15 0.1"
                      style={{
                        animation: 'speedBuffAura 700ms ease-in-out infinite',
                        transformOrigin: '0 0',
                        filter: 'drop-shadow(0 0 3px #FFC070)',
                      }} />
                  </g>
                )}
                <CharacterSpriteSvg
                  character={character}
                  x={p.x} y={p.y}
                  facing={p.facing ?? 0}
                  hurt={hurtIds?.has(p.id) ?? false}
                  paused={p.paused}
                />
                {shielded && (
                  <text x={p.x} y={p.y - 0.68} textAnchor="middle" fontSize="0.32"
                    fill="#5B7FA5" fontWeight="700"
                    style={{
                      fontFamily: 'Consolas, "Courier New", monospace',
                      paintOrder: 'stroke',
                      stroke: '#FFFFFF',
                      strokeWidth: '0.06',
                      strokeLinejoin: 'round',
                    }}>
                    {`${Math.max(0, Math.ceil((p.shieldedUntil - now) / 1000))}s`}
                  </text>
                )}
              </g>
            );
          })}

          {/* 投射物（浮點座標）— variant='strike' → 青綠色；isSkill → 紅色；普攻 → 金色 */}
          {projectiles.map(proj => {
            const color = proj.variant === 'strike' ? '#4DB8C4'
              : proj.isSkill ? '#B85450'
              : '#DAA520';
            return (
              <circle
                key={proj.id}
                cx={proj.x}
                cy={proj.y}
                r={proj.isSkill ? 0.15 : 0.1}
                fill={color}
                style={{
                  transition: 'cx 33ms linear, cy 33ms linear',
                  filter: `drop-shadow(0 0 3px ${color})`,
                }}
              />
            );
          })}

          {/* 技能施放特效：burst（buff 啟動閃光） / heal（上升粒子） */}
          {/* strike 現在是射飛彈，cast VFX 由 projectile_spawn 的 muzzleFlashes 處理 */}
          {skillCasts.map(sc => {
            if (sc.kind === 'burst') {
              return (
                <g key={sc.id} transform={`translate(${sc.x} ${sc.y})`}
                  style={{
                    animation: 'burstRing 400ms ease-out forwards',
                    transformOrigin: '0 0',
                    pointerEvents: 'none',
                  }}>
                  <circle cx="0" cy="0" r="1"
                    fill="none" stroke="#E8A040" strokeWidth="0.09"
                    style={{ filter: 'drop-shadow(0 0 5px #FFC070)' }} />
                  <circle cx="0" cy="0" r="0.85"
                    fill="none" stroke="#FFFFFF" strokeWidth="0.03" opacity="0.6" />
                </g>
              );
            }
            if (sc.kind === 'heal') {
              return (
                <g key={sc.id} transform={`translate(${sc.x} ${sc.y})`} style={{ pointerEvents: 'none' }}>
                  {[-0.2, 0, 0.2].map((dx, i) => (
                    <circle key={i} cx={dx} cy="0.1" r="0.09"
                      fill="#6B8E5A"
                      style={{
                        animation: `healRise 700ms ease-out ${i * 80}ms forwards`,
                        filter: 'drop-shadow(0 0 3px #A8D090)',
                      }} />
                  ))}
                </g>
              );
            }
            return null;
          })}

          {/* Dash 尾跡（from → to 連線 + 3 顆殘影） */}
          {dashTrails.map(dt => {
            const segs = [0.25, 0.5, 0.75];
            return (
              <g key={dt.id} style={{ animation: 'dashTrail 500ms ease-out forwards', pointerEvents: 'none' }}>
                <line x1={dt.from.x} y1={dt.from.y} x2={dt.to.x} y2={dt.to.y}
                  stroke="#5C8BB2" strokeWidth="0.06" strokeLinecap="round" opacity="0.6"
                  style={{ filter: 'drop-shadow(0 0 3px #5C8BB2)' }} />
                {segs.map((t, i) => (
                  <circle key={i}
                    cx={dt.from.x + (dt.to.x - dt.from.x) * t}
                    cy={dt.from.y + (dt.to.y - dt.from.y) * t}
                    r="0.28"
                    fill="none" stroke="#5C8BB2" strokeWidth="0.04"
                    opacity={0.2 + i * 0.15} />
                ))}
              </g>
            );
          })}

          {/* 技能投射物槍口閃光 — strike 青綠、其餘技能橘黃 */}
          {muzzleFlashes.map(mf => {
            const isStrike = mf.variant === 'strike';
            const outer = isStrike ? '#8DE0E8' : '#FFD27A';
            const glow = isStrike ? '#4DB8C4' : '#FF8A3D';
            return (
              <g key={mf.id} transform={`translate(${mf.x} ${mf.y})`}
                style={{
                  animation: 'muzzleFlash 150ms ease-out forwards',
                  transformOrigin: '0 0',
                  pointerEvents: 'none',
                }}>
                <circle cx="0" cy="0" r="0.4"
                  fill={outer} opacity="0.85"
                  style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
                <circle cx="0" cy="0" r="0.2" fill="#FFFFFF" opacity="0.9" />
              </g>
            );
          })}
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
