// characterId（字串）↔ breed 渲染 id（1..20）對照 + 記憶化 sprite 產生。
// breedMeta 的順序與 shared ALL_CHARACTERS 完全一致（曼赤肯=1 … 吉娃娃=20），
// 所以 breed id = ALL_CHARACTERS 索引 + 1。
import { ALL_CHARACTERS } from '@office-colosseum/shared';
import { Pix } from './pix.js';
import { breedRender } from './breed-render.js';

/** characterId → breed 渲染 id（1..20）；找不到回退柴犬(13)。 */
export function breedIdFor(characterId) {
  const idx = ALL_CHARACTERS.findIndex(c => c.id === characterId);
  return idx >= 0 ? idx + 1 : 13;
}

const cache = new Map();   // breedId → { url, P }

/**
 * 產生 40×40 sprite，回傳 { url(dataURL), P(palette) }。
 * P.base / P.outline 供爪子 --fur 使用。
 */
export function spriteFor(characterId) {
  const breedId = breedIdFor(characterId);
  const hit = cache.get(breedId);
  if (hit) return hit;
  const render = breedRender[breedId] ?? breedRender[13];
  const pix = new Pix(40);
  pix.clear();
  const P = render(pix);
  pix.outline(P.outline);
  const out = { url: pix.canvas.toDataURL(), P };
  cache.set(breedId, out);
  return out;
}
