// 道具戰 simulation — server-authoritative。
// WASD 移動 + LMB 射擊（基本攻擊）+ 1–5 施放儲存格技能（4 個 trap + 1 個自我回溯）
// traps 放在當前 cell，等敵人踩到才觸發效果；undo 直接作用自己。

import { TICK_MS } from '../../constants.js';
import { clamp } from '../../math.js';
import {
  ARENA_COLS, ARENA_ROWS,
  MAX_HP, MAX_MP, MP_REGEN_PER_SEC, PLAYER_RADIUS, PROJECTILE_RADIUS,
  MOVE_SPEED, MOVE_SPEED_SLOWED,
  SHOOT_CD_MS, BULLET_DMG, BULLET_SPEED, BULLET_MAX_DIST,
  ROUND_DURATION_MS,
  SKILLS, SKILL_KEYS,
  HP_HISTORY_INTERVAL_MS, HP_HISTORY_LEN,
} from './constants.js';

export const GAME_ID = 'items';
export const NAME = '道具戰';

/* ------------------------------------------------------------
   State 形狀
   ------------------------------------------------------------
   state = {
     phase: 'playing' | 'ended',
     tick, startedAtMs, roundEndsAtMs,
     gameType: 'items', config: {},
     players: { [id]: {
       id, characterId, x, y,
       hp, maxHp, mp, maxMp,
       alive, paused,
       moveX, moveY, aimAngle, facing,
       shootCdUntil,
       skillCdUntil: { freeze, undo, merge, readonly, validate },  // absolute ms
       frozenUntil, slowedUntil, silencedUntil,                    // debuff absolute ms
       hpHistory: [{ atMs, hp }...],
       lastHurtAt, lastHpRecordAt,
     }},
     bullets: [{ id, ownerId, x, y, vx, vy, angle, traveled, spawnedAtMs }],
     traps: [{ id, kind, cx, cy, ownerId, placedAtMs }],  // cx/cy = cell 中心 integer
     nextBulletId, nextTrapId,
     events: [...],
   }
   ------------------------------------------------------------ */

function cellOf(x, y) { return [Math.floor(x), Math.floor(y)]; }

export function createInitialState(players, config = {}, startedAtMs = Date.now()) {
  const state = {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    roundEndsAtMs: startedAtMs + ROUND_DURATION_MS,
    gameType: GAME_ID,
    config: {},
    players: {},
    bullets: [],
    traps: [],
    nextBulletId: 1,
    nextTrapId: 1,
    events: [],
  };
  // 將玩家均勻放在場邊（左右各半）
  const spawns = autoSpawns(players.length);
  players.forEach((p, i) => {
    const [cx, cy] = spawns[i % spawns.length];
    state.players[p.id] = {
      id: p.id,
      characterId: p.characterId,
      x: cx + 0.5, y: cy + 0.5,
      hp: MAX_HP, maxHp: MAX_HP,
      mp: MAX_MP / 2, maxMp: MAX_MP,
      alive: true, paused: false,
      moveX: 0, moveY: 0,
      aimAngle: 0, facing: 0,
      shootCdUntil: 0,
      skillCdUntil: { freeze: 0, undo: 0, merge: 0, readonly: 0, validate: 0 },
      frozenUntil: 0, slowedUntil: 0, silencedUntil: 0,
      hpHistory: [{ atMs: startedAtMs, hp: MAX_HP }],
      lastHurtAt: 0, lastHpRecordAt: startedAtMs,
    };
  });
  return state;
}

function autoSpawns(n) {
  const r = Math.floor(ARENA_ROWS / 2);
  return [
    [1, 1], [ARENA_COLS - 2, 1],
    [1, ARENA_ROWS - 2], [ARENA_COLS - 2, ARENA_ROWS - 2],
    [1, r], [ARENA_COLS - 2, r],
    [Math.floor(ARENA_COLS / 2), 1], [Math.floor(ARENA_COLS / 2), ARENA_ROWS - 2],
  ].slice(0, Math.max(n, 1));
}

/* ------------------------------------------------------------
   applyInput
   input = { seq, moveX, moveY, aimAngle, attack, skill: 'freeze'|'undo'|... or null }
   ------------------------------------------------------------ */

export function applyInput(state, playerId, input, now, rng = Math.random) {
  const p = state.players[playerId];
  if (!p || !p.alive || p.paused) return state;
  // 凍結中不能動 / 不能射 / 不能施技
  const frozen = now < p.frozenUntil;

  if (!frozen) {
    const mx = input.moveX ?? 0, my = input.moveY ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 0) { p.moveX = mx / len; p.moveY = my / len; }
    else { p.moveX = 0; p.moveY = 0; }
  } else {
    p.moveX = 0; p.moveY = 0;
  }

  if (typeof input.aimAngle === 'number') {
    p.aimAngle = input.aimAngle;
    p.facing = input.aimAngle;
  }

  // 基本攻擊
  if (!frozen && input.attack && now >= p.shootCdUntil) {
    const id = state.nextBulletId++;
    const angle = p.aimAngle;
    state.bullets.push({
      id, ownerId: playerId,
      x: p.x, y: p.y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      angle, traveled: 0, spawnedAtMs: now,
    });
    p.shootCdUntil = now + SHOOT_CD_MS;
    state.events.push({ type: 'projectile_spawn', id, ownerId: playerId, x: p.x, y: p.y, angle });
  }

  // 技能：凍結期間只允許 undo（因為 undo 會解除定身）；silenced 期間全擋。
  const silenced = now < p.silencedUntil;
  const skillId = input.skill;
  const skillAllowed = !silenced && (!frozen || skillId === 'undo');
  if (skillAllowed && skillId && SKILL_KEYS.includes(skillId)) {
    const cfg = SKILLS[skillId];
    const cdOk = now >= (p.skillCdUntil[skillId] ?? 0);
    const mpOk = p.mp >= cfg.mpCost;
    if (cdOk && mpOk) {
      p.mp -= cfg.mpCost;
      p.skillCdUntil[skillId] = now + cfg.cdMs;
      castSkill(state, p, skillId, now, rng);
    }
  }

  return state;
}

function castSkill(state, p, kind, now, rng) {
  if (kind === 'undo') {
    // 回 2s 前 HP（找 hpHistory 最接近 2s 前的）
    const target = now - SKILLS.undo.rewindMs;
    let restored = p.hp;
    for (const snap of p.hpHistory) {
      if (snap.atMs <= target) restored = snap.hp;
    }
    if (restored > p.hp) p.hp = Math.min(p.maxHp, restored);
    // 清 debuff
    p.frozenUntil = 0;
    p.slowedUntil = 0;
    p.silencedUntil = 0;
    state.events.push({ type: 'skill_cast', kind: 'undo', playerId: p.id, hpRestored: p.hp });
    return;
  }
  // 其餘 4 個都是放 trap 在當前 cell
  const [cx, cy] = cellOf(p.x, p.y);
  const id = state.nextTrapId++;
  state.traps.push({
    id, kind, cx, cy, ownerId: p.id, placedAtMs: now,
  });
  state.events.push({ type: 'trap_placed', id, kind, cx, cy, ownerId: p.id });
}

/* ------------------------------------------------------------
   resolveTick
   ------------------------------------------------------------ */

export function resolveTick(state, now, rng = Math.random) {
  const dt = TICK_MS / 1000;
  state.tick += 1;

  // 移動
  for (const p of Object.values(state.players)) {
    if (!p.alive || p.paused) continue;
    if (now < p.frozenUntil) continue;
    if (p.moveX === 0 && p.moveY === 0) continue;
    const slowed = now < p.slowedUntil;
    const speed = slowed ? MOVE_SPEED_SLOWED : MOVE_SPEED;
    const step = speed * dt;
    const nx = p.x + p.moveX * step;
    const ny = p.y + p.moveY * step;
    p.x = clamp(nx, PLAYER_RADIUS, ARENA_COLS - PLAYER_RADIUS);
    p.y = clamp(ny, PLAYER_RADIUS, ARENA_ROWS - PLAYER_RADIUS);
  }

  // MP 回復 + HP 歷史 snapshot
  const mpGain = MP_REGEN_PER_SEC * dt;
  for (const p of Object.values(state.players)) {
    if (!p.alive) continue;
    p.mp = Math.min(p.maxMp, p.mp + mpGain);
    if (now - (p.lastHpRecordAt ?? 0) >= HP_HISTORY_INTERVAL_MS) {
      p.hpHistory.push({ atMs: now, hp: p.hp });
      if (p.hpHistory.length > HP_HISTORY_LEN) p.hpHistory.shift();
      p.lastHpRecordAt = now;
    }
  }

  // 子彈步進（無 cover，只有邊界 + 玩家命中）
  const survivingBullets = [];
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.traveled += BULLET_SPEED * dt;
    if (b.x < 0 || b.x > ARENA_COLS || b.y < 0 || b.y > ARENA_ROWS || b.traveled >= BULLET_MAX_DIST) {
      state.events.push({ type: 'projectile_expire', id: b.id });
      continue;
    }
    const hitRsq = (PLAYER_RADIUS + PROJECTILE_RADIUS) ** 2;
    let hit = null;
    for (const p of Object.values(state.players)) {
      if (!p.alive || p.id === b.ownerId) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= hitRsq) { hit = p; break; }
    }
    if (hit) {
      hit.hp = Math.max(0, hit.hp - BULLET_DMG);
      hit.lastHurtAt = now;
      state.events.push({ type: 'damage', sourceId: b.ownerId, targetId: hit.id, amount: BULLET_DMG, kind: 'bullet', at: { x: b.x, y: b.y } });
      state.events.push({ type: 'projectile_hit', id: b.id, targetId: hit.id, at: { x: b.x, y: b.y } });
      if (hit.hp <= 0) {
        hit.alive = false;
        state.events.push({ type: 'eliminated', playerId: hit.id });
      }
      continue;
    }
    survivingBullets.push(b);
  }
  state.bullets = survivingBullets;

  // Trap 觸發（非放設者踩到 cell 中心）
  const remainingTraps = [];
  for (const t of state.traps) {
    let triggered = null;
    for (const p of Object.values(state.players)) {
      if (!p.alive || p.id === t.ownerId) continue;
      const [pcx, pcy] = cellOf(p.x, p.y);
      if (pcx === t.cx && pcy === t.cy) { triggered = p; break; }
    }
    if (triggered) {
      applyTrapEffect(state, t, triggered, now, rng);
      state.events.push({ type: 'trap_triggered', id: t.id, kind: t.kind, cx: t.cx, cy: t.cy, victimId: triggered.id });
    } else {
      remainingTraps.push(t);
    }
  }
  state.traps = remainingTraps;

  // 結束條件：活人 ≤1 或 回合時間到
  const alive = aliveCount(state);
  if (alive <= 1 || now >= state.roundEndsAtMs) {
    state.phase = 'ended';
  }

  return { state };
}

function applyTrapEffect(state, trap, victim, now, rng) {
  const cfg = SKILLS[trap.kind];
  switch (trap.kind) {
    case 'freeze':
      victim.frozenUntil = Math.max(victim.frozenUntil, now + cfg.durationMs);
      break;
    case 'merge':
      victim.slowedUntil = Math.max(victim.slowedUntil, now + cfg.durationMs);
      break;
    case 'readonly':
      victim.silencedUntil = Math.max(victim.silencedUntil, now + cfg.durationMs);
      break;
    case 'validate': {
      // 隨機傳送到場內一格中心
      const tc = Math.floor(rng() * ARENA_COLS);
      const tr = Math.floor(rng() * ARENA_ROWS);
      const fromX = victim.x, fromY = victim.y;
      victim.x = tc + 0.5;
      victim.y = tr + 0.5;
      state.events.push({ type: 'teleport', playerId: victim.id, from: { x: fromX, y: fromY }, to: { x: victim.x, y: victim.y } });
      break;
    }
    default: break;
  }
}

/* ------------------------------------------------------------
   Queries / payload builders
   ------------------------------------------------------------ */

export function aliveCount(state) {
  let n = 0;
  for (const p of Object.values(state.players)) if (p.alive) n++;
  return n;
}

export function getWinner(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  if (alive.length === 1) return alive[0].id;
  // 若時間到沒單一勝者 → 按 HP 最高
  if (state.phase === 'ended' && alive.length > 1) {
    return alive.slice().sort((a, b) => b.hp - a.hp)[0].id;
  }
  return null;
}

export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    startedAtMs: state.startedAtMs,
    roundEndsAtMs: state.roundEndsAtMs,
    players: state.players,
    bullets: state.bullets,
    traps: state.traps,
    events: newEvents,
  };
}

export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config: config ?? {},
    state: {
      ...state,
    },
  };
}
