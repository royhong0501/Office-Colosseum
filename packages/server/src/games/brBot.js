// 經典大逃殺 bot AI。純函式：吃 state + botId + now，回傳同真人 INPUT shape。
// 策略（從簡單到近敵）：
//   1. 死 / paused → idle
//   2. 腳下踩到毒圈 → 往地圖中心逃（cover steering），不開火
//   3. 找最近的活敵人（id 字串排序 tie-break 保持 deterministic）
//   4. 視線被 cover 擋住或距離 > BULLET_MAX_DIST → 向敵人前進（cover steering），不射
//   5. 否則 aim + attack；距離控制（太近後退、中距離繞切線、過遠靠近）
//   6. HP < 40 → 舉盾 60% 機率；dash CD 到 + 2% 機率 dash 退敵方
//   7. 被 cover 四面圍死 + dash CD 到 → 觸發 dash 跨格脫困
// 容錯：整個函式包在 try/catch；任何異常 fallback idle。

import {
  ARENA_COLS, ARENA_ROWS,
  BULLET_MAX_DIST,
  PLAYER_RADIUS,
} from '@office-colosseum/shared/src/games/br/constants.js';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function lineOfSight(coversSet, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.ceil(d * 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = Math.floor(ax + dx * t);
    const r = Math.floor(ay + dy * t);
    if (coversSet.has(`${c},${r}`)) return false;
  }
  return true;
}

// 同 simulation 的 canStand：取四角 cell 測是否都可站（非 cover 且在場內）
function canStandCell(coversSet, x, y) {
  const left   = Math.floor(x - PLAYER_RADIUS);
  const right  = Math.floor(x + PLAYER_RADIUS);
  const top    = Math.floor(y - PLAYER_RADIUS);
  const bottom = Math.floor(y + PLAYER_RADIUS);
  for (let c = left; c <= right; c++) {
    for (let r = top; r <= bottom; r++) {
      if (c < 0 || c >= ARENA_COLS || r < 0 || r >= ARENA_ROWS) return false;
      if (coversSet.has(`${c},${r}`)) return false;
    }
  }
  return true;
}

// 從 (x,y) 沿 (dx,dy) 推 distCells 格，每 0.3 格取樣驗 canStandCell
function pathClearOfCover(coversSet, x, y, dx, dy, distCells = 2.0) {
  for (let t = 0.3; t <= distCells + 1e-6; t += 0.3) {
    if (!canStandCell(coversSet, x + dx * t, y + dy * t)) return false;
  }
  return true;
}

// 從 baseline 向量出發測候選偏移角（0/±30/±60/±90°），選第一個能通的。
// id 奇偶決定優先先試左或右，避免多 bot 全部往同一邊擠。
// 全部擋死 → 回傳 null（呼叫端可選 dash 或 idle）。
function findSteerDirection(coversSet, me, baseX, baseY, botId) {
  const L = Math.hypot(baseX, baseY);
  if (L < 1e-6) return null;
  const baseAng = Math.atan2(baseY, baseX);
  const sign = botId.charCodeAt(botId.length - 1) % 2 === 0 ? 1 : -1;
  const offsets = [
    0,
    (Math.PI / 6)  * sign,
    (Math.PI / 6)  * -sign,
    (Math.PI / 3)  * sign,
    (Math.PI / 3)  * -sign,
    (Math.PI / 2)  * sign,
    (Math.PI / 2)  * -sign,
  ];
  for (const off of offsets) {
    const a = baseAng + off;
    const dx = Math.cos(a), dy = Math.sin(a);
    if (pathClearOfCover(coversSet, me.x, me.y, dx, dy, 2.0)) {
      return { moveX: dx, moveY: dy };
    }
  }
  return null;
}

function pickNearestEnemy(state, me) {
  let best = null, bestD = Infinity;
  const entries = Object.values(state.players)
    .filter(p => p.id !== me.id && p.alive)
    .sort((a, b) => a.id < b.id ? -1 : 1);
  for (const q of entries) {
    const d = dist(me.x, me.y, q.x, q.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best ? { target: best, d: bestD } : null;
}

function idleInput(seq = 0) {
  return {
    seq,
    moveX: 0, moveY: 0,
    aimAngle: 0,
    attack: false, shield: false, dash: false,
  };
}

// 把 baseline 向量（dx, dy）套 cover steering。回傳 {moveX, moveY, blocked}。
// blocked=true 表示連 90° 偏移也無法通，呼叫端可考慮 dash。
function steeredMove(coversSet, me, dx, dy, botId) {
  const L = Math.hypot(dx, dy) || 1;
  const baseX = dx / L, baseY = dy / L;
  const dir = findSteerDirection(coversSet, me, baseX, baseY, botId);
  if (dir) return { moveX: dir.moveX, moveY: dir.moveY, blocked: false };
  return { moveX: baseX, moveY: baseY, blocked: true };
}

export function decideBotInput(state, botId, now) {
  try {
    const me = state.players?.[botId];
    if (!me || !me.alive || me.paused) return idleInput();

    const input = idleInput();
    input.aimAngle = me.aimAngle ?? 0;
    const coversSet = state.map?.coversSet ?? new Set();

    // 毒圈腳下 → 朝場地中心逃（套 steering 免撞 cover）
    const [mc, mr] = [Math.floor(me.x), Math.floor(me.y)];
    const onPoison = state.poison?.infected?.has?.(`${mc},${mr}`) ?? false;
    if (onPoison) {
      const cx = ARENA_COLS / 2, cy = ARENA_ROWS / 2;
      const dx = cx - me.x, dy = cy - me.y;
      const steer = steeredMove(coversSet, me, dx, dy, botId);
      input.moveX = steer.moveX;
      input.moveY = steer.moveY;
      input.shield = false;
      if (steer.blocked && now >= (me.dashCdUntil ?? 0)) {
        input.dash = true;
        input.aimAngle = Math.atan2(dy, dx);
      }
      return input;
    }

    const nearest = pickNearestEnemy(state, me);
    if (!nearest) return input;
    const { target: tgt, d } = nearest;

    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    const dSafe = d || 1;
    input.aimAngle = Math.atan2(dy, dx);

    const canSee = lineOfSight(coversSet, me.x, me.y, tgt.x, tgt.y);

    // 距離 > max range 或視線被擋 → 靠近（cover steering），不射
    if (!canSee || d > BULLET_MAX_DIST - 1) {
      const steer = steeredMove(coversSet, me, dx, dy, botId);
      input.moveX = steer.moveX;
      input.moveY = steer.moveY;
      input.attack = false;
      if (steer.blocked && now >= (me.dashCdUntil ?? 0)) {
        input.dash = true;   // 四面被封 + CD 到 → dash 突破
      }
    } else {
      // 中距離維持 5~7 格
      const desired = 5;
      if (d > desired + 1.5) {
        const steer = steeredMove(coversSet, me, dx, dy, botId);
        input.moveX = steer.moveX; input.moveY = steer.moveY;
      } else if (d < desired - 1) {
        const steer = steeredMove(coversSet, me, -dx, -dy, botId);
        input.moveX = steer.moveX; input.moveY = steer.moveY;
      } else {
        // 切線繞圈（依 id 決定方向避免全部撞在一起）
        const sign = botId.charCodeAt(botId.length - 1) % 2 === 0 ? 1 : -1;
        input.moveX = (-dy / dSafe) * sign;
        input.moveY = (dx / dSafe) * sign;
      }
      input.attack = true;
    }

    // 低血量行為
    if (me.hp < 40) {
      input.shield = Math.random() < 0.6;
      if (now >= (me.dashCdUntil ?? 0) && Math.random() < 0.02) {
        input.dash = true;
        input.aimAngle = Math.atan2(-dy, -dx);
      }
    }

    return input;
  } catch (err) {
    return idleInput();
  }
}
