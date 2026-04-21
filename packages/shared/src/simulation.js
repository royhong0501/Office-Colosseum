import { calculateDamage } from './math.js';
import { getCharacterById } from './characters.js';
import { getSpawnPositions } from './spawns.js';
import {
  MOVE_COOLDOWN_MS, SKILL_COOLDOWN_MS, ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  ARENA_COLS, ARENA_ROWS,
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
    };
  });
  return state;
}

function clonePlayers(players) {
  const out = {};
  for (const id in players) out[id] = { ...players[id] };
  return out;
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

export function applyInput(state, playerId, input, now) {
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
    if (now - me.lastMoveAt >= MOVE_COOLDOWN_MS) {
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
    spawnProjectile(ctx, me, true, now, events);
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
        const dmg = calculateDamage(atkChar, defChar, proj.isSkill);
        hit.hp = Math.max(0, hit.hp - dmg);
        events.push({
          type: 'damage',
          sourceId: proj.ownerId, targetId: hit.id,
          amount: dmg, isSkill: proj.isSkill,
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
