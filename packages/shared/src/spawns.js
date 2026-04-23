import { ARENA_WIDTH, ARENA_HEIGHT } from './constants.js';

// 沿內縮 0.4× 邊界的橢圓均分 n 個位置，第 0 位在正上方（angle = -π/2）。
// 半軸 = 0.4 × 寬/高，讓 spawn 離矩形邊緣留 1 倍餘裕、對應到前代「r=0.7×ARENA_RADIUS」的相對位置感。
export function getSpawnPositions(n) {
  const rx = ARENA_WIDTH * 0.4;
  const ry = ARENA_HEIGHT * 0.4;
  const count = Math.max(n, 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    out.push({ x: Math.cos(angle) * rx, y: Math.sin(angle) * ry });
  }
  return out;
}
