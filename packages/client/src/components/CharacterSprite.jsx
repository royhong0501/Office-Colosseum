import React from 'react';

// Vite glob import：build-time 把 assets/characters/*.png 全部納入並 hash 命名，cache-friendly。
// 沒有 PNG 的角色會走 fallback 渲染（彩色方塊 + 名稱首字）。
const modules = import.meta.glob('../assets/characters/*.png', {
  eager: true, import: 'default',
});

export const SPRITES = Object.fromEntries(
  Object.entries(modules).map(([k, v]) => {
    const m = k.match(/([^/]+)\.png$/);
    return [m ? m[1] : k, v];
  }),
);

export function hasSprite(id) {
  return Boolean(SPRITES[id]);
}

// ---- SVG 版本（給 ArenaDisk 戰鬥畫面用）-----------------------------------
// 角色置中於 (x, y)、佔 1×1 世界單位；facing 為弧度，cos(facing) < 0 時水平翻轉
export function CharacterSpriteSvg({
  character, x, y,
  facing = 0,
  shooting = false,
  hurt = false,
  paused = false,
}) {
  const url = SPRITES[character?.id];
  const flip = Math.cos(facing) < 0;

  // shooting 故意不加位移動畫；射擊用 hurt flash + projectile 視覺化即可
  const animations = [
    'pixelBob 1.6s ease-in-out infinite',
    hurt ? 'hurtFlash 220ms ease-out' : null,
  ].filter(Boolean).join(', ');

  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ filter: paused ? 'grayscale(0.8)' : 'none' }}
    >
      <g style={{ animation: animations, transformOrigin: '0 0' }}>
        <g transform={flip ? 'scale(-1, 1)' : undefined}>
          {url ? (
            <image
              href={url}
              x="-0.5" y="-0.5" width="1" height="1"
              preserveAspectRatio="xMidYMid meet"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <SpriteFallbackSvg character={character} />
          )}
        </g>
      </g>
    </g>
  );
}

function SpriteFallbackSvg({ character }) {
  const initial = character?.name?.slice(0, 1) ?? '?';
  return (
    <g>
      <rect
        x="-0.45" y="-0.45" width="0.9" height="0.9" rx="0.08"
        fill={character?.color ?? '#888'}
        stroke="#444" strokeWidth="0.03"
      />
      <text
        x="0" y="0.16" textAnchor="middle" fontSize="0.5"
        fill="#fff" fontWeight="700"
        style={{ fontFamily: '"Microsoft JhengHei", sans-serif' }}
      >
        {initial}
      </text>
    </g>
  );
}

// ---- HTML <img> 版本（給 CharacterBrowser / Lobby 用）----------------------
export function CharacterSpriteImg({
  character,
  size = 48,
  flip = false,
  style,
  className,
}) {
  const url = SPRITES[character?.id];
  if (!url) return <SpriteFallbackHtml character={character} size={size} />;
  return (
    <img
      src={url}
      alt={character?.name ?? ''}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        objectFit: 'contain',
        display: 'block',
        transform: flip ? 'scaleX(-1)' : undefined,
        ...style,
      }}
      className={className}
    />
  );
}

function SpriteFallbackHtml({ character, size }) {
  const initial = character?.name?.slice(0, 1) ?? '?';
  return (
    <div style={{
      width: size, height: size,
      background: character?.color ?? '#888',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700,
      fontSize: Math.max(10, size * 0.4),
      borderRadius: Math.max(2, size * 0.06),
      border: '1px solid #444',
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}
