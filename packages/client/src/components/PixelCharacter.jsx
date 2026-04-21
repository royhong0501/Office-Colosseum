import React from 'react';
import { excelColors } from '../theme.js';

const FACING_TRANSFORM = {
  right: 'scaleX(1)',
  left:  'scaleX(-1)',
  up:    'rotate(-90deg)',
  down:  'rotate(90deg)',
};

// Per-breed visual variants. Drives which ears / body shape / pattern / accents
// get rendered on top of the base silhouette.
const VARIANTS = {
  // —— Cats ——
  munchkin:         { ears: 'pointy',  body: 'short',  eyeColor: '#1a8f2e' },
  persian:          { ears: 'tufted',  fluff: true },
  siamese:          { ears: 'pointy',  faceMask: '#6B4E2E', eyeColor: '#4B7FC8' },
  scottish_fold:    { ears: 'folded' },
  maine_coon:       { ears: 'tufted',  body: 'wide' },
  bengal:           { ears: 'pointy',  pattern: 'spots', spotColor: '#4a3520' },
  ragdoll:          { ears: 'pointy',  eyeColor: '#4B7FC8', fluff: true },
  russian_blue:     { ears: 'pointy',  eyeColor: '#2a9632' },
  sphynx:           { ears: 'pointy',  hairless: true, eyeColor: '#B85450' },
  british_shorthair:{ ears: 'rounded', body: 'wide', eyeColor: '#D4A030' },

  // —— Dogs ——
  husky:            { ears: 'sharp',   mask: true,   eyeColor: '#4B7FC8' },
  golden:           { ears: 'droop' },
  shiba:            { ears: 'sharp' },
  corgi:            { ears: 'sharp',   body: 'short' },
  poodle:           { ears: 'droop',   curly: true,  fluff: true },
  german_shepherd:  { ears: 'sharp',   twoTone: '#8B6F47' },
  border_collie:    { ears: 'halfup',  twoTone: '#F5F5F5' },
  bulldog:          { ears: 'droop',   body: 'wide' },
  dalmatian:        { ears: 'droop',   pattern: 'spots', spotColor: '#222' },
  akita:            { ears: 'sharp',   twoTone: '#F5E6D3' },
};

export default function PixelCharacter({
  character,
  facing = 'right',
  shooting = false,
  hurt = false,
  highlight = false,
  size = 28,
}) {
  const body = character?.color ?? '#888';
  const shade = shadeColor(body, -0.22);
  const variant = VARIANTS[character?.id] ?? { ears: character?.type === 'cat' ? 'pointy' : 'droop' };
  const eyeColor = variant.eyeColor ?? '#000';

  const animations = [
    'pixelBob 1.6s ease-in-out infinite',
    shooting ? 'pixelShoot 160ms ease-out' : '',
    hurt ? 'hurtFlash 220ms ease-out' : '',
  ].filter(Boolean).join(', ');

  return (
    <div style={{
      width: size,
      height: size,
      display: 'inline-block',
      transform: FACING_TRANSFORM[facing] ?? FACING_TRANSFORM.right,
      transition: 'transform 0.08s linear',
      filter: highlight ? `drop-shadow(0 0 3px ${excelColors.greenAccent})` : 'none',
      pointerEvents: 'none',
    }}>
      <svg
        viewBox="-1 0 18 16"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        overflow="visible"
        style={{ animation: animations, display: 'block' }}
      >
        {renderBody(body, shade, variant)}
        {renderEars(body, shade, variant.ears)}
        {renderFace(variant, body)}
        {renderEyes(eyeColor, variant)}
        {renderPattern(variant)}
        {renderGun()}
        {shooting && (
          <circle
            cx="17" cy="9.5" r="1.6"
            fill="#FFD700"
            style={{ animation: 'muzzleFlash 160ms ease-out forwards' }}
          />
        )}
      </svg>
    </div>
  );
}

// ——— Body silhouette (legs + torso + head) ———
function renderBody(body, shade, variant) {
  const { body: shape = 'normal', twoTone, fluff, hairless, curly } = variant;
  const bodyColor = hairless ? shadeColor(body, 0.15) : body;

  // Dimensions keyed off the 16-wide viewBox, grounded at y=15.
  let torsoX = 3, torsoY = 7, torsoW = 10, torsoH = 6;
  let headX = 4, headY = 3, headW = 8, headH = 5;
  let legY = 13, legH = 2;

  if (shape === 'short') {
    // Short stubby legs, body sits lower; corgi/munchkin vibe
    torsoY = 9; torsoH = 4;
    headY = 5; headH = 4;
    legY = 13; legH = 2;
  } else if (shape === 'wide') {
    // Heavier frame; bulldog/maine coon
    torsoX = 2; torsoW = 12;
    headX = 3; headW = 10;
  }

  const parts = [];

  // Fluffy outline — extra pixels around edges (persian, ragdoll, poodle)
  if (fluff) {
    parts.push(
      <rect key="f1" x={torsoX - 1} y={torsoY + 1} width="1" height={torsoH - 1} fill={shadeColor(body, 0.1)} />,
      <rect key="f2" x={torsoX + torsoW} y={torsoY + 1} width="1" height={torsoH - 1} fill={shadeColor(body, 0.1)} />,
      <rect key="f3" x={headX - 1} y={headY + 1} width="1" height={headH - 1} fill={shadeColor(body, 0.1)} />,
      <rect key="f4" x={headX + headW} y={headY + 1} width="1" height={headH - 1} fill={shadeColor(body, 0.1)} />,
    );
  }

  // Legs
  parts.push(
    <rect key="l1" x={torsoX + 1} y={legY} width="2" height={legH} fill={shade} />,
    <rect key="l2" x={torsoX + torsoW - 3} y={legY} width="2" height={legH} fill={shade} />,
  );

  // Torso
  parts.push(<rect key="torso" x={torsoX} y={torsoY} width={torsoW} height={torsoH} fill={bodyColor} />);

  // Two-tone back patch (border collie = white, german shepherd = tan saddle)
  if (twoTone) {
    parts.push(
      <rect key="tt" x={torsoX + 1} y={torsoY} width={torsoW - 2} height={Math.max(2, Math.floor(torsoH / 2))} fill={twoTone} />,
    );
  }

  // Head
  parts.push(<rect key="head" x={headX} y={headY} width={headW} height={headH} fill={bodyColor} />);

  // Poodle curly fluff — circles on head and body
  if (curly) {
    parts.push(
      <circle key="c1" cx={headX + 1} cy={headY + 1} r="1.2" fill={shadeColor(body, 0.08)} />,
      <circle key="c2" cx={headX + headW - 1} cy={headY + 1} r="1.2" fill={shadeColor(body, 0.08)} />,
      <circle key="c3" cx={headX + headW / 2} cy={headY} r="1.2" fill={shadeColor(body, 0.08)} />,
      <circle key="c4" cx={torsoX + 2} cy={torsoY + 1} r="1.4" fill={shadeColor(body, 0.08)} />,
      <circle key="c5" cx={torsoX + torsoW - 2} cy={torsoY + 1} r="1.4" fill={shadeColor(body, 0.08)} />,
    );
  }

  return <g>{parts}</g>;
}

// ——— Ears ———
function renderEars(body, shade, style) {
  switch (style) {
    case 'pointy':  // sharp cat ears
      return (
        <g>
          <polygon points="4,4 5,0 7,4" fill={body} />
          <polygon points="9,4 11,0 12,4" fill={body} />
        </g>
      );
    case 'tufted':  // big fluffy cat ears (maine coon, persian)
      return (
        <g>
          <polygon points="3,4 5,-1 7,4" fill={body} />
          <polygon points="9,4 11,-1 13,4" fill={body} />
          <rect x="4" y="0" width="1" height="1" fill={shadeColor(body, 0.15)} />
          <rect x="11" y="0" width="1" height="1" fill={shadeColor(body, 0.15)} />
        </g>
      );
    case 'folded':  // scottish fold — curled down
      return (
        <g>
          <rect x="4" y="3" width="2" height="1" fill={shade} />
          <rect x="10" y="3" width="2" height="1" fill={shade} />
        </g>
      );
    case 'rounded':  // british shorthair — small rounded
      return (
        <g>
          <rect x="4" y="2" width="2" height="2" fill={body} />
          <rect x="10" y="2" width="2" height="2" fill={body} />
        </g>
      );
    case 'sharp':  // husky/shiba/corgi/akita — upright triangle dog ears
      return (
        <g>
          <polygon points="3,4 4,0 6,4" fill={body} />
          <polygon points="10,4 12,0 13,4" fill={body} />
        </g>
      );
    case 'droop':  // golden/bulldog/dalmatian — floppy
      return (
        <g>
          <rect x="2" y="2" width="2" height="5" fill={shade} />
          <rect x="12" y="2" width="2" height="5" fill={shade} />
        </g>
      );
    case 'halfup':  // border collie — semi-upright
      return (
        <g>
          <polygon points="3,4 4,1 5,4" fill={body} />
          <polygon points="11,4 12,1 13,4" fill={body} />
          <rect x="4" y="3" width="1" height="2" fill={shade} />
          <rect x="12" y="3" width="1" height="2" fill={shade} />
        </g>
      );
    default:
      return null;
  }
}

// ——— Face overlay (mask / siamese color points) ———
function renderFace(variant, body) {
  const parts = [];
  if (variant.faceMask) {
    // Siamese — dark face mask on lower half
    parts.push(
      <rect key="fm" x="5" y="6" width="6" height="2" fill={variant.faceMask} />,
      <rect key="fm2" x="6" y="5" width="4" height="1" fill={variant.faceMask} opacity="0.6" />,
    );
  }
  if (variant.mask) {
    // Husky — pale chest/face blaze down the middle
    parts.push(
      <rect key="hm1" x="7" y="4" width="2" height="3" fill="#F5F5F5" />,
      <rect key="hm2" x="6" y="7" width="4" height="2" fill="#F5F5F5" opacity="0.85" />,
    );
  }
  // Nose
  parts.push(<rect key="nose" x="7" y="7" width="2" height="1" fill="#F4A6A6" />);
  return <g>{parts}</g>;
}

// ——— Eyes ———
function renderEyes(color, variant) {
  // Scottish fold has eyes slightly lower / wider-set vibe; most others standard.
  return (
    <g>
      <rect x="6" y="5" width="1" height="1" fill={color} />
      <rect x="9" y="5" width="1" height="1" fill={color} />
    </g>
  );
}

// ——— Body pattern (spots / stripes) ———
function renderPattern(variant) {
  if (variant.pattern === 'spots') {
    const c = variant.spotColor ?? '#222';
    // Deterministic scattered spots on torso (y 8-12)
    return (
      <g>
        <rect x="4"  y="8"  width="1" height="1" fill={c} />
        <rect x="7"  y="9"  width="1" height="1" fill={c} />
        <rect x="10" y="8"  width="1" height="1" fill={c} />
        <rect x="5"  y="11" width="1" height="1" fill={c} />
        <rect x="9"  y="11" width="1" height="1" fill={c} />
        <rect x="11" y="10" width="1" height="1" fill={c} />
      </g>
    );
  }
  return null;
}

// ——— Gun ———
function renderGun() {
  return (
    <g>
      <rect x="13" y="9" width="3" height="1" fill="#333" />
      <rect x="16" y="9" width="1" height="1" fill="#222" />
    </g>
  );
}

function shadeColor(hex, amt) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const mult = 1 + amt;
  const to2 = n => Math.max(0, Math.min(255, Math.round(n * mult))).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
