// Distinct procedural renderer for each breed.
// 40x40 grid, chibi proportions: head centered at (20,15), body at (20,30).
// Each breed has a hand-tuned draw function to ensure uniqueness.

const R = {}; // renderers by breed id

// ============ COLOR UTILS ============
function mkPal(base, shadow, highlight, opts = {}) {
  return {
    base, shadow, highlight,
    white: opts.white || "#fff8e8",
    cream: opts.cream || "#f8e8c0",
    eye: opts.eye || "#2a1a10",
    eyeLight: opts.eyeLight || "#ffffff",
    nose: opts.nose || "#b05868",
    inner: opts.inner || "#e8a0a8",
    mouth: opts.mouth || "#2a1a10",
    points: opts.points,
    outline: opts.outline || "#1f1410"
  };
}

// ============ SHARED PARTS ============
// Head: rounded blob centered at (cx, cy) rx=12 ry=10
function catHead(pix, P, opts = {}) {
  pix.ellipse(20, 16, 12, 10, P.base);
  // cheek shadow
  if (!opts.noCheeks) {
    pix.ellipse(9, 18, 2, 3, P.shadow);
    pix.ellipse(31, 18, 2, 3, P.shadow);
  }
  // forehead highlight
  pix.rect(15, 8, 2, 1, P.highlight);
  pix.rect(18, 7, 2, 1, P.highlight);
  pix.rect(23, 8, 2, 1, P.highlight);
}

function dogHead(pix, P) {
  // Slightly wider jaw - flat bottom
  pix.ellipse(20, 16, 13, 10, P.base);
  // Snout protrusion
  pix.ellipse(20, 21, 5, 3, P.base);
  pix.ellipse(9, 18, 2, 3, P.shadow);
  pix.ellipse(31, 18, 2, 3, P.shadow);
  pix.rect(15, 8, 2, 1, P.highlight);
  pix.rect(23, 8, 2, 1, P.highlight);
}

// Generic body: small torso + 4 legs + paws
function body(pix, P, opts = {}) {
  const short = opts.short;
  // Neck/shoulder transition — wider fluffy ruff style (Persian-like)
  pix.ellipse(20, 26, 10, 3, P.base);
  pix.ellipse(20, 27, 11, 2, P.base);
  // torso
  pix.ellipse(20, 30, 9, 4, P.base);
  // belly white
  if (!opts.noBelly) pix.ellipse(20, 31, 6, 3, P.white);
  // legs
  const legY = 33, legH = short ? 3 : 5;
  pix.rect(12, legY, 3, legH, P.base);
  pix.rect(16, legY, 3, legH, P.base);
  pix.rect(21, legY, 3, legH, P.base);
  pix.rect(25, legY, 3, legH, P.base);
  // paws
  const pawY = legY + legH - 1;
  const pawC = opts.pawColor || P.shadow;
  pix.rect(12, pawY, 3, 1, pawC);
  pix.rect(16, pawY, 3, 1, pawC);
  pix.rect(21, pawY, 3, 1, pawC);
  pix.rect(25, pawY, 3, 1, pawC);
}

// Ears
function earsPointy(pix, P, opts = {}) {
  const c = opts.color || P.base;
  pix.triangle(8, 4, 13, 3, 13, 11, c);
  pix.triangle(27, 3, 32, 4, 27, 11, c);
  // inner
  pix.triangle(10, 6, 12, 6, 12, 10, opts.inner || P.inner);
  pix.triangle(28, 6, 30, 6, 28, 10, opts.inner || P.inner);
}

function earsPointyTufted(pix, P) {
  // Maine coon tufted
  pix.triangle(7, 3, 13, 2, 13, 12, P.base);
  pix.triangle(27, 2, 33, 3, 27, 12, P.base);
  pix.triangle(10, 5, 12, 5, 12, 11, P.inner);
  pix.triangle(28, 5, 30, 5, 28, 11, P.inner);
  // Tufts
  pix.px(6, 2, P.base); pix.px(7, 1, P.base);
  pix.px(33, 2, P.base); pix.px(34, 1, P.base);
  // Extra fluff
  pix.px(8, 5, P.highlight); pix.px(32, 5, P.highlight);
}

function earsPointySmall(pix, P) {
  pix.triangle(10, 6, 13, 5, 13, 11, P.base);
  pix.triangle(27, 5, 30, 6, 27, 11, P.base);
  pix.triangle(11, 7, 12, 7, 12, 10, P.inner);
  pix.triangle(28, 7, 29, 7, 28, 10, P.inner);
}

function earsFolded(pix, P) {
  // Scottish fold: tiny folded ears (only lower half visible)
  pix.rect(10, 9, 4, 3, P.base);
  pix.rect(26, 9, 4, 3, P.base);
  pix.rect(11, 10, 2, 1, P.shadow);
  pix.rect(27, 10, 2, 1, P.shadow);
}

function earsHuge(pix, P) {
  // Sphynx oversized
  pix.triangle(5, 2, 14, 1, 14, 12, P.base);
  pix.triangle(26, 1, 35, 2, 26, 12, P.base);
  pix.triangle(8, 4, 12, 4, 12, 11, P.inner);
  pix.triangle(28, 4, 32, 4, 28, 11, P.inner);
}

function earsPrick(pix, P, opts = {}) {
  // Upright pointy (dogs: Husky/Shiba/Akita/Shepherd)
  const c = opts.color || P.base;
  pix.triangle(7, 3, 13, 4, 13, 12, c);
  pix.triangle(27, 4, 33, 3, 27, 12, c);
  pix.triangle(9, 6, 12, 7, 12, 11, opts.inner || P.inner);
  pix.triangle(28, 7, 31, 6, 28, 11, opts.inner || P.inner);
}

function earsPrickSmall(pix, P) {
  // Corgi bat ears
  pix.triangle(9, 5, 13, 6, 13, 12, P.base);
  pix.triangle(27, 6, 31, 5, 27, 12, P.base);
  pix.triangle(10, 7, 12, 8, 12, 11, P.inner);
  pix.triangle(28, 8, 30, 7, 28, 11, P.inner);
}

function earsSemiPrick(pix, P) {
  // Border collie folded tip
  pix.triangle(7, 5, 13, 4, 13, 12, P.base);
  pix.triangle(27, 4, 33, 5, 27, 12, P.base);
  // Folded tip (lighter/different angle)
  pix.rect(7, 5, 3, 2, P.shadow);
  pix.rect(31, 5, 3, 2, P.shadow);
}

function earsDropLong(pix, P) {
  // Golden/Poodle drooping ears
  pix.ellipse(7, 18, 3, 7, P.base);
  pix.ellipse(33, 18, 3, 7, P.base);
  pix.ellipse(7, 22, 2, 4, P.shadow);
  pix.ellipse(33, 22, 2, 4, P.shadow);
}

function earsDropMed(pix, P) {
  // Dalmatian/Beagle-like
  pix.ellipse(8, 17, 3, 6, P.base);
  pix.ellipse(32, 17, 3, 6, P.base);
}

function earsRose(pix, P) {
  // Bulldog rose (small folded back)
  pix.rect(10, 8, 4, 3, P.base);
  pix.rect(26, 8, 4, 3, P.base);
  pix.px(11, 9, P.shadow); pix.px(28, 9, P.shadow);
}

// Eyes
function eyes(pix, P, opts = {}) {
  const eyeX1 = opts.x1 ?? 13, eyeX2 = opts.x2 ?? 24;
  const eyeY = opts.y ?? 14;
  const c = opts.color || P.eye;
  const w = opts.w ?? 3, h = opts.h ?? 3;
  if (opts.closed) {
    pix.rect(eyeX1, eyeY + 1, w, 1, P.mouth);
    pix.rect(eyeX2, eyeY + 1, w, 1, P.mouth);
    return;
  }
  // Colored iris
  pix.rect(eyeX1, eyeY, w, h, c);
  pix.rect(eyeX2, eyeY, w, h, c);
  // Black pupil
  if (opts.iris) {
    pix.rect(eyeX1 + 1, eyeY + 1, 1, 1, P.mouth);
    pix.rect(eyeX2 + 1, eyeY + 1, 1, 1, P.mouth);
  }
  // White highlight
  pix.px(eyeX1, eyeY, P.eyeLight);
  pix.px(eyeX2, eyeY, P.eyeLight);
}

function noseMouth(pix, P, opts = {}) {
  const ny = opts.noseY ?? 18;
  // Nose only (triangle). Mouth omitted — just fur + nose.
  pix.rect(19, ny, 2, 1, P.nose);
  pix.px(19, ny + 1, P.nose);
  pix.px(20, ny + 1, P.nose);
}

// Tail
function tail(pix, style, P) {
  switch (style) {
    case "curl-up": // Shiba/Akita
      pix.rect(28, 25, 2, 2, P.base);
      pix.rect(30, 24, 2, 2, P.base);
      pix.rect(31, 26, 1, 2, P.base);
      pix.rect(29, 27, 2, 1, P.base);
      break;
    case "fluffy": // Persian/Maine Coon
      pix.ellipse(32, 28, 4, 4, P.base);
      pix.rect(28, 27, 4, 2, P.base);
      pix.px(34, 26, P.highlight);
      break;
    case "straight":
      pix.rect(29, 28, 4, 2, P.base);
      pix.rect(32, 25, 2, 3, P.base);
      break;
    case "stub":
      pix.rect(29, 28, 2, 2, P.base);
      break;
    case "plume":
      pix.rect(28, 26, 2, 3, P.base);
      pix.ellipse(32, 25, 3, 3, P.base);
      break;
    case "thin":
      pix.rect(29, 28, 4, 1, P.base);
      pix.rect(32, 25, 1, 3, P.base);
      break;
    default:
      pix.rect(29, 28, 3, 2, P.base);
  }
}

// ============ BREED RENDERERS ============

// 01 Munchkin 曼赤肯 - cream, short legs, BSH-style ears
R[1] = (pix) => {
  const P = mkPal("#f0dcb0", "#c8a870", "#fff4dc", { eye: "#4a8a3a", nose: "#d09080" });
  const pinkInner = "#e8a8a0";
  // BSH-style small rounded low-set ears
  pix.rect(10, 6, 4, 3, P.base);
  pix.rect(26, 6, 4, 3, P.base);
  pix.px(11, 5, P.base); pix.px(27, 5, P.base);
  pix.px(12, 4, P.base); pix.px(28, 4, P.base);
  pix.px(11, 7, pinkInner); pix.px(12, 6, pinkInner);
  pix.px(28, 7, pinkInner); pix.px(27, 6, pinkInner);
  catHead(pix, P, { noCheeks: true });
  body(pix, P, { short: true });
  tail(pix, "straight", P);
  // British Shorthair-style eyes (4x3 dark base + iris pixel + highlight)
  pix.rect(13, 15, 4, 3, "#1a2814");
  pix.rect(23, 15, 4, 3, "#1a2814");
  pix.px(14, 16, "#4a8a3a"); pix.px(24, 16, "#4a8a3a");
  pix.px(14, 15, P.white); pix.px(24, 15, P.white);
  noseMouth(pix, P);
  return P;
};

// 02 Persian 波斯貓 - cream body w/ ginger patches, flat face, green eyes
R[2] = (pix) => {
  const P = mkPal("#f8ecd8", "#d8a878", "#ffffff", { eye: "#68a04a", nose: "#d09080" });
  const ginger = "#e89858";      // orange patch color
  const gingerLt = "#f0b478";    // lighter ginger
  const fluff = "#fce4c4";

  // Small rounded low-set ears (British Shorthair style), ginger outside + pink inside
  const pinkInner = "#e8a8a0";
  pix.rect(10, 6, 4, 3, ginger);
  pix.rect(26, 6, 4, 3, ginger);
  pix.px(11, 5, ginger); pix.px(27, 5, ginger);
  pix.px(12, 4, ginger); pix.px(28, 4, ginger);
  pix.px(11, 7, pinkInner); pix.px(12, 6, pinkInner);
  pix.px(28, 7, pinkInner); pix.px(27, 6, pinkInner);

  // Standard cat head (cream base)
  catHead(pix, P, { noCheeks: true });
  // Remove forehead highlights (paint over with base)
  pix.rect(15, 8, 2, 1, P.base);
  pix.rect(18, 7, 2, 1, P.base);
  pix.rect(23, 8, 2, 1, P.base);

  // Ginger patches around each eye (like Ragdoll mask, but ginger)
  // Left eye patch
  pix.ellipse(12, 13, 4, 3, ginger);
  pix.rect(9, 9, 7, 5, ginger);
  pix.px(8, 12, gingerLt); pix.px(8, 13, gingerLt);
  pix.px(16, 14, gingerLt); pix.px(15, 15, gingerLt);

  // Right eye patch
  pix.ellipse(28, 13, 4, 3, ginger);
  pix.rect(24, 9, 7, 5, ginger);
  pix.px(31, 12, gingerLt); pix.px(31, 13, gingerLt);
  pix.px(24, 14, gingerLt); pix.px(25, 15, gingerLt);

  // Cream blaze between the two patches
  pix.rect(19, 9, 2, 5, P.base);

  // Fluffy forehead tufts poking out
  pix.px(9, 10, fluff); pix.px(31, 10, fluff);
  pix.px(8, 13, fluff); pix.px(32, 13, fluff);
  pix.px(7, 17, fluff); pix.px(33, 17, fluff);

  // Big round green eyes (Persian signature)
  eyes(pix, P, { color: "#68a04a" });

  // Flat smushy nose
  pix.rect(18, 18, 4, 1, P.shadow);
  pix.rect(19, 19, 2, 1, P.nose);

  // Fluffy ruff (narrower, tucked in — no wild left tuft)
  pix.ellipse(20, 24, 10, 2, fluff);
  pix.ellipse(20, 25, 11, 2, P.white);
  pix.ellipse(20, 26, 10, 2, P.white);

  // Body — all cream (no ginger on chest/back)
  body(pix, P);
  // White belly fluff
  pix.ellipse(20, 32, 7, 2, P.white);

  // Plume tail — ginger with cream tip
  tail(pix, "fluffy", P);
  pix.ellipse(34, 23, 2, 2, ginger);
  pix.ellipse(35, 25, 2, 2, gingerLt);
  pix.px(34, 22, fluff); pix.px(36, 24, fluff); pix.px(35, 26, fluff);

  return P;
};

// 03 Siamese 暹羅貓 - cream body, dark points, blue eyes
R[3] = (pix) => {
  const P = mkPal("#f0e0c0", "#e0c8a0", "#ffffff", { eye: "#4a8acc", nose: "#a06048" });
  const pt = "#3a1e10";
  const ptLight = "#6a3a20";
  // British Shorthair-style small pointy ears (colorpoint dark)
  pix.rect(10, 6, 4, 3, pt);
  pix.rect(26, 6, 4, 3, pt);
  pix.px(11, 5, pt); pix.px(27, 5, pt);
  pix.px(12, 4, pt); pix.px(28, 4, pt);
  pix.px(11, 7, "#7a3828"); pix.px(12, 6, "#7a3828");
  pix.px(28, 7, "#7a3828"); pix.px(27, 6, "#7a3828");
  catHead(pix, P);

  // Full colorpoint face mask — ONE solid dark shape covering upper + lower face
  pix.ellipse(20, 15, 10, 4, pt);   // forehead through eyes
  pix.ellipse(20, 19, 8, 3, pt);    // cheeks + muzzle
  pix.ellipse(20, 21, 6, 2, pt);    // chin tip
  // Fill any gap between bands
  pix.rect(13, 17, 14, 2, pt);

  body(pix, P);

  // Dark legs (full leg colorpoint, not just paws)
  pix.rect(13, 32, 2, 6, pt);
  pix.rect(16, 32, 2, 6, pt);
  pix.rect(22, 32, 2, 6, pt);
  pix.rect(25, 32, 2, 6, pt);

  // Dark tail (full)
  pix.rect(28, 28, 3, 2, pt);
  pix.rect(31, 24, 2, 5, pt);
  pix.rect(33, 22, 2, 3, pt);

  // Piercing blue eyes (on top of mask)
  eyes(pix, P, { color: "#4a90d8" });

  // Pink nose (on top of dark muzzle)
  pix.rect(19, 19, 2, 1, "#f8b8a8");
  return P;
};

// 04 Scottish Fold 蘇格蘭摺耳 - silver, small folded ears poking up
R[4] = (pix) => {
  const P = mkPal("#d0cec8", "#8a8680", "#eae8e0", { eye: "#c87820", nose: "#a08080" });
  // Head FIRST
  catHead(pix, P, { noCheeks: true });
  // Folded ears — small triangles that peek above head outline
  // Left ear (folded down, inner edge darker)
  pix.rect(10, 6, 3, 2, P.base);     // top bump above head
  pix.px(10, 8, P.base); pix.px(12, 8, P.base);
  pix.px(11, 7, P.shadow);            // fold crease
  pix.px(12, 6, "#b8b4ae");           // edge shading
  // Right ear
  pix.rect(27, 6, 3, 2, P.base);
  pix.px(27, 8, P.base); pix.px(29, 8, P.base);
  pix.px(28, 7, P.shadow);
  pix.px(27, 6, "#b8b4ae");

  // Round chubby cheeks (highlight)
  pix.ellipse(11, 18, 2, 2, P.highlight);
  pix.ellipse(29, 18, 2, 2, P.highlight);

  body(pix, P);
  tail(pix, "straight", P);
  eyes(pix, P, { color: "#c87820" });
  noseMouth(pix, P);
  return P;
};

// 05 American Shorthair 美國短毛貓 - classic silver tabby, M mark, yellow-green eyes
R[5] = (pix) => {
  const P = mkPal("#c4cad0", "#5a6068", "#e8ecf0", { eye: "#a8c038", nose: "#e8a8a0" });
  const dark = "#2e3238";        // near-black stripe
  const mid = "#5a6068";         // mid stripe
  const lightSilver = "#dde2e6"; // pale silver between stripes
  const white = "#ffffff";
  const pinkRim = "#8a4848";

  // Pointy-but-slightly-rounded ears (shorter than Maine Coon, taller than BSH)
  pix.rect(10, 8, 4, 1, P.base);
  pix.rect(10, 7, 4, 1, P.base);
  pix.rect(11, 6, 3, 1, P.base);
  pix.rect(11, 5, 3, 1, P.base);
  pix.rect(12, 4, 2, 1, P.base);
  pix.rect(26, 8, 4, 1, P.base);
  pix.rect(26, 7, 4, 1, P.base);
  pix.rect(26, 6, 3, 1, P.base);
  pix.rect(26, 5, 3, 1, P.base);
  pix.rect(26, 4, 2, 1, P.base);
  // Ear inside shading
  pix.px(12, 7, mid); pix.px(27, 7, mid);
  pix.px(12, 6, dark); pix.px(27, 6, dark);

  // Round head
  catHead(pix, P, { noCheeks: true });

  // Classic "M" forehead marking — centered, 3 clean vertical strokes
  // Two outer strokes (the peaks of the M)
  pix.rect(16, 9, 1, 3, dark);
  pix.rect(23, 9, 1, 3, dark);
  // Two inner strokes (the V inside the M) — shorter
  pix.rect(18, 10, 1, 2, dark);
  pix.rect(21, 10, 1, 2, dark);
  // Tiny bridge connectors at top making it read as "M"
  pix.px(17, 9, mid);
  pix.px(22, 9, mid);
  // Center dip
  pix.px(19, 11, mid); pix.px(20, 11, mid);

  // Arched "worry lines" above each eye (concentric brow arches)
  // Left brow — two stacked arches
  pix.px(11, 12, mid); pix.px(12, 11, mid); pix.px(13, 11, mid); pix.px(14, 12, mid);
  pix.px(12, 13, dark); pix.px(13, 13, dark);
  // Right brow (mirror)
  pix.px(29, 12, mid); pix.px(28, 11, mid); pix.px(27, 11, mid); pix.px(26, 12, mid);
  pix.px(28, 13, dark); pix.px(27, 13, dark);

  // Cheek swirl — diagonal strokes fanning from nose back toward ears
  // Left cheek (3 strokes, stepped)
  pix.px(13, 17, dark); pix.px(12, 18, dark);
  pix.px(11, 19, dark); pix.px(10, 20, dark);
  pix.px(14, 19, mid); pix.px(13, 20, mid);
  // Right cheek (mirror)
  pix.px(27, 17, dark); pix.px(28, 18, dark);
  pix.px(29, 19, dark); pix.px(30, 20, dark);
  pix.px(26, 19, mid); pix.px(27, 20, mid);

  // White muzzle + chin
  pix.ellipse(20, 20, 4, 2, white);
  pix.ellipse(20, 22, 5, 1, white);

  // Body — silver base with classic tabby rings
  body(pix, P);

  // Classic tabby body stripes (thick dark rings wrapping the body)
  // Shoulder ring
  pix.rect(11, 27, 3, 1, dark);
  pix.rect(26, 27, 3, 1, dark);
  pix.px(10, 28, dark); pix.px(29, 28, dark);
  // Mid body ring
  pix.rect(11, 30, 4, 1, dark);
  pix.rect(25, 30, 4, 1, dark);
  pix.px(10, 31, mid); pix.px(29, 31, mid);
  // Hip ring
  pix.rect(12, 33, 4, 1, dark);
  pix.rect(24, 33, 4, 1, dark);

  // Spine darker shade down center back
  pix.rect(19, 27, 2, 1, mid);
  pix.rect(19, 29, 2, 1, mid);
  pix.rect(19, 31, 2, 1, mid);

  // White "滿天星" belly (dappled white chest/belly)
  pix.ellipse(20, 30, 5, 2, white);
  pix.ellipse(20, 32, 6, 2, white);
  pix.px(18, 28, lightSilver); pix.px(22, 28, lightSilver);

  // Legs — white socks with light silver shading
  pix.rect(13, 34, 2, 4, white);
  pix.rect(17, 34, 2, 4, white);
  pix.rect(22, 34, 2, 4, white);
  pix.rect(26, 34, 2, 4, white);
  // Pink paw pads
  pix.px(13, 37, P.nose); pix.px(17, 37, P.nose);
  pix.px(22, 37, P.nose); pix.px(26, 37, P.nose);

  // Tapered upright tail (cone-shape, curving up-and-back — no downward fold)
  // Base near hip, curving up
  pix.rect(29, 29, 3, 2, P.base);
  pix.rect(31, 27, 2, 2, P.base);
  pix.rect(32, 24, 2, 3, P.base);
  pix.rect(33, 20, 2, 4, P.base);
  // Upright tip
  pix.rect(34, 17, 2, 3, P.base);
  // Tail rings (horizontal bands on upright tail)
  pix.rect(33, 22, 2, 1, dark);
  pix.rect(33, 25, 2, 1, dark);
  pix.rect(31, 28, 2, 1, dark);
  // Dark tail tip
  pix.rect(34, 17, 2, 2, dark);

  // British Shorthair-style eyes (rounded 4x3 with clear iris + highlight)
  pix.rect(13, 15, 4, 3, dark);
  pix.rect(23, 15, 4, 3, dark);
  // Yellow-green iris
  pix.rect(14, 16, 2, 2, "#a8c038");
  pix.rect(24, 16, 2, 2, "#a8c038");
  // Pupil center
  pix.px(15, 16, dark); pix.px(25, 16, dark);
  // Top-left white highlight
  pix.px(14, 15, white); pix.px(24, 15, white);

  // Pink nose with dark outline
  pix.rect(19, 18, 2, 1, pinkRim);
  pix.px(19, 19, P.nose); pix.px(20, 19, P.nose);
  return P;
};

// 06 Bengal 孟加拉貓 - rich orange w/ bold rosettes, white belly, striped tail
R[6] = (pix) => {
  const P = mkPal("#e58838", "#4a2008", "#ffffff", { eye: "#b8c020", nose: "#a04030" });
  const rosette = "#5a2810";   // dark rosette outline
  const rosetteIn = "#c86828"; // warmer center to give rosette depth
  const stripe = "#3a1805";    // darkest for head stripes

  // British Shorthair-style small pointy ears with Bengal dark tips
  pix.rect(10, 6, 4, 3, P.base);
  pix.rect(26, 6, 4, 3, P.base);
  pix.px(11, 5, P.base); pix.px(27, 5, P.base);
  pix.px(12, 4, stripe); pix.px(28, 4, stripe); // dark tips
  pix.px(11, 7, "#e8a8a0"); pix.px(12, 6, "#e8a8a0");
  pix.px(28, 7, "#e8a8a0"); pix.px(27, 6, "#e8a8a0");

  catHead(pix, P, { noCheeks: true });

  // Head stripes — the classic Bengal "M" + eye outlines
  // Vertical M on forehead
  pix.rect(14, 9, 1, 3, stripe);
  pix.rect(18, 9, 1, 3, stripe);
  pix.rect(22, 9, 1, 3, stripe);
  pix.rect(26, 9, 1, 3, stripe);
  // Eye outline stripes (running down from forehead)
  pix.px(12, 13, stripe); pix.px(12, 14, stripe);
  pix.px(28, 13, stripe); pix.px(28, 14, stripe);

  body(pix, P);

  // White belly/chest (Bengal trait)
  pix.ellipse(20, 33, 6, 2, P.white);
  pix.ellipse(20, 34, 5, 1, P.white);

  // Bold irregular rosettes (not just dots — larger dark blobs with warm center)
  // Upper shoulder
  pix.rect(11, 28, 3, 2, rosette);
  pix.px(12, 28, rosetteIn);
  // Mid flank left
  pix.rect(14, 31, 2, 2, rosette);
  pix.px(14, 31, rosetteIn);
  // Mid back
  pix.rect(18, 29, 3, 1, rosette);
  pix.px(19, 29, rosetteIn);
  // Upper right flank
  pix.rect(23, 28, 3, 2, rosette);
  pix.px(24, 28, rosetteIn);
  // Lower right
  pix.rect(26, 31, 2, 2, rosette);
  pix.px(27, 31, rosetteIn);
  // Small extras
  pix.px(11, 32, rosette);
  pix.px(22, 32, rosette);

  // Leg stripes (bars on legs)
  pix.rect(13, 35, 2, 1, rosette);
  pix.rect(17, 35, 2, 1, rosette);
  pix.rect(22, 35, 2, 1, rosette);
  pix.rect(26, 35, 2, 1, rosette);

  tail(pix, "thin", P);
  // Banded tail — dark rings, darkest at tip
  pix.rect(30, 27, 2, 1, rosette);
  pix.rect(32, 24, 2, 1, rosette);
  pix.rect(33, 21, 2, 1, stripe);  // darkest band near tip
  pix.rect(33, 19, 2, 1, stripe);

  eyes(pix, P, { color: "#b8c020" });
  noseMouth(pix, P);
  return P;
};

// 07 Ragdoll 布偶貓 - white body, seal points around eyes, not muzzle
R[7] = (pix) => {
  const P = mkPal("#f8ecd8", "#b8987a", "#ffffff", { eye: "#4a8acc", nose: "#d09080" });
  const pt = "#7a5438";      // seal point color
  const ptLight = "#9a7858"; // lighter edge
  // British Shorthair-style small pointy ears (seal-point dark)
  pix.rect(10, 6, 4, 3, pt);
  pix.rect(26, 6, 4, 3, pt);
  pix.px(11, 5, pt); pix.px(27, 5, pt);
  pix.px(12, 4, pt); pix.px(28, 4, pt);
  pix.px(11, 7, "#d8a890"); pix.px(12, 6, "#d8a890");
  pix.px(28, 7, "#d8a890"); pix.px(27, 6, "#d8a890");
  catHead(pix, P, { noCheeks: true });

  // Solid seal-point mask around each eye — extends up to connect with ears
  // Left eye mask
  pix.ellipse(12, 13, 4, 3, pt);
  pix.rect(9, 8, 7, 6, pt);
  pix.px(8, 12, ptLight); pix.px(8, 13, ptLight);
  pix.px(16, 14, ptLight); pix.px(15, 15, ptLight);

  // Right eye mask
  pix.ellipse(28, 13, 4, 3, pt);
  pix.rect(24, 8, 7, 6, pt);
  pix.px(31, 12, ptLight); pix.px(31, 13, ptLight);
  pix.px(24, 14, ptLight); pix.px(25, 15, ptLight);

  // Narrow white blaze between the two masks
  pix.rect(19, 8, 2, 6, P.white);

  // Fluffy ruff
  pix.ellipse(20, 25, 11, 3, P.white);

  body(pix, P, { pawColor: ptLight });

  tail(pix, "fluffy", P);
  // Lighter seal point tail tip
  pix.ellipse(33, 27, 3, 3, ptLight);

  eyes(pix, P, { color: "#4a8acc" });
  // Pink nose
  pix.rect(19, 18, 2, 1, P.nose);
  return P;
};

// 08 Russian Blue 俄羅斯藍貓 - gray-blue, green eyes
R[8] = (pix) => {
  const P = mkPal("#8098ac", "#506880", "#b8c8d4", { eye: "#58b048", nose: "#2a2028" });
  // Taller sharper ears
  pix.rect(9, 8, 5, 1, P.base);
  pix.rect(10, 7, 4, 1, P.base);
  pix.rect(10, 6, 4, 1, P.base);
  pix.rect(11, 5, 3, 1, P.base);
  pix.rect(11, 4, 3, 1, P.base);
  pix.rect(12, 3, 2, 1, P.base);
  pix.px(13, 2, P.base);
  pix.rect(26, 8, 5, 1, P.base);
  pix.rect(26, 7, 4, 1, P.base);
  pix.rect(26, 6, 4, 1, P.base);
  pix.rect(26, 5, 3, 1, P.base);
  pix.rect(26, 4, 3, 1, P.base);
  pix.rect(26, 3, 2, 1, P.base);
  pix.px(26, 2, P.base);

  // Standard head shape but slightly narrower (rx 11 instead of 12)
  pix.ellipse(20, 16, 11, 10, P.base);

  body(pix, P, { noBelly: true });
  pix.ellipse(20, 31, 5, 2, P.highlight);
  tail(pix, "straight", P);
  eyes(pix, P, { color: "#58b048" });
  // Darker nose
  pix.rect(19, 18, 2, 2, P.nose);
  return P;
};

// 09 Sphynx 斯芬克斯 - pink, hairless, pointed ears, blue eyes
R[9] = (pix) => {
  const P = mkPal("#f5c8bc", "#c68878", "#ffe2d6", { eye: "#a8d4ec", nose: "#b85868" });

  // Pointed (not huge/wide) ears — triangular like Russian Blue
  pix.rect(9, 8, 5, 1, P.base);
  pix.rect(10, 7, 4, 1, P.base);
  pix.rect(10, 6, 4, 1, P.base);
  pix.rect(11, 5, 3, 1, P.base);
  pix.rect(11, 4, 3, 1, P.base);
  pix.rect(12, 3, 2, 1, P.base);
  pix.px(13, 2, P.base);
  // Inner ear (pinker)
  pix.px(12, 6, "#e89890"); pix.px(12, 5, "#e89890");
  pix.rect(26, 8, 5, 1, P.base);
  pix.rect(26, 7, 4, 1, P.base);
  pix.rect(26, 6, 4, 1, P.base);
  pix.rect(26, 5, 3, 1, P.base);
  pix.rect(26, 4, 3, 1, P.base);
  pix.rect(26, 3, 2, 1, P.base);
  pix.px(26, 2, P.base);
  pix.px(27, 6, "#e89890"); pix.px(27, 5, "#e89890");

  catHead(pix, P, { noCheeks: true });

  // Thin body
  pix.ellipse(20, 26, 9, 3, P.base);
  pix.ellipse(20, 30, 8, 3, P.base);
  pix.ellipse(20, 31, 5, 2, P.highlight);
  pix.rect(13, 33, 2, 5, P.base);
  pix.rect(17, 33, 2, 5, P.base);
  pix.rect(22, 33, 2, 5, P.base);
  pix.rect(25, 33, 2, 5, P.base);
  pix.rect(28, 28, 5, 1, P.base);
  pix.rect(32, 26, 1, 3, P.base);

  eyes(pix, P, { color: "#a8d4ec", w: 4, h: 3 });
  // Pink nose (no mouth)
  pix.rect(19, 18, 2, 2, P.nose);
  return P;
};

// 10 British Shorthair 英國短毛 - chunky blue-gray
// 10 British Shorthair 英國短毛 - golden back, white face/chest/legs, teal eyes
R[10] = (pix) => {
  const P = mkPal("#e8b860", "#b08840", "#ffffff", { eye: "#2a6860", nose: "#d89898" });
  const pink = "#e8a8a0";

  // Small pointy ears with pink inner
  pix.rect(10, 6, 4, 3, P.base);
  pix.rect(26, 6, 4, 3, P.base);
  pix.px(11, 5, P.base); pix.px(27, 5, P.base);
  pix.px(12, 4, P.base); pix.px(28, 4, P.base);
  pix.px(11, 7, pink); pix.px(12, 6, pink);
  pix.px(28, 7, pink); pix.px(27, 6, pink);

  // Chunky head — golden top
  pix.ellipse(20, 17, 13, 11, P.base);

  // White lower face (muzzle + chin + cheeks)
  pix.ellipse(20, 20, 9, 4, P.white);
  pix.ellipse(20, 22, 10, 3, P.white);

  // Golden forehead shading (subtle darker strokes between eyes/brow)
  pix.px(17, 13, P.shadow); pix.px(22, 13, P.shadow);
  pix.px(14, 12, P.shadow); pix.px(25, 12, P.shadow);

  // Chunky body — golden back
  pix.ellipse(20, 27, 11, 3, P.base);
  pix.ellipse(20, 31, 10, 4, P.base);
  // White chest/belly (prominent)
  pix.ellipse(20, 30, 7, 2, P.white);
  pix.ellipse(20, 32, 8, 3, P.white);

  // Legs — white
  pix.rect(12, 34, 3, 4, P.white);
  pix.rect(16, 34, 3, 4, P.white);
  pix.rect(21, 34, 3, 4, P.white);
  pix.rect(25, 34, 3, 4, P.white);
  // Paw pads (pink)
  pix.px(13, 37, pink); pix.px(17, 37, pink);
  pix.px(22, 37, pink); pix.px(26, 37, pink);

  tail(pix, "straight", P);

  // Medium teal/dark eyes
  pix.rect(13, 15, 4, 3, "#1a3a34");
  pix.rect(23, 15, 4, 3, "#1a3a34");
  // Teal iris + highlight
  pix.px(14, 16, "#4a8878"); pix.px(24, 16, "#4a8878");
  pix.px(14, 15, P.white); pix.px(24, 15, P.white);

  // Pink nose
  pix.rect(19, 19, 2, 1, P.nose);
  return P;
};

// ============ DOGS ============

// 11 Husky 哈士奇 - gray/white, blue eyes, mask
R[11] = (pix) => {
  const P = mkPal("#2a2a32", "#15151a", "#808088", { eye: "#5ab0f0", nose: "#0a0808" });
  const white = "#f8f4ea";

  earsPrick(pix, P);
  // Inner ear shading (pink)
  pix.px(10, 7, "#8a6058"); pix.px(11, 7, "#8a6058");
  pix.px(28, 7, "#8a6058"); pix.px(29, 7, "#8a6058");

  // Head — dark top/sides
  dogHead(pix, P);

  // White lower face mask — wide muzzle & cheeks
  pix.ellipse(20, 21, 10, 5, white);
  pix.ellipse(20, 23, 9, 3, white);

  // Blaze down center of forehead (between eyes, widening down)
  pix.rect(19, 8, 2, 7, white);
  pix.rect(18, 14, 4, 2, white);

  // White goggles/arcs around eyes (the husky "mask eyebrows")
  pix.rect(11, 16, 4, 1, white);   // left under-eye
  pix.rect(25, 16, 4, 1, white);   // right under-eye
  pix.px(11, 13, white); pix.px(14, 13, white); // left eyebrow dots
  pix.px(25, 13, white); pix.px(28, 13, white); // right eyebrow dots

  // Eye patches darker (around bright blue eyes)
  pix.rect(12, 14, 4, 2, P.shadow);
  pix.rect(24, 14, 4, 2, P.shadow);

  // Body — dark back, white chest/belly/legs
  body(pix, P, { noBelly: true });
  pix.ellipse(20, 30, 8, 2, white);
  pix.ellipse(20, 32, 9, 3, white);
  // White legs
  pix.rect(12, 34, 3, 4, white);
  pix.rect(16, 34, 3, 4, white);
  pix.rect(21, 34, 3, 4, white);
  pix.rect(25, 34, 3, 4, white);

  tail(pix, "curl-up", P);

  // Husky-specific bright blue almond eyes (NOT BSH style — keep original)
  pix.rect(13, 14, 3, 3, "#5ab0f0");
  pix.rect(24, 14, 3, 3, "#5ab0f0");
  pix.px(14, 15, P.mouth); pix.px(25, 15, P.mouth);
  pix.px(13, 14, P.eyeLight); pix.px(24, 14, P.eyeLight);

  // Black nose
  pix.rect(19, 19, 2, 2, P.nose);
  return P;
};

// 12 Golden Retriever 黃金獵犬 - pale cream puppy, uniform soft gold
R[12] = (pix) => {
  const P = mkPal("#f4d8a4", "#c8a468", "#fce8c4", { eye: "#1a0e08", nose: "#0a0808" });

  // Smaller drop ears — slightly warmer
  pix.ellipse(8, 16, 3, 5, "#e0bc80");
  pix.ellipse(32, 16, 3, 5, "#e0bc80");
  pix.ellipse(8, 18, 2, 3, P.shadow);
  pix.ellipse(32, 18, 2, 3, P.shadow);

  dogHead(pix, P);

  // Lighter muzzle (raised)
  pix.ellipse(20, 19, 5, 2, P.highlight);

  // Body — uniform pale cream
  pix.ellipse(20, 26, 10, 3, P.base);
  pix.ellipse(20, 29, 9, 2, P.base);
  // Very subtle lighter belly
  pix.ellipse(20, 30, 4, 1, P.highlight);

  // Longer legs
  pix.rect(12, 31, 3, 7, P.base);
  pix.rect(16, 31, 3, 7, P.base);
  pix.rect(21, 31, 3, 7, P.base);
  pix.rect(25, 31, 3, 7, P.base);

  tail(pix, "plume", P);

  eyes(pix, P, { color: "#1a0e08" });
  // Black nose (raised)
  pix.rect(19, 18, 2, 2, P.nose);
  return P;
};

// 13 Shiba Inu 柴犬 - orange with white mask, curl tail
R[13] = (pix) => {
  const P = mkPal("#d47038", "#9a4818", "#e89458", { eye: "#2a1408", nose: "#0a0808" });
  const cream = "#f8ead0";

  // Russian Blue-style pointed ears (tall triangular staircase)
  pix.rect(9, 8, 5, 1, P.base);
  pix.rect(10, 7, 4, 1, P.base);
  pix.rect(10, 6, 4, 1, P.base);
  pix.rect(11, 5, 3, 1, P.base);
  pix.rect(11, 4, 3, 1, P.base);
  pix.rect(12, 3, 2, 1, P.base);
  pix.px(13, 2, P.base);
  pix.rect(26, 8, 5, 1, P.base);
  pix.rect(26, 7, 4, 1, P.base);
  pix.rect(26, 6, 4, 1, P.base);
  pix.rect(26, 5, 3, 1, P.base);
  pix.rect(26, 4, 3, 1, P.base);
  pix.rect(26, 3, 2, 1, P.base);
  pix.px(26, 2, P.base);
  // Inner ear cream
  pix.px(12, 7, cream); pix.px(12, 6, cream);
  pix.px(27, 7, cream); pix.px(27, 6, cream);

  dogHead(pix, P);
  // Remove coffee cheek shadows — paint over with base
  pix.ellipse(9, 18, 2, 3, P.base);
  pix.ellipse(31, 18, 2, 3, P.base);

  // White "Urajiro" cheeks
  pix.ellipse(12, 19, 3, 2, cream);
  pix.ellipse(28, 19, 3, 2, cream);
  // White muzzle/chin
  pix.ellipse(20, 21, 6, 3, cream);
  pix.ellipse(20, 23, 5, 1, cream);

  // White eyebrow dots (Shiba trademark) — tighter spacing, above inner eye corner
  pix.px(15, 12, cream); pix.px(25, 12, cream);
  pix.px(15, 11, cream); pix.px(25, 11, cream);

  body(pix, P);
  // White chest/belly (prominent)
  pix.ellipse(20, 30, 7, 2, cream);
  pix.ellipse(20, 32, 6, 2, cream);
  // Inner legs white
  pix.rect(13, 36, 1, 2, cream);
  pix.rect(17, 36, 1, 2, cream);
  pix.rect(22, 36, 1, 2, cream);
  pix.rect(26, 36, 1, 2, cream);

  tail(pix, "curl-up", P);

  eyes(pix, P, { color: "#2a1408" });
  // Black nose
  pix.rect(19, 18, 2, 2, P.nose);
  return P;
};

// 14 Corgi 柯基 - short legs, big prick ears
// 14 Corgi 柯基 - warm ginger with white chest/blaze, big bat ears
R[14] = (pix) => {
  const P = mkPal("#e49458", "#a06028", "#f4c088", { eye: "#2a1608", nose: "#0a0808" });
  const cream = "#f8ead0";

  // Big bat ears (enlarged Corgi ears)
  pix.triangle(7, 2, 14, 4, 14, 13, P.base);
  pix.triangle(26, 4, 33, 2, 26, 13, P.base);
  pix.triangle(9, 5, 13, 7, 13, 12, cream);
  pix.triangle(27, 7, 31, 5, 27, 12, cream);

  dogHead(pix, P);
  // Remove coffee cheek shadows
  pix.ellipse(9, 18, 2, 3, P.base);
  pix.ellipse(31, 18, 2, 3, P.base);

  // White blaze down center of face (narrow)
  pix.rect(19, 10, 2, 6, cream);
  // White muzzle + chin
  pix.ellipse(20, 20, 6, 3, cream);
  pix.ellipse(20, 22, 5, 1, cream);

  body(pix, P, { short: true });
  // Large white chest/belly (corgi characteristic)
  pix.ellipse(20, 30, 7, 2, cream);
  pix.ellipse(20, 32, 8, 3, cream);
  // White paws
  pix.rect(12, 36, 3, 2, cream);
  pix.rect(16, 36, 3, 2, cream);
  pix.rect(21, 36, 3, 2, cream);
  pix.rect(25, 36, 3, 2, cream);

  tail(pix, "stub", P);

  eyes(pix, P, { color: "#2a1608" });
  // Black nose (raised)
  pix.rect(19, 18, 2, 2, P.nose);
  return P;
};

// 15 Poodle 貴賓犬 - red/rust curly toy poodle
R[15] = (pix) => {
  const P = mkPal("#9a5028", "#602a10", "#c47048", { eye: "#1a0a04", nose: "#0a0605" });

  earsDropLong(pix, P);

  dogHead(pix, P);
  // Remove coffee cheek shadows (cleaner look)
  pix.ellipse(9, 18, 2, 3, P.base);
  pix.ellipse(31, 18, 2, 3, P.base);

  // Poofy curly top — bumpy silhouette
  pix.ellipse(20, 8, 8, 4, P.highlight);
  // Dark bumps scattered on top (nubbly curl pattern)
  pix.px(14, 6, P.base); pix.px(26, 6, P.base);
  pix.px(16, 5, P.base); pix.px(24, 5, P.base);
  pix.px(20, 4, P.base);
  pix.px(13, 9, P.base); pix.px(27, 9, P.base);
  pix.px(17, 8, P.base); pix.px(23, 8, P.base);
  pix.px(20, 7, P.base);

  // Body — curly fluff all over
  body(pix, P, { noBelly: true });
  // Light highlight layer across body
  pix.ellipse(20, 30, 9, 4, P.highlight);
  // Dark base bumps scattered on back/sides only (no chest)
  pix.px(12, 28, P.base); pix.px(28, 28, P.base);
  pix.px(14, 33, P.base); pix.px(26, 33, P.base);
  pix.px(18, 27, P.base); pix.px(22, 27, P.base);

  // Curl ankle puffs
  pix.rect(11, 36, 5, 2, P.highlight);
  pix.rect(24, 36, 5, 2, P.highlight);

  // Fluffy ankle puffs
  pix.ellipse(13, 36, 2, 1, P.highlight);
  pix.ellipse(17, 36, 2, 1, P.highlight);
  pix.ellipse(22, 36, 2, 1, P.highlight);
  pix.ellipse(26, 36, 2, 1, P.highlight);

  tail(pix, "plume", P);

  // Re-draw right ear on top so it sits in front of tail
  pix.ellipse(33, 18, 3, 7, P.base);
  pix.ellipse(33, 22, 2, 4, P.shadow);

  eyes(pix, P, { color: "#1a0a04" });
  // Black nose
  pix.rect(19, 19, 2, 2, P.nose);
  return P;
};

// 16 German Shepherd 德國牧羊犬 - tan body + black mask + saddle (photo-accurate)
R[16] = (pix) => {
  const P = mkPal("#c07838", "#1a1208", "#e8a858", { eye: "#2a1508", nose: "#0a0808" });
  const tan = "#c07838";
  const tanLt = "#e8a858";
  const black = "#1a1208";
  const cream = "#f0c888";

  // Shiba-style pointed ears, scaled UP (w6 base, 7 rows tall)
  // Left ear: staircase from y=8 (base w=6) up to y=1 (tip)
  pix.rect(7, 8, 6, 1, black);    // dark outer rim at base
  pix.rect(8, 7, 5, 1, tan);
  pix.rect(8, 6, 5, 1, tan);
  pix.rect(9, 5, 4, 1, tan);
  pix.rect(9, 4, 4, 1, tan);
  pix.rect(10, 3, 3, 1, tan);
  pix.rect(10, 2, 3, 1, tan);
  pix.rect(11, 1, 2, 1, tan);
  // Black tip + outline on left ear
  pix.px(13, 8, black); pix.px(13, 7, black); pix.px(13, 6, black);
  pix.px(12, 5, black); pix.px(12, 4, black);
  pix.px(11, 3, black); pix.px(11, 2, black);
  pix.px(10, 1, black);
  pix.px(7, 8, black); pix.px(8, 7, black); pix.px(8, 6, black);
  // Cream inner ear
  pix.px(10, 5, cream); pix.px(11, 5, cream);
  pix.px(10, 6, cream); pix.px(11, 6, cream);
  pix.px(11, 4, cream);

  // Right ear (mirror)
  pix.rect(27, 8, 6, 1, black);
  pix.rect(27, 7, 5, 1, tan);
  pix.rect(27, 6, 5, 1, tan);
  pix.rect(27, 5, 4, 1, tan);
  pix.rect(27, 4, 4, 1, tan);
  pix.rect(27, 3, 3, 1, tan);
  pix.rect(27, 2, 3, 1, tan);
  pix.rect(27, 1, 2, 1, tan);
  pix.px(26, 8, black); pix.px(26, 7, black); pix.px(26, 6, black);
  pix.px(27, 5, black); pix.px(27, 4, black);
  pix.px(28, 3, black); pix.px(28, 2, black);
  pix.px(29, 1, black);
  pix.px(32, 8, black); pix.px(31, 7, black); pix.px(31, 6, black);
  pix.px(28, 5, cream); pix.px(29, 5, cream);
  pix.px(28, 6, cream); pix.px(29, 6, cream);
  pix.px(28, 4, cream);

  dogHead(pix, P);

  // Black mask covering muzzle + extending up over bridge of nose to forehead
  // LIGHTER dark-brown version (not pure black) so face reads softer + nose stands out
  const maskDark = "#4a2815";   // dark brown, lighter than pure black mask
  // Forehead dark cap (between ears, narrowing down)
  pix.ellipse(20, 10, 7, 2, maskDark);
  pix.rect(18, 12, 4, 2, maskDark);
  // Dark stripe down bridge of nose to muzzle
  pix.rect(18, 14, 4, 6, maskDark);
  pix.ellipse(20, 20, 5, 2, maskDark);
  pix.ellipse(20, 22, 4, 1, maskDark);

  // Tan cheek highlights framing the mask
  pix.ellipse(10, 15, 2, 2, tanLt);
  pix.ellipse(30, 15, 2, 2, tanLt);
  pix.px(11, 18, tanLt); pix.px(29, 18, tanLt);

  // Body — tan with big saddle (deep brown, matches face mask)
  body(pix, P, { noBelly: true });
  // Large saddle covering most of back + shoulders
  pix.ellipse(20, 27, 11, 2, maskDark);
  pix.ellipse(20, 29, 10, 3, maskDark);
  pix.ellipse(20, 31, 8, 2, maskDark);
  // Tan belly/chest + legs (peek out below saddle)
  pix.ellipse(20, 33, 8, 2, tanLt);
  pix.rect(12, 34, 3, 4, tanLt);
  pix.rect(16, 34, 3, 4, tanLt);
  pix.rect(21, 34, 3, 4, tanLt);
  pix.rect(25, 34, 3, 4, tanLt);

  // Tail — tan with dark brown top/tip
  tail(pix, "thin", P);
  pix.px(32, 25, maskDark); pix.px(33, 25, maskDark);
  pix.px(32, 26, maskDark);

  // Amber eyes (small, set on the dark-brown mask)
  pix.rect(13, 14, 3, 2, black);
  pix.rect(24, 14, 3, 2, black);
  pix.px(14, 15, "#d89038"); pix.px(25, 15, "#d89038");
  pix.px(13, 14, P.eyeLight); pix.px(24, 14, P.eyeLight);

  // Black nose tip (now pops against lighter mask)
  pix.rect(19, 20, 2, 2, black);
  return P;
};

// 17 Border Collie 邊境牧羊犬 - mostly white w/ black eye patches + ears (photo-accurate)
R[17] = (pix) => {
  const P = mkPal("#ffffff", "#1a1410", "#ffffff", { eye: "#2a1808", nose: "#0a0805" });
  const black = "#1a1410";
  const white = "#ffffff";
  const blackSoft = "#2e241e";

  // Folded black ears (semi-prick, pointing slightly out)
  pix.triangle(7, 4, 13, 5, 13, 12, black);
  pix.triangle(27, 5, 33, 4, 27, 12, black);
  // Folded tip (darker/deeper fold)
  pix.rect(7, 4, 3, 2, blackSoft);
  pix.rect(31, 4, 3, 2, blackSoft);
  // Fluffy ear edge tufts
  pix.px(6, 5, black); pix.px(34, 5, black);
  pix.px(8, 3, black); pix.px(32, 3, black);

  // Paint entire head black FIRST (cover dogHead's white base)
  pix.ellipse(20, 16, 13, 10, black);
  pix.ellipse(20, 21, 5, 3, black);

  // White BLAZE down center of forehead — signature border collie
  pix.rect(19, 8, 2, 8, white);
  pix.rect(18, 14, 4, 2, white);
  pix.px(18, 11, white); pix.px(21, 11, white);
  pix.px(18, 12, white); pix.px(21, 12, white);
  // Connect blaze to muzzle (no black line between them)
  pix.rect(18, 16, 4, 3, white);

  // White muzzle + chin (photo shows white mouth area)
  pix.ellipse(20, 19, 6, 3, white);
  pix.ellipse(20, 21, 7, 2, white);

  // Body — narrower white chest (no big outer halo)
  pix.ellipse(20, 27, 9, 2, white);
  pix.ellipse(20, 30, 9, 3, white);
  pix.ellipse(20, 33, 8, 2, white);
  // Legs — white
  pix.rect(12, 34, 3, 4, white);
  pix.rect(16, 34, 3, 4, white);
  pix.rect(21, 34, 3, 4, white);
  pix.rect(25, 34, 3, 4, white);

  // Black back saddle (covers top/sides of body — no white peeking above)
  pix.ellipse(20, 26, 11, 2, black);
  pix.rect(10, 25, 20, 2, black);
  pix.ellipse(20, 28, 10, 1, black);
  // Black rear hip patches
  pix.ellipse(11, 29, 2, 2, black);
  pix.ellipse(29, 29, 2, 2, black);
  pix.px(10, 30, black); pix.px(30, 30, black);

  // Fluffy white chest ruff — narrower
  pix.ellipse(20, 24, 7, 1, white);
  pix.ellipse(20, 25, 8, 1, white);

  // Black plume tail with white tip
  tail(pix, "plume", P);
  // Override tail to black
  pix.rect(28, 26, 2, 3, black);
  pix.ellipse(32, 25, 3, 3, black);
  pix.px(34, 24, white); pix.px(35, 25, white);  // white tail tip

  // Eyes on the black patches — small dark amber
  pix.rect(13, 14, 3, 2, "#0a0805");
  pix.rect(24, 14, 3, 2, "#0a0805");
  pix.px(14, 15, "#6a4020"); pix.px(25, 15, "#6a4020");
  pix.px(13, 14, "#d0a868"); pix.px(24, 14, "#d0a868");

  // Black nose
  pix.rect(19, 20, 2, 2, P.nose);
  return P;
};

// 18 Bulldog 鬥牛犬 (French Bulldog) - cream white body, pale gray muzzle, AmSho ears
R[18] = (pix) => {
  const P = mkPal("#f5ecd8", "#c8b890", "#ffffff", { eye: "#1a1008", nose: "#1a1008" });
  const cream = "#f5ecd8";
  const creamLt = "#faf3e2";
  const muzzleGray = "#c8c2b8";   // pale gray muzzle (tinted warm to match cream body)
  const muzzleShadow = "#9a9488";
  const darkNose = "#1a1008";
  const pinkInner = "#e8a8a0";

  // American Shorthair-style ears (pointy-but-slightly-rounded staircase)
  pix.rect(10, 8, 4, 1, cream);
  pix.rect(10, 7, 4, 1, cream);
  pix.rect(11, 6, 3, 1, cream);
  pix.rect(11, 5, 3, 1, cream);
  pix.rect(12, 4, 2, 1, cream);
  pix.rect(26, 8, 4, 1, cream);
  pix.rect(26, 7, 4, 1, cream);
  pix.rect(26, 6, 3, 1, cream);
  pix.rect(26, 5, 3, 1, cream);
  pix.rect(26, 4, 2, 1, cream);
  // Pink inner ear
  pix.px(12, 7, pinkInner); pix.px(27, 7, pinkInner);
  pix.px(12, 6, pinkInner); pix.px(27, 6, pinkInner);

  // Wide squat head — cream
  pix.ellipse(20, 17, 13, 10, cream);
  // Subtle shading at ear base
  pix.px(9, 13, P.shadow); pix.px(31, 13, P.shadow);

  // Pale gray muzzle area (lower face — around nose/mouth)
  pix.ellipse(20, 20, 6, 3, muzzleGray);
  pix.ellipse(20, 22, 7, 2, muzzleGray);
  // Muzzle shadow/crease (the wrinkle above lip)
  pix.px(17, 21, muzzleShadow); pix.px(23, 21, muzzleShadow);
  pix.px(18, 22, muzzleShadow); pix.px(22, 22, muzzleShadow);

  // Squat chunky body — cream
  pix.ellipse(20, 28, 12, 3, cream);
  pix.ellipse(20, 32, 12, 4, cream);
  // Slightly lighter chest highlight
  pix.ellipse(20, 30, 8, 2, creamLt);

  // Short chunky legs — cream
  pix.rect(11, 34, 4, 4, cream);
  pix.rect(16, 34, 4, 4, cream);
  pix.rect(21, 34, 4, 4, cream);
  pix.rect(26, 34, 4, 4, cream);
  // Pink paw pads
  pix.px(12, 37, pinkInner); pix.px(17, 37, pinkInner);
  pix.px(22, 37, pinkInner); pix.px(27, 37, pinkInner);

  // Stubby tail
  pix.rect(29, 27, 2, 2, cream);

  // Big round dark eyes (BSH-style — dark base + tiny glint)
  pix.rect(13, 15, 4, 3, darkNose);
  pix.rect(23, 15, 4, 3, darkNose);
  // Tiny amber glint + top-left white highlight
  pix.px(14, 16, "#4a3020"); pix.px(24, 16, "#4a3020");
  pix.px(14, 15, P.white); pix.px(24, 15, P.white);

  // Big round black nose
  pix.rect(19, 18, 2, 2, darkNose);
  pix.px(18, 19, darkNose); pix.px(21, 19, darkNose);
  // Nose slit (center line, subtle muzzle crease beneath nose)
  pix.px(20, 21, muzzleShadow);

  return P;
};

// 19 Dalmatian 大麥町 - white with black spots
// 19 Dalmatian 大麥町 - white w/ dense Bengal-style irregular black spots
R[19] = (pix) => {
  const P = mkPal("#f8f4e8", "#1a1410", "#ffffff", { eye: "#1a1008", nose: "#1a1410" });
  const white = "#f8f4e8";
  const black = "#1a1410";
  const pinkInner = "#e8a8a0";

  // Drooping ears — white with heavy black patches
  pix.ellipse(7, 18, 3, 6, white);
  pix.ellipse(33, 18, 3, 6, white);
  // Large black patches covering most of each ear
  pix.ellipse(7, 17, 3, 4, black);
  pix.ellipse(33, 17, 3, 4, black);
  pix.ellipse(7, 20, 2, 2, black);
  pix.ellipse(33, 20, 2, 2, black);
  // White ear-tip peek
  pix.px(6, 22, white); pix.px(34, 22, white);
  pix.px(8, 15, pinkInner); pix.px(32, 15, pinkInner);

  // White head
  pix.ellipse(20, 16, 13, 10, white);
  pix.ellipse(20, 21, 5, 3, white);

  // Dense black spot CLUSTERS on head — irregular shapes (like rosettes but solid)
  // Each "spot" is a 2-3 pixel asymmetric blob for an organic feel
  const headSpots = [
    [10, 11, "l"], [15, 9, "s"], [22, 9, "h"], [28, 11, "l"],
    [11, 14, "s"], [28, 14, "s"],
    [11, 20, "v"], [28, 20, "v"],
  ];
  headSpots.forEach(([x, y, s]) => {
    pix.px(x, y, black);
    if (s === "h") pix.px(x + 1, y, black);
    if (s === "v") pix.px(x, y + 1, black);
    if (s === "l") { pix.px(x + 1, y, black); pix.px(x, y + 1, black); }
    if (s === "b") {
      pix.px(x + 1, y, black); pix.px(x, y + 1, black); pix.px(x + 1, y + 1, black);
    }
  });

  // White body
  pix.ellipse(20, 27, 11, 3, white);
  pix.ellipse(20, 31, 11, 4, white);
  pix.rect(12, 34, 3, 4, white);
  pix.rect(16, 34, 3, 4, white);
  pix.rect(21, 34, 3, 4, white);
  pix.rect(25, 34, 3, 4, white);
  // Pink paw pads
  pix.px(13, 37, pinkInner); pix.px(17, 37, pinkInner);
  pix.px(22, 37, pinkInner); pix.px(26, 37, pinkInner);

  // Dense black body spots — clusters of varied shapes
  const bodySpots = [
    [12, 26, "s"], [20, 25, "l"], [27, 26, "s"],
    [15, 28, "h"], [24, 28, "h"],
    [11, 31, "s"], [19, 31, "h"], [28, 31, "s"],
    [15, 34, "s"], [23, 34, "s"],
    // Leg spots
    [13, 36, "s"], [26, 36, "s"],
  ];
  bodySpots.forEach(([x, y, s]) => {
    pix.px(x, y, black);
    if (s === "h") pix.px(x + 1, y, black);
    if (s === "v") pix.px(x, y + 1, black);
    if (s === "l") { pix.px(x + 1, y, black); pix.px(x, y + 1, black); }
    if (s === "b") {
      pix.px(x + 1, y, black); pix.px(x, y + 1, black); pix.px(x + 1, y + 1, black);
    }
  });

  // Tail — white with spots
  pix.rect(29, 28, 4, 1, white);
  pix.rect(32, 25, 1, 3, white);
  pix.px(30, 28, black); pix.px(32, 26, black);

  // Eyes — German Shepherd style, lowered to y=15
  pix.rect(13, 15, 3, 2, "#0a0805");
  pix.rect(24, 15, 3, 2, "#0a0805");
  pix.px(14, 16, "#6a4020"); pix.px(25, 16, "#6a4020");
  pix.px(13, 15, "#d0a868"); pix.px(24, 15, "#d0a868");

  // Black nose
  pix.rect(19, 19, 2, 2, black);
  return P;
};

// 20 Akita 秋田犬 - larger than shiba, sturdier
// 20 Chihuahua 吉娃娃 - white body w/ tan patches, big erect ears, apple head
R[20] = (pix) => {
  const P = mkPal("#f5ecd8", "#8a6028", "#ffffff", { eye: "#0a0805", nose: "#1a1008" });
  const white = "#f8f0dc";
  const tan = "#d8985a";        // caramel/tan patch color
  const tanLt = "#e8b878";
  const pinkInner = "#e8a8a0";
  const darkEye = "#0a0805";

  // LARGE erect pointy ears (chihuahua signature — huge relative to head)
  // Left ear — wide-based triangle (no dark outline)
  pix.rect(7, 8, 6, 1, tan);
  pix.rect(8, 7, 5, 1, tan);
  pix.rect(8, 6, 5, 1, tan);
  pix.rect(9, 5, 4, 1, tan);
  pix.rect(9, 4, 4, 1, tan);
  pix.rect(10, 3, 3, 1, tan);
  pix.rect(10, 2, 3, 1, tan);
  pix.rect(11, 1, 2, 1, tan);
  // Pink inner ear
  pix.px(10, 5, pinkInner); pix.px(11, 5, pinkInner);
  pix.px(10, 6, pinkInner); pix.px(11, 6, pinkInner);
  pix.px(11, 4, pinkInner); pix.px(11, 7, pinkInner);
  pix.px(10, 7, pinkInner);

  // Right ear (mirror, no dark outline)
  pix.rect(27, 8, 6, 1, tan);
  pix.rect(27, 7, 5, 1, tan);
  pix.rect(27, 6, 5, 1, tan);
  pix.rect(27, 5, 4, 1, tan);
  pix.rect(27, 4, 4, 1, tan);
  pix.rect(27, 3, 3, 1, tan);
  pix.rect(27, 2, 3, 1, tan);
  pix.rect(27, 1, 2, 1, tan);
  pix.px(28, 5, pinkInner); pix.px(29, 5, pinkInner);
  pix.px(28, 6, pinkInner); pix.px(29, 6, pinkInner);
  pix.px(28, 4, pinkInner); pix.px(28, 7, pinkInner);
  pix.px(29, 7, pinkInner);

  // Bridge pixels to fill the gap between ear base and head (prevents outline bleed)
  pix.rect(7, 9, 7, 1, tan);
  pix.rect(27, 9, 7, 1, tan);

  // Head — same size as Shiba (13×10 ellipse + 5×3 snout)
  pix.ellipse(20, 16, 13, 10, white);
  pix.ellipse(20, 21, 5, 3, white);

  // Tan patches on head — asymmetric (like photo):
  // Around left eye extending back to ear base
  pix.ellipse(11, 13, 4, 3, tan);
  pix.rect(8, 10, 8, 4, tan);
  pix.px(15, 11, tanLt); pix.px(15, 12, tanLt);
  pix.px(16, 14, tanLt);
  // Right side — tan patch over the ear base (asymmetric)
  pix.ellipse(28, 11, 3, 2, tan);
  pix.rect(25, 9, 7, 3, tan);
  pix.px(25, 12, tanLt); pix.px(24, 11, tanLt);

  // White blaze running down center of forehead
  pix.rect(19, 8, 2, 8, white);
  pix.rect(18, 12, 4, 2, white);

  // Slim deer-like body — mostly white (smoother left edge)
  pix.ellipse(20, 28, 9, 3, white);
  pix.ellipse(20, 32, 10, 4, white);
  // Fill any staircase gap on left side for a clean rounded contour
  pix.rect(11, 29, 3, 3, white);
  pix.rect(11, 31, 2, 2, white);

  // Tan patch on hip/rear
  pix.ellipse(28, 30, 3, 2, tan);
  pix.ellipse(28, 32, 3, 2, tan);
  pix.px(30, 31, tanLt);

  // Small thin legs
  pix.rect(13, 34, 2, 4, white);
  pix.rect(17, 34, 2, 4, white);
  pix.rect(22, 34, 2, 4, white);
  pix.rect(26, 34, 2, 4, white);
  pix.px(13, 37, pinkInner); pix.px(17, 37, pinkInner);
  pix.px(22, 37, pinkInner); pix.px(26, 37, pinkInner);

  // Thin short tail — root lowered (starts from hip at y=30)
  pix.rect(30, 30, 2, 2, white);
  pix.rect(32, 29, 2, 2, white);
  pix.rect(33, 27, 1, 2, white);

  // HUGE bulging bug-eyes (chihuahua signature — 5×5 dark)
  // Eye-socket shadow ring — creates protruding/bulging effect around each eye
  const eyeShadow = "#8a6028";
  // Left eye socket shadow
  pix.rect(10, 12, 1, 5, eyeShadow); // outer-left edge
  pix.rect(11, 11, 5, 1, eyeShadow); // top edge
  pix.rect(11, 17, 5, 1, eyeShadow); // bottom edge
  // Right eye socket shadow
  pix.rect(29, 12, 1, 5, eyeShadow); // outer-right edge
  pix.rect(24, 11, 5, 1, eyeShadow); // top edge
  pix.rect(24, 17, 5, 1, eyeShadow); // bottom edge

  pix.rect(11, 12, 5, 5, darkEye);
  pix.rect(24, 12, 5, 5, darkEye);
  // Asymmetric gaze — left eye looks LEFT, right eye looks RIGHT (divergent)
  pix.rect(11, 13, 3, 3, "#3a2010");
  pix.rect(26, 13, 3, 3, "#3a2010");
  // Prominent black pupils
  pix.rect(11, 14, 2, 2, "#000000");
  pix.rect(27, 14, 2, 2, "#000000");
  // Catchlights
  pix.px(11, 13, white);
  pix.px(12, 14, white);
  pix.px(28, 13, white);
  pix.px(27, 14, white);

  // Photo-style compact heart/triangular nose
  pix.rect(19, 18, 3, 1, P.nose);
  pix.rect(19, 19, 2, 1, P.nose);
  pix.px(20, 20, P.nose);
  pix.px(19, 18, "#2a1810");

  // Pink tongue sticking out to the RIGHT (drawn first, mouth overlays on top)
  pix.rect(20, 21, 4, 2, pinkInner);
  pix.px(23, 21, "#c88478"); // deeper pink at right tip
  pix.px(23, 22, "#c88478");
  pix.px(20, 21, "#f0b8b0"); // highlight at base

  // ^-shaped smile mouth — drawn AFTER tongue, so it sits on top and connects
  pix.px(18, 21, P.nose);
  pix.px(19, 20, P.nose);
  pix.px(20, 20, P.nose);
  pix.px(21, 21, P.nose);

  return P;
};

export const breedRender = R;
export const breedMeta = [
  { id:1,  kind:"cat", nameZh:"曼赤肯",       nameEn:"Munchkin" },
  { id:2,  kind:"cat", nameZh:"波斯貓",       nameEn:"Persian" },
  { id:3,  kind:"cat", nameZh:"暹羅貓",       nameEn:"Siamese" },
  { id:4,  kind:"cat", nameZh:"蘇格蘭摺耳",   nameEn:"Scottish Fold" },
  { id:5,  kind:"cat", nameZh:"美國短毛貓",   nameEn:"American Shorthair" },
  { id:6,  kind:"cat", nameZh:"孟加拉貓",     nameEn:"Bengal" },
  { id:7,  kind:"cat", nameZh:"布偶貓",       nameEn:"Ragdoll" },
  { id:8,  kind:"cat", nameZh:"俄羅斯藍貓",   nameEn:"Russian Blue" },
  { id:9,  kind:"cat", nameZh:"斯芬克斯",     nameEn:"Sphynx" },
  { id:10, kind:"cat", nameZh:"英國短毛",     nameEn:"British Shorthair" },
  { id:11, kind:"dog", nameZh:"哈士奇",       nameEn:"Husky" },
  { id:12, kind:"dog", nameZh:"黃金獵犬",     nameEn:"Golden Retriever" },
  { id:13, kind:"dog", nameZh:"柴犬",         nameEn:"Shiba Inu" },
  { id:14, kind:"dog", nameZh:"柯基",         nameEn:"Corgi" },
  { id:15, kind:"dog", nameZh:"貴賓犬",       nameEn:"Poodle" },
  { id:16, kind:"dog", nameZh:"德國牧羊犬",   nameEn:"German Shepherd" },
  { id:17, kind:"dog", nameZh:"邊境牧羊犬",   nameEn:"Border Collie" },
  { id:18, kind:"dog", nameZh:"鬥牛犬",       nameEn:"Bulldog" },
  { id:19, kind:"dog", nameZh:"大麥町",       nameEn:"Dalmatian" },
  { id:20, kind:"dog", nameZh:"吉娃娃",       nameEn:"Chihuahua" }
];
