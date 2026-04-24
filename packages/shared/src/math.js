export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function euclidean(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
