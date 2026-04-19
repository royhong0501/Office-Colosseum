import { manhattan, calculateDamage } from './math.js';
import { getCharacterById } from './characters.js';
import { getSpawnPositions } from './spawns.js';
import {
  MOVE_COOLDOWN_MS, SKILL_COOLDOWN_MS, ATTACK_RANGE,
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
  const state = { phase: 'playing', tick: 0, players: {}, events: [] };
  players.forEach((p, i) => {
    const char = getCharacterById(p.characterId);
    state.players[p.id] = {
      id: p.id, characterId: p.characterId,
      x: spawns[i].x, y: spawns[i].y,
      hp: char.stats.hp, maxHp: char.stats.hp,
      alive: true, paused: false,
      skillCdUntil: 0, lastMoveAt: 0, facing: 'right',
    };
  });
  return state;
}

function clonePlayers(players) {
  const out = {};
  for (const id in players) out[id] = { ...players[id] };
  return out;
}

function nearestEnemy(state, playerId) {
  const me = state.players[playerId];
  let best = null, bestD = Infinity;
  for (const other of Object.values(state.players)) {
    if (other.id === playerId || !other.alive) continue;
    const d = manhattan(me, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best ? { target: best, distance: bestD } : null;
}

export function applyInput(state, playerId, input, now) {
  const p = state.players[playerId];
  if (!p || !p.alive || p.paused) return state;

  const players = clonePlayers(state.players);
  const me = players[playerId];
  const events = [];

  if (input.dir && DIRS[input.dir] && now - me.lastMoveAt >= MOVE_COOLDOWN_MS) {
    const { dx, dy } = DIRS[input.dir];
    const nx = me.x + dx, ny = me.y + dy;
    if (nx >= 0 && nx < ARENA_COLS && ny >= 0 && ny < ARENA_ROWS) {
      me.x = nx; me.y = ny; me.lastMoveAt = now;
      if (dx !== 0) me.facing = dx > 0 ? 'right' : 'left';
    }
  }

  const doAttack = input.attack || input.skill;
  if (doAttack) {
    const isSkill = !!input.skill;
    if (isSkill && now < me.skillCdUntil) {
      // cooldown rejects
    } else {
      const near = nearestEnemy({ ...state, players }, playerId);
      if (near && near.distance <= ATTACK_RANGE) {
        const atkChar = getCharacterById(me.characterId);
        const defChar = getCharacterById(near.target.characterId);
        const dmg = calculateDamage(atkChar, defChar, isSkill);
        const tgt = players[near.target.id];
        tgt.hp = Math.max(0, tgt.hp - dmg);
        events.push({ type: 'damage', sourceId: me.id, targetId: tgt.id, amount: dmg, isSkill, at: { x: tgt.x, y: tgt.y } });
        if (isSkill) me.skillCdUntil = now + SKILL_COOLDOWN_MS;
      }
    }
  }

  return { ...state, players, events: [...state.events, ...events] };
}

export function resolveTick(state, now) {
  const players = clonePlayers(state.players);
  const events = [];
  for (const p of Object.values(players)) {
    if (p.alive && p.hp <= 0) {
      p.alive = false;
      events.push({ type: 'eliminated', playerId: p.id });
    }
  }
  const next = { ...state, tick: state.tick + 1, players, events: [...state.events, ...events] };
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
