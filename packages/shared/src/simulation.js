import { calculateDamage, clamp, euclidean } from './math.js';
import { getCharacterById } from './characters.js';
import { getSpawnPositions } from './spawns.js';
import {
  SKILL_COOLDOWN_MS, ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, PROJECTILE_RADIUS,
  BASELINE_SPD, MOVE_STEP, MOVE_STEP_MIN, MOVE_STEP_MAX,
  SHIELD_DURATION_BASE_MS, SHIELD_SPC_MULT_MS, SHIELD_DAMAGE_MULT,
  HEAL_PCT, HEAL_SPC_MULT,
  DASH_DISTANCE, DASH_DMG_MULT,
  STRIKE_RECOIL_DIST,
  BURST_BUFF_DURATION_MS, BURST_BUFF_MULT,
  HEAL_PASSIVE_THRESHOLD, HEAL_PASSIVE_CD_MS,
} from './constants.js';

export function createInitialState(players) {
  const spawns = getSpawnPositions(players.length);
  const state = {
    phase: 'playing', tick: 0, players: {}, events: [],
    projectiles: [],
    nextProjectileId: 1,
  };
  players.forEach((p, i) => {
    const char = getCharacterById(p.characterId);
    state.players[p.id] = {
      id: p.id, characterId: p.characterId,
      x: spawns[i].x, y: spawns[i].y,
      hp: char.stats.hp, maxHp: char.stats.hp,
      alive: true, paused: false,
      skillCdUntil: 0, lastAttackAt: 0,
      facing: 0,
      shieldedUntil: 0,
      speedBuffUntil: 0,
      healPassiveCdUntil: 0,
    };
  });
  return state;
}

function clonePlayers(players) {
  const out = {};
  for (const id in players) out[id] = { ...players[id] };
  return out;
}

// SPD 越高每 tick 位移越大；baseline spd=60 → MOVE_STEP=0.15，clamp 到 [0.08, 0.30]
export function moveStepFor(characterId) {
  const char = getCharacterById(characterId);
  const spd = char?.stats?.spd ?? BASELINE_SPD;
  return clamp(MOVE_STEP * spd / BASELINE_SPD, MOVE_STEP_MIN, MOVE_STEP_MAX);
}

// ---- Skill helpers ----

function applyShieldedDamage(target, rawDmg, now) {
  return target.shieldedUntil > now
    ? Math.floor(rawDmg * SHIELD_DAMAGE_MULT)
    : rawDmg;
}

function emitSkillDamage(events, sourceId, target, amount) {
  events.push({
    type: 'damage',
    sourceId, targetId: target.id,
    amount, isSkill: true,
    at: { x: target.x, y: target.y },
  });
}

// Strike：射出青綠色飛彈（射程 = 普攻射程），施法者沿 -facing 後退 STRIKE_RECOIL_DIST
function skillStrike(ctx, me, now, events) {
  spawnProjectile(ctx, me, true, now, events, 'strike');
  // 後座力：朝 facing 反方向推 STRIKE_RECOIL_DIST，碰矩形邊界軸向 clamp
  const dx = Math.cos(me.facing);
  const dy = Math.sin(me.facing);
  const fromX = me.x, fromY = me.y;
  const nx = me.x - dx * STRIKE_RECOIL_DIST;
  const ny = me.y - dy * STRIKE_RECOIL_DIST;
  const maxX = ARENA_WIDTH / 2 - PLAYER_RADIUS;
  const maxY = ARENA_HEIGHT / 2 - PLAYER_RADIUS;
  me.x = clamp(nx, -maxX, maxX);
  me.y = clamp(ny, -maxY, maxY);
  if (me.x !== fromX || me.y !== fromY) {
    events.push({
      type: 'strike_recoil',
      playerId: me.id,
      from: { x: fromX, y: fromY },
      to: { x: me.x, y: me.y },
    });
  }
}

// Burst：3 秒內移動 + 攻擊速度 × BURST_BUFF_MULT
function skillBurst(me, now, events) {
  me.speedBuffUntil = now + BURST_BUFF_DURATION_MS;
  events.push({
    type: 'burst_buff_on',
    playerId: me.id,
    untilMs: me.speedBuffUntil,
    at: { x: me.x, y: me.y },
  });
}

function skillDash(players, me, now, events, rng) {
  // 衝刺方向：沿玩家 facing 一次性位移 DASH_DISTANCE 世界單位，碰矩形邊界軸向 clamp
  const dx = Math.cos(me.facing);
  const dy = Math.sin(me.facing);
  const fromX = me.x, fromY = me.y;
  let nx = me.x + dx * DASH_DISTANCE;
  let ny = me.y + dy * DASH_DISTANCE;
  const maxX = ARENA_WIDTH / 2 - PLAYER_RADIUS;
  const maxY = ARENA_HEIGHT / 2 - PLAYER_RADIUS;
  nx = clamp(nx, -maxX, maxX);
  ny = clamp(ny, -maxY, maxY);
  me.x = nx; me.y = ny;
  if (fromX !== nx || fromY !== ny) {
    events.push({
      type: 'dash_move',
      playerId: me.id,
      from: { x: fromX, y: fromY },
      to: { x: nx, y: ny },
    });
  }

  // 落點相鄰敵人（歐氏距離 ≤ PLAYER_RADIUS*2 + 0.2 = 1.2）受接觸傷害
  const contactR = PLAYER_RADIUS * 2 + 0.2;
  const atkChar = getCharacterById(me.characterId);
  for (const other of Object.values(players)) {
    if (other.id === me.id || !other.alive) continue;
    if (euclidean(me, other) > contactR) continue;
    const defChar = getCharacterById(other.characterId);
    const rawDmg = calculateDamage(atkChar, defChar, true, rng, DASH_DMG_MULT);
    const final = applyShieldedDamage(other, rawDmg, now);
    other.hp = Math.max(0, other.hp - final);
    emitSkillDamage(events, me.id, other, final);
  }
}

function spawnProjectile(ctx, shooter, isSkill, now, events, variant = null) {
  const angle = shooter.facing;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const id = ctx.nextProjectileId++;
  const proj = {
    id,
    ownerId: shooter.id,
    isSkill,
    variant,
    x: shooter.x + dx * (PLAYER_RADIUS + 0.1),
    y: shooter.y + dy * (PLAYER_RADIUS + 0.1),
    vx: dx * PROJECTILE_SPEED,
    vy: dy * PROJECTILE_SPEED,
    angle,
    traveled: 0,
    spawnedAt: now,
  };
  ctx.projectiles.push(proj);
  events.push({
    type: 'projectile_spawn',
    id, ownerId: shooter.id,
    x: proj.x, y: proj.y,
    angle,
    isSkill,
    variant,
  });
}

export function applyInput(state, playerId, input, now, rng = Math.random) {
  const p = state.players[playerId];
  if (!p || !p.alive || p.paused) return state;

  const players = clonePlayers(state.players);
  const projectiles = [...(state.projectiles ?? [])];
  const me = players[playerId];
  const events = [];
  const ctx = { projectiles, nextProjectileId: state.nextProjectileId ?? 1 };

  // Facing 每 tick 由滑鼠 aim 更新（弧度）
  if (typeof input.aimAngle === 'number' && Number.isFinite(input.aimAngle)) {
    me.facing = input.aimAngle;
  }

  const buffActive = (me.speedBuffUntil ?? 0) > now;
  const speedMult = buffActive ? BURST_BUFF_MULT : 1;

  // 連續移動：WASD 推導的單位向量 + SPD 縮放（burst buff 期間 × BURST_BUFF_MULT）
  const mx = input.moveX ?? 0;
  const my = input.moveY ?? 0;
  const mag = Math.hypot(mx, my);
  if (mag > 0) {
    const step = moveStepFor(me.characterId) * speedMult;
    const nx = me.x + (mx / mag) * step;
    const ny = me.y + (my / mag) * step;
    const maxX = ARENA_WIDTH / 2 - PLAYER_RADIUS;
    const maxY = ARENA_HEIGHT / 2 - PLAYER_RADIUS;
    me.x = clamp(nx, -maxX, maxX);
    me.y = clamp(ny, -maxY, maxY);
  }

  const effectiveAtkCd = ATTACK_COOLDOWN_MS / speedMult;
  if (input.attack && now - me.lastAttackAt >= effectiveAtkCd) {
    spawnProjectile(ctx, me, false, now, events);
    me.lastAttackAt = now;
  }
  if (input.skill && now >= me.skillCdUntil) {
    const char = getCharacterById(me.characterId);
    const kind = char?.skillKind;

    // heal 角色已改成被動觸發（見 resolveTick），右鍵完全無效（不發事件、不吃 CD）
    if (kind !== 'heal') {
      events.push({
        type: 'skill_cast',
        playerId: me.id,
        kind: kind ?? 'projectile',
        at: { x: me.x, y: me.y },
        facing: me.facing,
      });
      if (kind === 'shield') {
        const spc = char?.stats?.spc ?? 0;
        me.shieldedUntil = now + SHIELD_DURATION_BASE_MS + spc * SHIELD_SPC_MULT_MS;
        events.push({ type: 'shield_on', playerId: me.id, untilMs: me.shieldedUntil, at: { x: me.x, y: me.y } });
      } else if (kind === 'strike') {
        skillStrike(ctx, me, now, events);
      } else if (kind === 'burst') {
        skillBurst(me, now, events);
      } else if (kind === 'dash') {
        skillDash(players, me, now, events, rng);
      } else {
        spawnProjectile(ctx, me, true, now, events);
      }
      me.skillCdUntil = now + SKILL_COOLDOWN_MS;
    }
  }

  return {
    ...state,
    players,
    projectiles: ctx.projectiles,
    nextProjectileId: ctx.nextProjectileId,
    events: [...state.events, ...events],
  };
}

export function resolveTick(state, now, rng = Math.random) {
  const players = clonePlayers(state.players);
  const events = [];
  const survivors = [];
  const hitR2 = (PLAYER_RADIUS + PROJECTILE_RADIUS) ** 2;
  const halfW = ARENA_WIDTH / 2;
  const halfH = ARENA_HEIGHT / 2;

  for (const proj of state.projectiles ?? []) {
    const nx = proj.x + proj.vx;
    const ny = proj.y + proj.vy;
    const traveled = proj.traveled + PROJECTILE_SPEED;

    if (nx < -halfW || nx > halfW || ny < -halfH || ny > halfH || traveled > PROJECTILE_MAX_DIST) {
      events.push({ type: 'projectile_expire', id: proj.id });
      continue;
    }

    const hit = Object.values(players).find(
      pl => pl.alive && pl.id !== proj.ownerId
        && (pl.x - nx) * (pl.x - nx) + (pl.y - ny) * (pl.y - ny) <= hitR2
    );
    if (hit) {
      const shooter = players[proj.ownerId];
      const atkChar = shooter ? getCharacterById(shooter.characterId) : null;
      const defChar = getCharacterById(hit.characterId);
      if (atkChar && defChar) {
        const rawDmg = calculateDamage(atkChar, defChar, proj.isSkill, rng);
        const finalDmg = hit.shieldedUntil > now
          ? Math.floor(rawDmg * SHIELD_DAMAGE_MULT)
          : rawDmg;
        hit.hp = Math.max(0, hit.hp - finalDmg);
        events.push({
          type: 'damage',
          sourceId: proj.ownerId, targetId: hit.id,
          amount: finalDmg, isSkill: proj.isSkill,
          at: { x: hit.x, y: hit.y },
        });
        events.push({ type: 'projectile_hit', id: proj.id, targetId: hit.id });
      }
      continue;
    }

    survivors.push({ ...proj, x: nx, y: ny, traveled });
  }

  for (const pl of Object.values(players)) {
    if (pl.alive && pl.hp <= 0) {
      pl.alive = false;
      events.push({ type: 'eliminated', playerId: pl.id });
    }
  }

  // heal 角色的被動：HP ≤ maxHp × HEAL_PASSIVE_THRESHOLD 時自動回血，lockout HEAL_PASSIVE_CD_MS
  for (const pl of Object.values(players)) {
    if (!pl.alive) continue;
    const char = getCharacterById(pl.characterId);
    if (char?.skillKind !== 'heal') continue;
    if (pl.hp > pl.maxHp * HEAL_PASSIVE_THRESHOLD) continue;
    if (pl.hp >= pl.maxHp) continue;
    if (now < (pl.healPassiveCdUntil ?? 0)) continue;
    const spc = char?.stats?.spc ?? 0;
    const amount = Math.floor(pl.maxHp * HEAL_PCT + spc * HEAL_SPC_MULT);
    const before = pl.hp;
    pl.hp = Math.min(pl.maxHp, pl.hp + amount);
    const healed = pl.hp - before;
    if (healed > 0) {
      pl.healPassiveCdUntil = now + HEAL_PASSIVE_CD_MS;
      events.push({
        type: 'skill_cast',
        playerId: pl.id, kind: 'heal',
        at: { x: pl.x, y: pl.y }, facing: pl.facing,
      });
      events.push({ type: 'heal', playerId: pl.id, amount: healed, at: { x: pl.x, y: pl.y } });
    }
  }

  const next = {
    ...state,
    tick: state.tick + 1,
    players,
    projectiles: survivors,
    nextProjectileId: state.nextProjectileId ?? 1,
    events: [...state.events, ...events],
  };
  if (aliveCount(next) <= 1) next.phase = 'ended';
  return { state: next, events };
}

export function aliveCount(state) {
  return Object.values(state.players).filter(p => p.alive).length;
}

export function getWinner(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  return alive.length === 1 ? alive[0].id : null;
}
