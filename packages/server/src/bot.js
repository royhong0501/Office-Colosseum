import { PROJECTILE_MAX_DIST } from '@office-colosseum/shared';

/**
 * 決定一個 bot 這個 tick 要做什麼。純函式，不 mutate state。
 * @param {object} state - GameState from shared/simulation.js
 * @param {string} botId - 這個 bot 的 player id
 * @param {number} now - absolute ms timestamp
 * @returns {{ seq: number, moveX: number, moveY: number, aimAngle: number, attack: boolean, skill: boolean }}
 */
export function decideBotInput(state, botId, now) {
  const me = state.players[botId];
  if (!me || !me.alive) return idle();

  const target = findNearestEnemy(state, botId);
  if (!target) return idle();

  const dx = target.x - me.x;
  const dy = target.y - me.y;
  const dist = Math.hypot(dx, dy);
  // 同點：保持當前 facing 盲射
  if (dist === 0) {
    return { seq: 0, moveX: 0, moveY: 0, aimAngle: me.facing ?? 0, attack: true, skill: true };
  }

  const aimAngle = Math.atan2(dy, dx);

  // 射程內：站住不動、瞄準、開火 + 技能
  if (dist <= PROJECTILE_MAX_DIST) {
    return { seq: 0, moveX: 0, moveY: 0, aimAngle, attack: true, skill: true };
  }

  // 射程外：朝敵人直線走，不開火（不管投射物也不閃避，保持 v1 簡單）
  return {
    seq: 0,
    moveX: dx / dist,
    moveY: dy / dist,
    aimAngle,
    attack: false,
    skill: false,
  };
}

function idle() {
  return { seq: 0, moveX: 0, moveY: 0, aimAngle: 0, attack: false, skill: false };
}

function findNearestEnemy(state, selfId) {
  const me = state.players[selfId];
  if (!me) return null;
  let best = null, bestD2 = Infinity;
  const candidates = Object.values(state.players)
    .filter(p => p.id !== selfId && p.alive)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const p of candidates) {
    const d2 = (p.x - me.x) ** 2 + (p.y - me.y) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = p; }
  }
  return best;
}
