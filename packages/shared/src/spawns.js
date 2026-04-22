import { ARENA_RADIUS } from './constants.js';

// 圓周上均分 n 個位置，第 0 位在正上方（angle = -π/2）。
// 半徑取 ARENA_RADIUS * 0.7，讓 spawn 離邊緣有餘裕。
export function getSpawnPositions(n) {
  const r = ARENA_RADIUS * 0.7;
  const count = Math.max(n, 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    out.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return out;
}
