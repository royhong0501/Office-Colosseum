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

  // TODO(next task): 未對齊時的移動邏輯
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
