// 領地爭奪 bot：朝「最近未被自己隊色佔領的格子」走；避開其他玩家位置。
//
// 防 bot 互卡的兩道防線：
//   1. 目標選擇：其他玩家所在的 cell（及其腳下格）加大罰分，讓 bot 不會去撞牆
//   2. 移動 steering：若直線前進方向 ~1 格內有他人阻擋，把向量沿切線偏移 45°
//
// 外層 try/catch + id 擾動避免平手。

import {
  ARENA_COLS, ARENA_ROWS, PLAYER_RADIUS,
} from '@office-colosseum/shared/src/games/territory/constants.js';

const OCCUPIED_PENALTY = 5.0;       // 他人腳下 cell 的罰分（比平常 dist 大很多）
const PATH_CHECK_DIST = 1.2;         // 前方多少格內算擋路
const PATH_AVOID_ANGLE = Math.PI / 4; // 擋路時偏移角度（45°）

function idleInput() {
  return { seq: 0, moveX: 0, moveY: 0, aimAngle: 0 };
}

function otherOccupiedCells(state, selfId) {
  const occ = new Set();
  for (const p of Object.values(state.players ?? {})) {
    if (!p.alive || p.id === selfId) continue;
    const c = Math.floor(p.x), r = Math.floor(p.y);
    occ.add(`${c},${r}`);
  }
  return occ;
}

function findTarget(state, me, botId, occupied) {
  const myTeam = me.teamId;
  const cells = state.cells ?? {};
  const mx = me.x, my = me.y;
  const jitter = (botId.charCodeAt(botId.length - 1) % 7) * 0.07;
  let best = null, bestScore = Infinity;
  for (let c = 0; c < ARENA_COLS; c++) {
    for (let r = 0; r < ARENA_ROWS; r++) {
      const k = `${c},${r}`;
      if (cells[k] === myTeam) continue;
      const dx = (c + 0.5) - mx, dy = (r + 0.5) - my;
      const d = Math.hypot(dx, dy);
      let score = d;
      // 罰：腳下有人的 cell（其他玩家）→ 大大降低優先度，bot 會繞去別處
      if (occupied.has(k)) score += OCCUPIED_PENALTY;
      // 罰：自己腳下被敵染色 → 小幅懲罰避免原地打轉
      if (Math.floor(mx) === c && Math.floor(my) === r) score += 0.5;
      // 擾動：同一隊 bot 各自選不同目標
      score += (((c * 31 + r * 17) % 13) * jitter) / 13;
      if (score < bestScore) { bestScore = score; best = [c, r]; }
    }
  }
  return best;
}

/**
 * 回傳 true 表示前方直線路徑 (me → me + dir * PATH_CHECK_DIST) 上有其他玩家阻擋。
 */
function isPathBlocked(state, me, dirX, dirY) {
  const avoidRadius = PLAYER_RADIUS * 2;  // 比 soft collision 的 2*radius 略同
  const avoidRadiusSq = avoidRadius * avoidRadius;
  // 取路徑上幾個 sample 點
  for (let t = 0.3; t <= PATH_CHECK_DIST; t += 0.3) {
    const sx = me.x + dirX * t;
    const sy = me.y + dirY * t;
    for (const p of Object.values(state.players ?? {})) {
      if (!p.alive || p.id === me.id) continue;
      const dx = p.x - sx, dy = p.y - sy;
      if (dx * dx + dy * dy < avoidRadiusSq) return true;
    }
  }
  return false;
}

export function decideBotInput(state, botId, _now) {
  try {
    const me = state.players?.[botId];
    if (!me || !me.alive || me.paused) return idleInput();
    const occupied = otherOccupiedCells(state, botId);
    const tgt = findTarget(state, me, botId, occupied);
    if (!tgt) return idleInput();
    const [tc, tr] = tgt;
    let dx = (tc + 0.5) - me.x;
    let dy = (tr + 0.5) - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return idleInput();
    let nx = dx / d, ny = dy / d;

    // steering：若直線路徑被擋，沿切線偏移 45°（id 決定偏哪邊避免全部往同一邊）
    if (isPathBlocked(state, me, nx, ny)) {
      const sign = botId.charCodeAt(botId.length - 1) % 2 === 0 ? 1 : -1;
      const ang = Math.atan2(ny, nx) + PATH_AVOID_ANGLE * sign;
      nx = Math.cos(ang);
      ny = Math.sin(ang);
    }

    return {
      seq: 0,
      moveX: nx,
      moveY: ny,
      aimAngle: Math.atan2(ny, nx),
    };
  } catch (err) {
    return idleInput();
  }
}
