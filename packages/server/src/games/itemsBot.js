// 道具戰 bot AI。策略：
//   1. 低 HP（<35）且 undo 可用 → 回血
//   2. 凍結中 → 嘗試 undo
//   3. 視線 / 距離內敵人 → aim + attack
//   4. 近距離有 MP → 放 trap（freeze 優先、其次 merge/readonly/validate）
//   5. 否則接近敵人
// 容錯：整個外層 try/catch；任何異常 fallback idle。

import {
  ARENA_COLS, ARENA_ROWS, BULLET_MAX_DIST, SKILLS, SKILL_KEYS,
} from '@office-colosseum/shared/src/games/items/constants.js';

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

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

function idleInput() {
  return {
    seq: 0, moveX: 0, moveY: 0, aimAngle: 0,
    attack: false, skill: null,
  };
}

function canCast(state, me, kind, now) {
  const cfg = SKILLS[kind];
  if (!cfg) return false;
  if (me.mp < cfg.mpCost) return false;
  if (now < (me.skillCdUntil?.[kind] ?? 0)) return false;
  return true;
}

export function decideBotInput(state, botId, now) {
  try {
    const me = state.players?.[botId];
    if (!me || !me.alive || me.paused) return idleInput();

    const input = idleInput();
    input.aimAngle = me.aimAngle ?? 0;

    const frozen = now < me.frozenUntil;
    const silenced = now < me.silencedUntil;

    // 優先：低血量 → undo
    if (me.hp < 35 && canCast(state, me, 'undo', now) && !silenced) {
      input.skill = 'undo';
      return input;
    }
    // 凍結中 → 嘗試 undo 解凍
    if (frozen && canCast(state, me, 'undo', now) && !silenced) {
      input.skill = 'undo';
      return input;
    }
    if (frozen) return input;  // 凍結 + 無 undo → 只能等

    const nearest = pickNearestEnemy(state, me);
    if (!nearest) return input;
    const { target: tgt, d } = nearest;

    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    input.aimAngle = Math.atan2(dy, dx);
    const dSafe = d || 1;

    // 在射程內 → 射擊
    if (d <= BULLET_MAX_DIST - 1) {
      input.attack = true;
      // 維持中距離 4~6
      if (d > 5) { input.moveX = dx / dSafe; input.moveY = dy / dSafe; }
      else if (d < 3) { input.moveX = -dx / dSafe; input.moveY = -dy / dSafe; }
      else {
        const sign = botId.charCodeAt(botId.length - 1) % 2 === 0 ? 1 : -1;
        input.moveX = (-dy / dSafe) * sign;
        input.moveY = (dx / dSafe) * sign;
      }
    } else {
      // 過遠 → 靠近
      input.moveX = dx / dSafe;
      input.moveY = dy / dSafe;
    }

    // 嘗試放 trap（不 silenced）：敵人離我 3–6 格時放 trap 陷阱
    if (!silenced && d > 2 && d < 8) {
      const priority = ['freeze', 'readonly', 'merge', 'validate'];
      for (const kind of priority) {
        if (canCast(state, me, kind, now)) {
          input.skill = kind;
          break;
        }
      }
    }

    return input;
  } catch (err) {
    return idleInput();
  }
}
