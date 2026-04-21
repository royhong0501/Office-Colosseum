import { PROJECTILE_MAX_DIST } from '@office-colosseum/shared';

/**
 * 決定一個 bot 這個 tick 要做什麼。純函式，不 mutate state。
 * @param {object} state - GameState from shared/simulation.js
 * @param {string} botId - 這個 bot 的 player id
 * @param {number} now - absolute ms timestamp
 * @returns {{ seq: number, dir: string | null, attack: boolean, skill: boolean }}
 */
export function decideBotInput(state, botId, now) {
  const me = state.players[botId];
  if (!me || !me.alive) return idle();

  const target = findNearestEnemy(state, botId);
  if (!target) return idle();

  const dx = target.x - me.x;
  const dy = target.y - me.y;

  // Case 2: 對齊（dx===0 or dy===0，且不是同格）
  if ((dx === 0) !== (dy === 0)) {
    const dir = dx === 0
      ? (dy > 0 ? 'down' : 'up')
      : (dx > 0 ? 'right' : 'left');
    const dist = Math.abs(dx) + Math.abs(dy);  // 其中一個是 0
    if (dist <= PROJECTILE_MAX_DIST) {
      return { seq: 0, dir, attack: true, skill: true };
    } else {
      return { seq: 0, dir, attack: false, skill: false };
    }
  }

  // Case 3: 未對齊 — 縮較小軸（tie 選橫軸）
  if (dx !== 0 && dy !== 0) {
    const dir = Math.abs(dx) <= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    return { seq: 0, dir, attack: false, skill: false };
  }

  // TODO(next task): Case 1 同格
  return idle();
}

function idle() {
  return { seq: 0, dir: null, attack: false, skill: false };
}

function findNearestEnemy(state, selfId) {
  const me = state.players[selfId];
  if (!me) return null;
  let best = null, bestDist = Infinity;
  // tie-break 用 id 字串排序（確定性）
  const candidates = Object.values(state.players)
    .filter(p => p.id !== selfId && p.alive)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const p of candidates) {
    const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}
