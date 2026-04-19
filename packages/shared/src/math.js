export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function calculateDamage(attacker, defender, isSkill, rng = Math.random) {
  const base = isSkill ? attacker.stats.spc : attacker.stats.atk;
  const def = defender.stats.def;
  const variance = 0.85 + rng() * 0.3;
  const raw = Math.max(1, Math.floor(base * (1 - def / (def + 80)) * variance));
  return isSkill ? Math.floor(raw * 1.5) : raw;
}
