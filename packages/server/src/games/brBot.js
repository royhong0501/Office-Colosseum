// 經典大逃殺 bot AI。純函式：吃 state + botId + now，回傳同真人 INPUT shape。
// 策略（從簡單到近敵）：
//   1. 死 / paused → idle
//   2. 腳下踩到毒圈 → 往地圖中心逃，不開火
//   3. 找最近的活敵人（id 字串排序 tie-break 保持 deterministic）
//   4. 視線被 cover 擋住或距離 > BULLET_MAX_DIST → 向敵人前進，不射
//   5. 否則 aim + attack；距離控制（太近側移、中距離繞切線、過遠靠近）
//   6. HP < 40 → 舉盾 60% 機率；dash CD 到 + 2% 機率 dash 退敵方
// 容錯：整個函式包在 try/catch；任何異常 fallback idle。

import {
  ARENA_COLS, ARENA_ROWS,
  BULLET_MAX_DIST,
  DASH_CELLS,
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

export function decideBotInput(state, botId, now) {
  try {
    const me = state.players?.[botId];
    if (!me || !me.alive || me.paused) return idleInput();

    const input = idleInput();
    input.aimAngle = me.aimAngle ?? 0;

    // 毒圈腳下 → 朝場地中心逃
    const [mc, mr] = [Math.floor(me.x), Math.floor(me.y)];
    const onPoison = state.poison?.infected?.has?.(`${mc},${mr}`) ?? false;
    if (onPoison) {
      const cx = ARENA_COLS / 2, cy = ARENA_ROWS / 2;
      const dx = cx - me.x, dy = cy - me.y;
      const L = Math.hypot(dx, dy) || 1;
      input.moveX = dx / L;
      input.moveY = dy / L;
      input.shield = false;
      return input;
    }

    const nearest = pickNearestEnemy(state, me);
    if (!nearest) return input;
    const { target: tgt, d } = nearest;

    // 瞄準敵人
    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    input.aimAngle = Math.atan2(dy, dx);

    const coversSet = state.map?.coversSet ?? new Set();
    const canSee = lineOfSight(coversSet, me.x, me.y, tgt.x, tgt.y);

    // 距離 > max range 或視線被擋 → 靠近，不射
    const dSafe = d || 1;
    if (!canSee || d > BULLET_MAX_DIST - 1) {
      input.moveX = dx / dSafe;
      input.moveY = dy / dSafe;
      input.attack = false;
    } else {
      // 中距離維持 5~7 格
      const desired = 5;
      if (d > desired + 1.5) {
        input.moveX = dx / dSafe; input.moveY = dy / dSafe;
      } else if (d < desired - 1) {
        input.moveX = -dx / dSafe; input.moveY = -dy / dSafe;
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
        // dash 朝相反方向撤退
        input.aimAngle = Math.atan2(-dy, -dx);
      }
    }

    return input;
  } catch (err) {
    return idleInput();
  }
}
