import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner
} from '../src/simulation.js';
import {
  MOVE_COOLDOWN_MS, ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
} from '../src/constants.js';
import { ALL_CHARACTERS } from '../src/characters.js';

const PLAYERS = [
  { id: 'a', characterId: ALL_CHARACTERS[0].id },
  { id: 'b', characterId: ALL_CHARACTERS[1].id },
];

test('createInitialState: 2 players at spawns, full HP, alive, empty projectiles', () => {
  const s = createInitialState(PLAYERS);
  assert.equal(Object.keys(s.players).length, 2);
  assert.equal(s.phase, 'playing');
  assert.deepEqual(s.projectiles, []);
  assert.equal(s.nextProjectileId, 1);
  for (const p of Object.values(s.players)) {
    assert.ok(p.alive);
    assert.equal(p.hp, p.maxHp);
    assert.equal(p.lastAttackAt, 0);
  }
});

test('applyInput: movement respects cooldown', () => {
  let s = createInitialState(PLAYERS);
  const before = { ...s.players.a };
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 1 }, 1000);
  assert.equal(s.players.a.x, before.x + 1);
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 2 }, 1000 + MOVE_COOLDOWN_MS - 10);
  assert.equal(s.players.a.x, before.x + 1);
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 3 }, 1000 + MOVE_COOLDOWN_MS + 1);
  assert.equal(s.players.a.x, before.x + 2);
});

test('applyInput: facing updates from any dir even if movement blocked', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  // press left at left edge — no movement but facing should still update
  s = applyInput(s, 'a', { dir: 'left', seq: 1 }, 1000);
  assert.equal(s.players.a.facing, 'left');
  assert.equal(s.players.a.x, 0);
  // press up at top edge
  s = applyInput(s, 'a', { dir: 'up', seq: 2 }, 1000 + MOVE_COOLDOWN_MS + 1);
  assert.equal(s.players.a.facing, 'up');
});

test('attack: no damage on the same tick (projectile has not traveled yet)', () => {
  let s = createInitialState(PLAYERS);
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.equal(s.players.b.hp, bHpBefore);
});

test('attack: spawns a projectile in facing direction', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.facing = 'right';
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.equal(s.projectiles.length, 1);
  const proj = s.projectiles[0];
  assert.equal(proj.ownerId, 'a');
  assert.equal(proj.isSkill, false);
  assert.ok(proj.vx > 0, 'vx should be positive when facing right');
  assert.equal(proj.vy, 0);
  assert.ok(s.events.some(e => e.type === 'projectile_spawn'));
});

test('attack: respects ATTACK_COOLDOWN_MS', () => {
  let s = createInitialState(PLAYERS);
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.equal(s.projectiles.length, 1);
  s = applyInput(s, 'a', { attack: true, seq: 2 }, 1000 + ATTACK_COOLDOWN_MS - 10);
  assert.equal(s.projectiles.length, 1, 'second attack during cooldown rejected');
  s = applyInput(s, 'a', { attack: true, seq: 3 }, 1000 + ATTACK_COOLDOWN_MS + 1);
  assert.equal(s.projectiles.length, 2, 'attack after cooldown spawns another projectile');
});

test('projectile travels and hits aligned target', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 3; s.players.a.y = 5; s.players.a.facing = 'right';
  s.players.b.x = 7; s.players.b.y = 5;
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  // advance enough ticks so projectile from x=3.5 reaches x=7 (7-3.5)/0.4 = 8.75 → 9 ticks
  let now = 1000;
  for (let i = 0; i < 20; i++) {
    now += 33;
    const res = resolveTick(s, now);
    s = res.state;
    if (!s.players.b.alive || s.projectiles.length === 0) break;
  }
  assert.ok(s.players.b.hp < bHpBefore, 'target took damage');
  assert.equal(s.projectiles.length, 0, 'projectile consumed on hit');
});

test('projectile misses when target moves aside before arrival', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 3; s.players.a.y = 5; s.players.a.facing = 'right';
  s.players.b.x = 8; s.players.b.y = 5;
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  // move target two rows away before projectile arrives
  s.players.b.y = 7;
  let now = 1000;
  for (let i = 0; i < 20; i++) {
    now += 33;
    const res = resolveTick(s, now);
    s = res.state;
    if (s.projectiles.length === 0) break;
  }
  assert.equal(s.players.b.hp, bHpBefore, 'target dodged — no damage');
});

test('projectile expires after PROJECTILE_MAX_DIST', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 5; s.players.a.facing = 'right';
  s.players.b.x = 15; s.players.b.y = 9;  // out of the path
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.equal(s.projectiles.length, 1);
  // enough ticks to exceed PROJECTILE_MAX_DIST / PROJECTILE_SPEED
  const ticksNeeded = Math.ceil(PROJECTILE_MAX_DIST / PROJECTILE_SPEED) + 5;
  let now = 1000;
  let allEvents = [];
  for (let i = 0; i < ticksNeeded; i++) {
    now += 33;
    const res = resolveTick(s, now);
    s = res.state;
    allEvents.push(...res.events);
    if (s.projectiles.length === 0) break;
  }
  assert.equal(s.projectiles.length, 0, 'projectile removed');
  assert.ok(allEvents.some(e => e.type === 'projectile_expire'), 'expire event emitted');
});

test('HP=0 → alive=false; aliveCount drops; getWinner returns last', () => {
  let s = createInitialState(PLAYERS);
  s.players.b.hp = 0;
  const { state } = resolveTick(s, 1000);
  assert.equal(state.players.b.alive, false);
  assert.equal(aliveCount(state), 1);
  assert.equal(getWinner(state), 'a');
});

test('skill respects cooldown (only first spawns projectile)', () => {
  let s = createInitialState(PLAYERS);
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000);
  assert.equal(s.projectiles.length, 1);
  assert.equal(s.projectiles[0].isSkill, true);
  s = applyInput(s, 'a', { skill: true, seq: 2 }, 1001);
  assert.equal(s.projectiles.length, 1, 'second skill within cooldown rejected');
});
