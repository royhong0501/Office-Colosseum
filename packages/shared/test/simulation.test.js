import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, moveCooldownFor,
} from '../src/simulation.js';
import {
  MOVE_COOLDOWN_MS, ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  SHIELD_DURATION_MS,
} from '../src/constants.js';
import { ALL_CHARACTERS } from '../src/characters.js';

// 用 baseline SPD=60 的 russian_blue 讓 MOVE_COOLDOWN_MS 測試維持 150ms 的語意；
// 兩隻都是 'strike'，skill 走投射物 fallback，保留原 projectile 測試的預期。
const PLAYERS = [
  { id: 'a', characterId: 'russian_blue' },
  { id: 'b', characterId: 'british_shorthair' },
];

const fixedRng = () => 0.5;

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

test('skill respects cooldown (second skill within cooldown rejected)', () => {
  // russian_blue = strike 瞬發；把 b 放在相鄰格保證第一次 skill 命中
  let s = createInitialState(PLAYERS);
  s.players.a.x = 5; s.players.a.y = 5;
  s.players.b.x = 6; s.players.b.y = 5;
  const bHpStart = s.players.b.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  const hpAfterFirst = s.players.b.hp;
  assert.ok(hpAfterFirst < bHpStart, 'first skill damaged b');
  s = applyInput(s, 'a', { skill: true, seq: 2 }, 1001, fixedRng);
  assert.equal(s.players.b.hp, hpAfterFirst, 'second skill within cooldown rejected (no extra damage)');
});

// ---- SPD-based move cooldown ----

test('moveCooldownFor: high SPD → shorter cooldown, low SPD → longer', () => {
  const cdHigh = moveCooldownFor('sphynx');         // spd=85
  const cdBase = moveCooldownFor('russian_blue');   // spd=60
  const cdLow  = moveCooldownFor('bulldog');        // spd=20
  assert.ok(cdHigh < cdBase, `sphynx(${cdHigh}) should be < baseline(${cdBase})`);
  assert.ok(cdBase < cdLow,  `baseline(${cdBase}) should be < bulldog(${cdLow})`);
  assert.equal(cdBase, 150, 'baseline spd=60 → exactly MOVE_COOLDOWN_MS');
});

// ---- skillKind: heal ----

test('skillKind heal: restores HP up to maxHp and emits heal event', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },       // kind: heal
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.hp = 10;
  const beforeHp = s.players.a.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.ok(s.players.a.hp > beforeHp, 'should heal');
  assert.ok(s.players.a.hp <= s.players.a.maxHp, 'cap at maxHp');
  assert.equal(s.projectiles.length, 0, 'heal should NOT spawn a projectile');
  const healEvent = s.events.find(e => e.type === 'heal' && e.playerId === 'a');
  assert.ok(healEvent, 'heal event emitted');
  assert.ok(healEvent.amount > 0);
});

// ---- skillKind: shield ----

test('skillKind shield: sets shieldedUntil and halves incoming projectile damage', () => {
  // a 開護盾，b 發投射物；比對跟「無護盾」對照組的傷害差異
  const buildWorld = () => {
    const s = createInitialState([
      { id: 'a', characterId: 'scottish_fold' },   // kind: shield, spd=30
      { id: 'b', characterId: 'russian_blue' },    // baseline SPD
    ]);
    s.players.a.x = 5; s.players.a.y = 5;
    s.players.b.x = 7; s.players.b.y = 5;
    s.players.b.facing = 'left';
    return s;
  };

  // --- 無護盾對照組 ---
  let control = buildWorld();
  const aHpBefore1 = control.players.a.hp;
  control = applyInput(control, 'b', { attack: true, seq: 1 }, 1000, fixedRng);
  let now = 1000;
  for (let i = 0; i < 20 && control.projectiles.length > 0; i++) {
    now += 33;
    control = resolveTick(control, now).state;
  }
  const unshieldedDmg = aHpBefore1 - control.players.a.hp;
  assert.ok(unshieldedDmg > 0, 'control: b should have hit a');

  // --- 有護盾組 ---
  let s = buildWorld();
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.equal(s.players.a.shieldedUntil, 1000 + SHIELD_DURATION_MS);
  assert.equal(s.projectiles.length, 0, 'shield should NOT spawn a projectile');
  assert.ok(s.events.some(e => e.type === 'shield_on' && e.playerId === 'a'));

  const aHpBefore2 = s.players.a.hp;
  s = applyInput(s, 'b', { attack: true, seq: 2 }, 1000, fixedRng);
  now = 1000;
  for (let i = 0; i < 20 && s.projectiles.length > 0; i++) {
    now += 33;
    s = resolveTick(s, now).state;
  }
  const shieldedDmg = aHpBefore2 - s.players.a.hp;
  assert.ok(shieldedDmg > 0, 'shield halves damage, not blocks it');
  assert.ok(shieldedDmg < unshieldedDmg, `shielded(${shieldedDmg}) should be < unshielded(${unshieldedDmg})`);
});

// ---- skillKind: strike ----

test('skillKind strike: hits nearest enemy within ATTACK_RANGE only', () => {
  // russian_blue = strike；b, c 都在 ATTACK_RANGE 內但 strike 只打最近的
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },
    { id: 'b', characterId: 'british_shorthair' },
    { id: 'c', characterId: 'siamese' },
  ]);
  s.players.a.x = 5; s.players.a.y = 5;
  s.players.b.x = 6; s.players.b.y = 5;  // distance 1
  s.players.c.x = 7; s.players.c.y = 5;  // distance 2
  const bBefore = s.players.b.hp;
  const cBefore = s.players.c.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.ok(s.players.b.hp < bBefore, 'nearest (b) took damage');
  assert.equal(s.players.c.hp, cBefore, 'non-nearest (c) unhurt');
  assert.equal(s.projectiles.length, 0, 'strike does not spawn projectile');
  const damageEvents = s.events.filter(e => e.type === 'damage' && e.sourceId === 'a');
  assert.equal(damageEvents.length, 1);
  assert.equal(damageEvents[0].targetId, 'b');
  assert.equal(damageEvents[0].isSkill, true);
});

test('skillKind strike: out of ATTACK_RANGE does nothing', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 5; s.players.b.y = 0;  // distance 5 > ATTACK_RANGE=2
  const bBefore = s.players.b.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.equal(s.players.b.hp, bBefore, 'no damage when out of range');
  assert.ok(!s.events.some(e => e.type === 'damage'));
});

// ---- skillKind: burst ----

test('skillKind burst: AOE hits all enemies within ATTACK_RANGE', () => {
  // persian = burst
  let s = createInitialState([
    { id: 'a', characterId: 'persian' },
    { id: 'b', characterId: 'british_shorthair' },
    { id: 'c', characterId: 'russian_blue' },
    { id: 'd', characterId: 'siamese' },
  ]);
  s.players.a.x = 5; s.players.a.y = 5;
  s.players.b.x = 6; s.players.b.y = 5;  // dist 1 ✓
  s.players.c.x = 5; s.players.c.y = 7;  // dist 2 ✓
  s.players.d.x = 10; s.players.d.y = 5; // dist 5 ✗
  const bBefore = s.players.b.hp;
  const cBefore = s.players.c.hp;
  const dBefore = s.players.d.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.ok(s.players.b.hp < bBefore);
  assert.ok(s.players.c.hp < cBefore);
  assert.equal(s.players.d.hp, dBefore, 'out-of-range d unhurt');
  const damageEvents = s.events.filter(e => e.type === 'damage' && e.sourceId === 'a');
  assert.equal(damageEvents.length, 2);
});

// ---- skillKind: dash ----

test('skillKind dash: moves DASH_DISTANCE toward enemy and emits dash_move', () => {
  // munchkin = dash
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 2; s.players.a.y = 5;
  s.players.b.x = 10; s.players.b.y = 5;  // dx=8, dy=0 → dash right
  const startX = s.players.a.x;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.equal(s.players.a.x, startX + 3, 'dashed 3 cells right');
  assert.equal(s.players.a.y, 5, 'y unchanged');
  const dashEvent = s.events.find(e => e.type === 'dash_move' && e.playerId === 'a');
  assert.ok(dashEvent);
  assert.equal(dashEvent.from.x, startX);
  assert.equal(dashEvent.to.x, startX + 3);
});

test('skillKind dash: stops when blocked by enemy and damages adjacent', () => {
  // munchkin = dash；b 緊鄰 → dash 第一步就被擋，留在原地但 b 受傷
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 5; s.players.a.y = 5;
  s.players.b.x = 6; s.players.b.y = 5;  // dx=1, dy=0 → dash right → 第一步 nx=6 blocked
  const bBefore = s.players.b.hp;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000, fixedRng);
  assert.equal(s.players.a.x, 5, 'dash blocked, a stays at 5');
  assert.ok(s.players.b.hp < bBefore, 'b (adjacent) takes dash contact damage');
  // blocked 零移動所以不該發 dash_move
  assert.ok(!s.events.some(e => e.type === 'dash_move'), 'zero-move dash emits no dash_move event');
});
