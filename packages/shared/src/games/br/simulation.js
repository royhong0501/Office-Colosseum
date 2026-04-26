// 經典大逃殺 simulation — server-authoritative。
// 所有玩家機制一致（角色只作為皮膚）；核心系統：格子地圖 + 掩體 + 子彈 +
// 舉盾減傷 + 衝刺無敵 + 報錯毒圈擴散 + 毒圈扣血。

import { TICK_MS } from '../../constants.js';
import { clamp } from '../../math.js';
import {
  ARENA_COLS, ARENA_ROWS,
  MAX_HP, PLAYER_RADIUS, PROJECTILE_RADIUS,
  MOVE_SPEED, MOVE_SPEED_SHIELD,
  SHOOT_CD_MS, BULLET_DMG, BULLET_SPEED, BULLET_MAX_DIST,
  SHIELD_MAX_HP, SHIELD_ARC_HALF_RAD, SHIELD_BREAK_LOCK_MS,
  DASH_CELLS, DASH_CD_MS, DASH_INVULN_MS,
  POISON_DPS, POISON_SEVERE_MULT, POISON_START_MS, POISON_WAVE_INTERVAL_MS,
} from './constants.js';
import { expandCovers, autoSpawns, pickMap, getMapById } from './maps.js';

export const GAME_ID = 'battle-royale';
export const NAME = '經典大逃殺';

/* ------------------------------------------------------------
   State shape
   ------------------------------------------------------------
   state = {
     phase: 'playing' | 'ended',
     tick: number,
     startedAtMs,
     gameType: 'battle-royale',
     config: { mapId? },
     map: { id, name, covers: [[c,r,w,h]...], coversSet: Set<"c,r">, spawns: [[c,r]...] },
     players: { [id]: {
       id, characterId,
       x, y,                   // world floats, corner-origin
       hp, maxHp,
       alive, paused,
       moveX, moveY,            // 正規化後的移動向量（resolveTick 會乘 speed * dt）
       aimAngle, facing,        // radians
       shielding,                              // RMB held + canShield 過濾後的最終值
       shieldHp, shieldMaxHp, shieldBrokenUntil, // 弧形盾耐久；shieldBrokenUntil>now 表 5s 鎖死期
       shootCdUntil, dashCdUntil, invulnUntil,
       lastPoisonTickAt, lastHurtAt,
     } },
     bullets: [{ id, ownerId, x, y, vx, vy, angle, traveled, spawnedAtMs }],
     poison: { infected: Set<"c,r">, severe: Set<"c,r">, nextWaveAtMs, waveCount },
     nextBulletId,
     events: [...],
   }
   ------------------------------------------------------------ */

/* ---- Helpers ------------------------------------------------- */

function cellKey(c, r) { return `${c},${r}`; }

function cellOf(x, y) {
  return [Math.floor(x), Math.floor(y)];
}

// 格子 (c,r) 是否在場內且不是 cover
function isWalkable(coversSet, c, r) {
  if (c < 0 || c >= ARENA_COLS || r < 0 || r >= ARENA_ROWS) return false;
  return !coversSet.has(cellKey(c, r));
}

// 浮點座標 (x, y) 帶 player 半徑是否可站（取四個邊界 cell）
function canStand(coversSet, x, y) {
  const left = Math.floor(x - PLAYER_RADIUS);
  const right = Math.floor(x + PLAYER_RADIUS);
  const top = Math.floor(y - PLAYER_RADIUS);
  const bottom = Math.floor(y + PLAYER_RADIUS);
  for (let c = left; c <= right; c++) {
    for (let r = top; r <= bottom; r++) {
      if (!isWalkable(coversSet, c, r)) return false;
    }
  }
  return true;
}

function lineOfSightClear(coversSet, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.ceil(dist * 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + dx * t, y = ay + dy * t;
    const [c, r] = cellOf(x, y);
    if (!isWalkable(coversSet, c, r)) return false;
  }
  return true;
}

/* ---- createInitialState -------------------------------------- */

export function createInitialState(players, config = {}, startedAtMs = Date.now()) {
  const map = config.mapId ? (getMapById(config.mapId) ?? pickMap(0)) : pickMap(config.mapIdx);
  const coversSet = expandCovers(map.covers);
  const spawns = autoSpawns(map);

  const state = {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    gameType: GAME_ID,
    config: { mapId: map.id },
    map: {
      id: map.id,
      name: map.name,
      covers: map.covers,
      coversSet,
      spawns,
    },
    players: {},
    bullets: [],
    poison: {
      infected: new Set(),
      severe: new Set(),
      nextWaveAtMs: startedAtMs + POISON_START_MS,
      waveCount: 0,
    },
    nextBulletId: 1,
    events: [],
  };

  let i = 0;
  for (const p of players) {
    const spawn = spawns[i % spawns.length] ?? [0, 0];
    state.players[p.id] = {
      id: p.id,
      characterId: p.characterId,
      x: spawn[0] + 0.5,
      y: spawn[1] + 0.5,
      hp: MAX_HP,
      maxHp: MAX_HP,
      alive: true,
      paused: false,
      moveX: 0, moveY: 0,
      aimAngle: 0, facing: 0,
      shielding: false,
      shieldHp: SHIELD_MAX_HP,
      shieldMaxHp: SHIELD_MAX_HP,
      shieldBrokenUntil: 0,
      shootCdUntil: 0,
      dashCdUntil: 0,
      invulnUntil: 0,
      lastPoisonTickAt: 0,
      lastHurtAt: 0,
    };
    i++;
  }
  return state;
}

/* ---- sanitizeInput ------------------------------------------ */
// Server 收到 client 的 INPUT 後，先過這層白名單再傳給 applyInput。
// 拒絕非物件 / NaN / Infinity，把布林強制 cast。
// 不正規化向量長度（applyInput 內 Math.hypot 會處理）。
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  return {
    seq: Number.isFinite(raw.seq) ? (raw.seq | 0) : 0,
    moveX: num(raw.moveX),
    moveY: num(raw.moveY),
    aimAngle: num(raw.aimAngle),
    attack: !!raw.attack,
    shield: !!raw.shield,
    dash: !!raw.dash,
  };
}

/* ---- applyInput ---------------------------------------------- */

export function applyInput(state, playerId, input, now, rng = Math.random) {
  const p = state.players[playerId];
  if (!p || !p.alive || p.paused) return state;

  // 移動向量（resolveTick 才真的位移，這裡只記錄意圖）
  const mx = input.moveX ?? 0;
  const my = input.moveY ?? 0;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    p.moveX = mx / len; p.moveY = my / len;
  } else {
    p.moveX = 0; p.moveY = 0;
  }

  // aim（每 tick 覆寫）
  if (typeof input.aimAngle === 'number') {
    p.aimAngle = input.aimAngle;
    p.facing = input.aimAngle;
  }

  // 舉盾（held）— 必須有耐久且不在破盾鎖死期才能真的舉
  const wasShielding = p.shielding;
  const canShield = !!input.shield && p.shieldHp > 0 && now >= p.shieldBrokenUntil;
  p.shielding = canShield;
  if (!wasShielding && p.shielding) {
    state.events.push({ type: 'shield_on', playerId, at: { x: p.x, y: p.y } });
  } else if (wasShielding && !p.shielding) {
    state.events.push({ type: 'shield_off', playerId });
  }

  // 衝刺（one-shot）
  if (input.dash && now >= p.dashCdUntil) {
    const a = p.aimAngle;
    const fromX = p.x, fromY = p.y;
    // 每 step=0.25 cell 試著推進，撞 cover 就停
    let toX = p.x, toY = p.y;
    const stepSize = 0.25;
    const steps = Math.ceil(DASH_CELLS / stepSize);
    for (let i = 1; i <= steps; i++) {
      const nx = p.x + Math.cos(a) * stepSize * i;
      const ny = p.y + Math.sin(a) * stepSize * i;
      if (!canStand(state.map.coversSet, nx, ny)) break;
      toX = nx; toY = ny;
    }
    p.x = toX;
    p.y = toY;
    p.dashCdUntil = now + DASH_CD_MS;
    p.invulnUntil = now + DASH_INVULN_MS;
    state.events.push({ type: 'dash_move', playerId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } });
  }

  // 射擊（held 子彈，吃 SHOOT_CD_MS 節流）— 舉盾期間 LMB 互斥不發射
  if (input.attack && now >= p.shootCdUntil && !p.shielding) {
    const id = state.nextBulletId++;
    const angle = p.aimAngle;
    const bullet = {
      id,
      ownerId: playerId,
      x: p.x, y: p.y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      angle,
      traveled: 0,
      spawnedAtMs: now,
    };
    state.bullets.push(bullet);
    p.shootCdUntil = now + SHOOT_CD_MS;
    state.events.push({ type: 'projectile_spawn', id, ownerId: playerId, x: p.x, y: p.y, angle });
  }

  return state;
}

/* ---- resolveTick -------------------------------------------- */

export function resolveTick(state, now, rng = Math.random) {
  const dt = TICK_MS / 1000;
  state.tick += 1;

  // 玩家移動（X / Y 分開試以支援沿牆滑）
  for (const p of Object.values(state.players)) {
    if (!p.alive || p.paused) continue;
    if (p.moveX === 0 && p.moveY === 0) continue;
    const speed = p.shielding ? MOVE_SPEED_SHIELD : MOVE_SPEED;
    const step = speed * dt;
    const nx = p.x + p.moveX * step;
    const ny = p.y + p.moveY * step;
    if (canStand(state.map.coversSet, nx, p.y)) p.x = nx;
    if (canStand(state.map.coversSet, p.x, ny)) p.y = ny;
    // clamp to arena
    p.x = clamp(p.x, PLAYER_RADIUS, ARENA_COLS - PLAYER_RADIUS);
    p.y = clamp(p.y, PLAYER_RADIUS, ARENA_ROWS - PLAYER_RADIUS);
  }

  // 子彈步進 + 碰撞
  const survivingBullets = [];
  for (const b of state.bullets) {
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    const moved = Math.hypot(nx - b.x, ny - b.y);
    b.traveled += moved;
    b.x = nx; b.y = ny;

    // 出界
    if (b.x < 0 || b.x > ARENA_COLS || b.y < 0 || b.y > ARENA_ROWS || b.traveled >= BULLET_MAX_DIST) {
      state.events.push({ type: 'projectile_expire', id: b.id });
      continue;
    }

    // 撞 cover cell
    const [c, r] = cellOf(b.x, b.y);
    if (!isWalkable(state.map.coversSet, c, r)) {
      state.events.push({ type: 'projectile_hit', id: b.id, targetId: null, at: { x: b.x, y: b.y } });
      continue;
    }

    // 撞玩家
    const hitRadiusSq = (PLAYER_RADIUS + PROJECTILE_RADIUS) * (PLAYER_RADIUS + PROJECTILE_RADIUS);
    let hit = null;
    for (const p of Object.values(state.players)) {
      if (!p.alive || p.id === b.ownerId) continue;
      if (now < p.invulnUntil) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= hitRadiusSq) { hit = p; break; }
    }
    if (hit) {
      // 舉盾且耐久 > 0：算子彈來向相對 hit.facing 的最短弧度差
      let blocked = false;
      if (hit.shielding && hit.shieldHp > 0) {
        const fromBulletAngle = Math.atan2(b.y - hit.y, b.x - hit.x);
        let diff = fromBulletAngle - hit.facing;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) <= SHIELD_ARC_HALF_RAD) {
          blocked = true;
          // 「最後一擊」邏輯：扣完到 0 即可，不會穿透剩餘到 HP
          const absorbed = Math.min(hit.shieldHp, BULLET_DMG);
          hit.shieldHp = Math.max(0, hit.shieldHp - absorbed);
          state.events.push({
            type: 'shield_block',
            shooterId: b.ownerId, defenderId: hit.id,
            at: { x: b.x, y: b.y }, shieldHp: hit.shieldHp,
          });
          if (hit.shieldHp <= 0) {
            hit.shielding = false;
            hit.shieldBrokenUntil = now + SHIELD_BREAK_LOCK_MS;
            state.events.push({
              type: 'shield_break', playerId: hit.id, at: { x: b.x, y: b.y },
            });
          }
        }
      }
      if (!blocked) {
        hit.hp -= BULLET_DMG;
        hit.lastHurtAt = now;
        state.events.push({ type: 'damage', sourceId: b.ownerId, targetId: hit.id, amount: BULLET_DMG, kind: 'bullet', at: { x: b.x, y: b.y } });
        if (hit.hp <= 0) {
          hit.hp = 0;
          hit.alive = false;
          state.events.push({ type: 'eliminated', playerId: hit.id });
        }
      }
      state.events.push({ type: 'projectile_hit', id: b.id, targetId: hit.id, at: { x: b.x, y: b.y } });
      continue;
    }

    survivingBullets.push(b);
  }
  state.bullets = survivingBullets;

  // 毒圈擴散
  advancePoison(state, now, rng);

  // 毒扣血（每秒 1 次）
  for (const p of Object.values(state.players)) {
    if (!p.alive) continue;
    const [c, r] = cellOf(p.x, p.y);
    const key = cellKey(c, r);
    const onInfected = state.poison.infected.has(key);
    if (!onInfected) continue;
    if (now - p.lastPoisonTickAt >= 1000) {
      p.lastPoisonTickAt = now;
      const severe = state.poison.severe.has(key);
      const dmg = severe ? POISON_DPS * POISON_SEVERE_MULT : POISON_DPS;
      p.hp -= dmg;
      p.lastHurtAt = now;
      state.events.push({ type: 'damage', sourceId: null, targetId: p.id, amount: dmg, kind: 'poison', at: { x: p.x, y: p.y } });
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        state.events.push({ type: 'eliminated', playerId: p.id });
      }
    }
  }

  // 盾耐久回復：被破後鎖死 5s 結束 → 一次回滿
  for (const p of Object.values(state.players)) {
    if (!p.alive) continue;
    if (p.shieldBrokenUntil > 0 && now >= p.shieldBrokenUntil) {
      p.shieldHp = p.shieldMaxHp;
      p.shieldBrokenUntil = 0;
      state.events.push({ type: 'shield_recovered', playerId: p.id });
    }
  }

  // 結束條件
  if (aliveCount(state) <= 1) {
    state.phase = 'ended';
  }

  return { state };
}

function advancePoison(state, now, rng) {
  if (now < state.poison.nextWaveAtMs) return;

  state.poison.waveCount += 1;
  state.poison.nextWaveAtMs = now + POISON_WAVE_INTERVAL_MS;
  const newCells = [];

  if (state.poison.waveCount === 1) {
    // 第 1 波：四邊各以 0.6 機率汙染
    for (let c = 0; c < ARENA_COLS; c++) {
      if (rng() < 0.6) { state.poison.infected.add(cellKey(c, 0)); newCells.push([c, 0]); }
      if (rng() < 0.6) { state.poison.infected.add(cellKey(c, ARENA_ROWS - 1)); newCells.push([c, ARENA_ROWS - 1]); }
    }
    for (let r = 0; r < ARENA_ROWS; r++) {
      if (rng() < 0.6) { state.poison.infected.add(cellKey(0, r)); newCells.push([0, r]); }
      if (rng() < 0.6) { state.poison.infected.add(cellKey(ARENA_COLS - 1, r)); newCells.push([ARENA_COLS - 1, r]); }
    }
  } else {
    // 後續波：鄰居 0.55 機率擴散；並把部分 infected 升級為 severe
    const toAdd = [];
    for (const k of state.poison.infected) {
      const [sc, sr] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = sc + dc, nr = sr + dr;
        if (nc < 0 || nc >= ARENA_COLS || nr < 0 || nr >= ARENA_ROWS) continue;
        const nk = cellKey(nc, nr);
        if (!state.poison.infected.has(nk) && rng() < 0.55) toAdd.push([nc, nr, nk]);
      }
    }
    for (const [c, r, k] of toAdd) {
      state.poison.infected.add(k);
      newCells.push([c, r]);
    }
    // severe 升級（上限 30 格 / 波）
    let severeAdded = 0;
    for (const k of state.poison.infected) {
      if (severeAdded >= 30) break;
      if (state.poison.severe.has(k)) continue;
      if (rng() < 0.15) { state.poison.severe.add(k); severeAdded++; }
    }
  }

  state.events.push({ type: 'poison_wave', waveCount: state.poison.waveCount, newCells });
}

/* ---- Queries ------------------------------------------------- */

export function aliveCount(state) {
  let n = 0;
  for (const p of Object.values(state.players)) if (p.alive) n++;
  return n;
}

export function getWinner(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  return alive.length === 1 ? alive[0].id : null;
}

/* ---- Payload builders --------------------------------------- */

/** 傳給 client 的 SNAPSHOT payload — 不能含 Set（JSON 不支援），把 poison.infected / severe 轉 array。 */
export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    players: state.players,
    bullets: state.bullets,
    poison: {
      infected: [...state.poison.infected],
      severe: [...state.poison.severe],
      nextWaveAtMs: state.poison.nextWaveAtMs,
      waveCount: state.poison.waveCount,
    },
    events: newEvents,
  };
}

/** MATCH_START 包完整初始 state + map 資料，client 取得後就可以渲染靜態地圖。 */
export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config,
    state: {
      ...state,
      // 剝掉 Set（JSON 無法序列化）
      map: {
        id: state.map.id,
        name: state.map.name,
        covers: state.map.covers,
        spawns: state.map.spawns,
      },
      poison: {
        infected: [],
        severe: [],
        nextWaveAtMs: state.poison.nextWaveAtMs,
        waveCount: state.poison.waveCount,
      },
    },
  };
}
