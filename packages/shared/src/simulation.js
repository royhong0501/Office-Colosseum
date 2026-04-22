import { calculateDamage, clamp, manhattan } from './math.js';
import { getCharacterById } from './characters.js';
import { getSpawnPositions } from './spawns.js';
import {
  MOVE_COOLDOWN_MS, SKILL_COOLDOWN_MS, ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  ARENA_COLS, ARENA_ROWS,
  BASELINE_SPD, MOVE_COOLDOWN_MIN_MS, MOVE_COOLDOWN_MAX_MS,
  SHIELD_DURATION_MS, SHIELD_DAMAGE_MULT, HEAL_PCT,
  ATTACK_RANGE, BURST_MULT, DASH_DISTANCE, DASH_DMG_MULT,
} from './constants.js';

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx: 1,  dy:  0 },
};

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
      skillCdUntil: 0, lastMoveAt: 0, lastAttackAt: 0,
      facing: 'right',
      shieldedUntil: 0,
    };
  });
  return state;
}

function clonePlayers(players) {
  const out = {};
  for (const id in players) out[id] = { ...players[id] };
  return out;
}

// SPD 越高移動冷卻越短；baseline spd=60 → MOVE_COOLDOWN_MS=150ms，clamp 到 [80, 300]
export function moveCooldownFor(characterId) {
  const char = getCharacterById(characterId);
  const spd = char?.stats?.spd ?? BASELINE_SPD;
  return clamp(
    Math.round(MOVE_COOLDOWN_MS * BASELINE_SPD / Math.max(spd, 1)),
    MOVE_COOLDOWN_MIN_MS, MOVE_COOLDOWN_MAX_MS,
  );
}

// ---- Melee skill helpers（strike / burst / dash 走瞬發判定、不走投射物） ----

function nearestEnemy(players, myId) {
  const me = players[myId];
  let best = null, bestD = Infinity;
  for (const other of Object.values(players)) {
    if (other.id === myId || !other.alive) continue;
    const d = manhattan(me, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best ? { target: best, distance: bestD } : null;
}

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

function skillStrike(players, me, now, events, rng) {
  const near = nearestEnemy(players, me.id);
  if (!near || near.distance > ATTACK_RANGE) return;
  const atkChar = getCharacterById(me.characterId);
  const defChar = getCharacterById(near.target.characterId);
  const rawDmg = calculateDamage(atkChar, defChar, true, rng); // skillMult default 1.5x
  const final = applyShieldedDamage(near.target, rawDmg, now);
  near.target.hp = Math.max(0, near.target.hp - final);
  emitSkillDamage(events, me.id, near.target, final);
}

function skillBurst(players, me, now, events, rng) {
  const atkChar = getCharacterById(me.characterId);
  for (const other of Object.values(players)) {
    if (other.id === me.id || !other.alive) continue;
    if (manhattan(me, other) > ATTACK_RANGE) continue;
    const defChar = getCharacterById(other.characterId);
    const rawDmg = calculateDamage(atkChar, defChar, true, rng, BURST_MULT);
    const final = applyShieldedDamage(other, rawDmg, now);
    other.hp = Math.max(0, other.hp - final);
    emitSkillDamage(events, me.id, other, final);
  }
}

function skillDash(players, me, now, events, rng) {
  // 衝刺方向：朝最近敵人差量較大的那一軸；無敵人就依 facing
  const near = nearestEnemy(players, me.id);
  let dir;
  if (near) {
    const ex = near.target.x - me.x;
    const ey = near.target.y - me.y;
    if (Math.abs(ex) >= Math.abs(ey)) {
      dir = ex >= 0 ? DIRS.right : DIRS.left;
    } else {
      dir = ey >= 0 ? DIRS.down : DIRS.up;
    }
  } else {
    dir = DIRS[me.facing] ?? DIRS.right;
  }

  const fromX = me.x, fromY = me.y;
  for (let i = 0; i < DASH_DISTANCE; i++) {
    const nx = me.x + dir.dx;
    const ny = me.y + dir.dy;
    if (nx < 0 || nx >= ARENA_COLS || ny < 0 || ny >= ARENA_ROWS) break;
    const blocked = Object.values(players).some(
      p => p.id !== me.id && p.alive && p.x === nx && p.y === ny,
    );
    if (blocked) break;
    me.x = nx; me.y = ny;
  }
  if (me.x !== fromX || me.y !== fromY) {
    events.push({
      type: 'dash_move',
      playerId: me.id,
      from: { x: fromX, y: fromY },
      to: { x: me.x, y: me.y },
    });
  }

  // 落點相鄰格（manhattan ≤ 1）的敵人受接觸傷害
  const atkChar = getCharacterById(me.characterId);
  for (const other of Object.values(players)) {
    if (other.id === me.id || !other.alive) continue;
    if (manhattan(me, other) > 1) continue;
    const defChar = getCharacterById(other.characterId);
    const rawDmg = calculateDamage(atkChar, defChar, true, rng, DASH_DMG_MULT);
    const final = applyShieldedDamage(other, rawDmg, now);
    other.hp = Math.max(0, other.hp - final);
    emitSkillDamage(events, me.id, other, final);
  }
}

function spawnProjectile(ctx, shooter, isSkill, now, events) {
  const { dx, dy } = DIRS[shooter.facing] ?? DIRS.right;
  const id = ctx.nextProjectileId++;
  const proj = {
    id,
    ownerId: shooter.id,
    isSkill,
    x: shooter.x + dx * 0.5,
    y: shooter.y + dy * 0.5,
    vx: dx * PROJECTILE_SPEED,
    vy: dy * PROJECTILE_SPEED,
    facing: shooter.facing,
    traveled: 0,
    spawnedAt: now,
  };
  ctx.projectiles.push(proj);
  events.push({
    type: 'projectile_spawn',
    id, ownerId: shooter.id,
    x: proj.x, y: proj.y,
    facing: shooter.facing,
    isSkill,
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

  // Facing: any direction key updates facing even if movement is blocked
  if (input.dir && DIRS[input.dir]) {
    me.facing = input.dir;
    if (now - me.lastMoveAt >= moveCooldownFor(me.characterId)) {
      const { dx, dy } = DIRS[input.dir];
      const nx = me.x + dx, ny = me.y + dy;
      if (nx >= 0 && nx < ARENA_COLS && ny >= 0 && ny < ARENA_ROWS) {
        me.x = nx; me.y = ny; me.lastMoveAt = now;
      }
    }
  }

  if (input.attack && now - me.lastAttackAt >= ATTACK_COOLDOWN_MS) {
    spawnProjectile(ctx, me, false, now, events);
    me.lastAttackAt = now;
  }
  if (input.skill && now >= me.skillCdUntil) {
    const char = getCharacterById(me.characterId);
    const kind = char?.skillKind;
    if (kind === 'heal') {
      const amount = Math.floor(me.maxHp * HEAL_PCT);
      const before = me.hp;
      me.hp = Math.min(me.maxHp, me.hp + amount);
      const healed = me.hp - before;
      if (healed > 0) {
        events.push({ type: 'heal', playerId: me.id, amount: healed, at: { x: me.x, y: me.y } });
      }
    } else if (kind === 'shield') {
      me.shieldedUntil = now + SHIELD_DURATION_MS;
      events.push({ type: 'shield_on', playerId: me.id, untilMs: me.shieldedUntil, at: { x: me.x, y: me.y } });
    } else if (kind === 'strike') {
      skillStrike(players, me, now, events, rng);
    } else if (kind === 'burst') {
      skillBurst(players, me, now, events, rng);
    } else if (kind === 'dash') {
      skillDash(players, me, now, events, rng);
    } else {
      // 未定義 skillKind → 保底走投射物
      spawnProjectile(ctx, me, true, now, events);
    }
    me.skillCdUntil = now + SKILL_COOLDOWN_MS;
  }

  return {
    ...state,
    players,
    projectiles: ctx.projectiles,
    nextProjectileId: ctx.nextProjectileId,
    events: [...state.events, ...events],
  };
}

export function resolveTick(state, now) {
  const players = clonePlayers(state.players);
  const events = [];
  const survivors = [];

  for (const proj of state.projectiles ?? []) {
    const nx = proj.x + proj.vx;
    const ny = proj.y + proj.vy;
    const traveled = proj.traveled + PROJECTILE_SPEED;

    if (nx < 0 || nx >= ARENA_COLS || ny < 0 || ny >= ARENA_ROWS
        || traveled > PROJECTILE_MAX_DIST) {
      events.push({ type: 'projectile_expire', id: proj.id });
      continue;
    }

    const cx = Math.round(nx), cy = Math.round(ny);
    const hit = Object.values(players).find(
      pl => pl.alive && pl.id !== proj.ownerId && pl.x === cx && pl.y === cy
    );
    if (hit) {
      const shooter = players[proj.ownerId];
      const atkChar = shooter ? getCharacterById(shooter.characterId) : null;
      const defChar = getCharacterById(hit.characterId);
      if (atkChar && defChar) {
        const rawDmg = calculateDamage(atkChar, defChar, proj.isSkill);
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
