import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, moveStepFor,
} from '../src/simulation.js';
import {
  ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  SHIELD_DURATION_MS,
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS,
  MOVE_STEP, DASH_DISTANCE,
} from '../src/constants.js';

// russian_blue: spd=60 baseline → moveStep=MOVE_STEP；skillKind='strike'
// british_shorthair: spd=30，HP 大，當沙包；skillKind='strike'
const PLAYERS = [
  { id: 'a', characterId: 'russian_blue' },
  { id: 'b', characterId: 'british_shorthair' },
];

const fixedRng = () => 0.5;
const APPROX = 1e-9;

function input({ moveX = 0, moveY = 0, aimAngle = 0, attack = false, skill = false, seq = 1 } = {}) {
  return { seq, moveX, moveY, aimAngle, attack, skill };
}

test('createInitialState: 2 players at spawns (橢圓分佈), full HP, alive, empty projectiles', () => {
  const s = createInitialState(PLAYERS);
  assert.equal(Object.keys(s.players).length, 2);
  assert.equal(s.phase, 'playing');
  assert.deepEqual(s.projectiles, []);
  assert.equal(s.nextProjectileId, 1);
  for (const p of Object.values(s.players)) {
    assert.ok(p.alive);
    assert.equal(p.hp, p.maxHp);
    assert.equal(p.lastAttackAt, 0);
    assert.equal(typeof p.facing, 'number');
  }
  // spawn 點應在內縮 0.4× 邊界的橢圓上
  const rx = ARENA_WIDTH * 0.4;
  const ry = ARENA_HEIGHT * 0.4;
  for (const p of Object.values(s.players)) {
    const norm = (p.x / rx) ** 2 + (p.y / ry) ** 2;
    assert.ok(Math.abs(norm - 1) < 1e-9, `spawn (${p.x},${p.y}) 應落在 rx=${rx},ry=${ry} 的橢圓上`);
  }
});

test('applyInput: 連續移動每 tick 位移 MOVE_STEP（baseline spd=60）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  // 朝右移動
  s = applyInput(s, 'a', input({ moveX: 1 }), 1000);
  assert.ok(Math.abs(s.players.a.x - MOVE_STEP) < APPROX, `x=${s.players.a.x} should ≈ ${MOVE_STEP}`);
  s = applyInput(s, 'a', input({ moveX: 1, seq: 2 }), 1033);
  assert.ok(Math.abs(s.players.a.x - MOVE_STEP * 2) < APPROX);
});

test('applyInput: 對角移動單位向量 normalize（不會比單軸更快）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s = applyInput(s, 'a', input({ moveX: 1, moveY: 1 }), 1000);
  const r = Math.hypot(s.players.a.x, s.players.a.y);
  assert.ok(Math.abs(r - MOVE_STEP) < APPROX, `diagonal step length ${r} 應該 ≈ ${MOVE_STEP}`);
});

test('applyInput: facing 直接跟隨 aimAngle（弧度）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s = applyInput(s, 'a', input({ aimAngle: Math.PI / 2 }), 1000);
  assert.equal(s.players.a.facing, Math.PI / 2);
  s = applyInput(s, 'a', input({ aimAngle: -Math.PI, seq: 2 }), 1033);
  assert.equal(s.players.a.facing, -Math.PI);
});

test('applyInput: 越界移動被軸向 clamp（不會穿牆）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = ARENA_WIDTH / 2 - 0.6; s.players.a.y = 0;
  // 連續朝右推進直到撞牆
  for (let i = 0; i < 20; i++) {
    s = applyInput(s, 'a', input({ moveX: 1, seq: i + 1 }), 1000 + i * 33);
  }
  const maxX = ARENA_WIDTH / 2 - PLAYER_RADIUS;
  assert.ok(s.players.a.x <= maxX + APPROX, `貼右牆 x=${s.players.a.x} 應 ≤ ${maxX}`);
  assert.ok(Math.abs(s.players.a.y) < APPROX, 'y 不該偏移');
});

test('attack: 同 tick 不造成傷害（投射物才剛 spawn）', () => {
  let s = createInitialState(PLAYERS);
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ attack: true }), 1000);
  assert.equal(s.players.b.hp, bHpBefore);
});

test('attack: 投射物沿 facing 方向生成（速度 = cos/sin(angle) × PROJECTILE_SPEED）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  // 朝右 aimAngle=0
  s = applyInput(s, 'a', input({ aimAngle: 0, attack: true }), 1000);
  assert.equal(s.projectiles.length, 1);
  const proj = s.projectiles[0];
  assert.equal(proj.ownerId, 'a');
  assert.equal(proj.isSkill, false);
  assert.ok(Math.abs(proj.vx - PROJECTILE_SPEED) < APPROX, 'vx should equal PROJECTILE_SPEED');
  assert.ok(Math.abs(proj.vy) < APPROX, 'vy should ≈ 0');
  // 初始位置在玩家右邊緣（PLAYER_RADIUS + 0.1 = 0.6）
  assert.ok(Math.abs(proj.x - 0.6) < APPROX);
  assert.ok(Math.abs(proj.y) < APPROX);
  assert.ok(s.events.some(e => e.type === 'projectile_spawn'));
});

test('attack: 遵守 ATTACK_COOLDOWN_MS', () => {
  let s = createInitialState(PLAYERS);
  s = applyInput(s, 'a', input({ attack: true }), 1000);
  assert.equal(s.projectiles.length, 1);
  s = applyInput(s, 'a', input({ attack: true, seq: 2 }), 1000 + ATTACK_COOLDOWN_MS - 10);
  assert.equal(s.projectiles.length, 1, '冷卻中第二次 attack 被拒');
  s = applyInput(s, 'a', input({ attack: true, seq: 3 }), 1000 + ATTACK_COOLDOWN_MS + 1);
  assert.equal(s.projectiles.length, 2, '冷卻後重新可發射');
});

test('projectile: 直線瞄準命中敵人（圓對圓碰撞）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = -3; s.players.a.y = 0;
  s.players.b.x = 3;  s.players.b.y = 0;
  const bHpBefore = s.players.b.hp;
  // 朝右瞄準
  s = applyInput(s, 'a', input({ aimAngle: 0, attack: true }), 1000);
  let now = 1000;
  for (let i = 0; i < 30; i++) {
    now += 33;
    const res = resolveTick(s, now);
    s = res.state;
    if (!s.players.b.alive || s.projectiles.length === 0) break;
  }
  assert.ok(s.players.b.hp < bHpBefore, '目標受傷');
  assert.equal(s.projectiles.length, 0, '投射物命中後消失');
});

test('projectile: 目標中途移開不被命中', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = -3; s.players.a.y = 0;
  s.players.b.x = 3;  s.players.b.y = 0;
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ aimAngle: 0, attack: true }), 1000);
  // 把 b 橫向移開 2 單位（> hit radius）
  s.players.b = { ...s.players.b, y: 2 };
  let now = 1000;
  for (let i = 0; i < 30 && s.projectiles.length > 0; i++) {
    now += 33;
    s = resolveTick(s, now).state;
  }
  assert.equal(s.players.b.hp, bHpBefore, '閃開了 — 無傷');
});

test('projectile: 超過 PROJECTILE_MAX_DIST 自然消失', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = -7; s.players.a.y = 0;
  s.players.b.x = 0;  s.players.b.y = 5;  // 不在射線路徑上
  s = applyInput(s, 'a', input({ aimAngle: 0, attack: true }), 1000);
  assert.equal(s.projectiles.length, 1);
  const ticksNeeded = Math.ceil(PROJECTILE_MAX_DIST / PROJECTILE_SPEED) + 5;
  let now = 1000;
  const allEvents = [];
  for (let i = 0; i < ticksNeeded; i++) {
    now += 33;
    const res = resolveTick(s, now);
    s = res.state;
    allEvents.push(...res.events);
    if (s.projectiles.length === 0) break;
  }
  assert.equal(s.projectiles.length, 0, '投射物已移除');
  assert.ok(allEvents.some(e => e.type === 'projectile_expire'), '發出 expire event');
});

test('HP=0 → alive=false; aliveCount 下降；getWinner 回傳最後一人', () => {
  let s = createInitialState(PLAYERS);
  s.players.b.hp = 0;
  const { state } = resolveTick(s, 1000);
  assert.equal(state.players.b.alive, false);
  assert.equal(aliveCount(state), 1);
  assert.equal(getWinner(state), 'a');
});

test('skill: 遵守 SKILL_COOLDOWN_MS（冷卻內第二次 skill 不造成額外傷害）', () => {
  // russian_blue = strike，把 b 放在近戰範圍內保證第一次命中
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 1; s.players.b.y = 0;
  const bHpStart = s.players.b.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  const hpAfterFirst = s.players.b.hp;
  assert.ok(hpAfterFirst < bHpStart, '第一次 skill 造成傷害');
  s = applyInput(s, 'a', input({ skill: true, seq: 2 }), 1001, fixedRng);
  assert.equal(s.players.b.hp, hpAfterFirst, '冷卻中第二次 skill 無額外傷害');
});

// ---- SPD-based move step ----

test('moveStepFor: 高 SPD → 大步；低 SPD → 小步；baseline spd=60 → MOVE_STEP', () => {
  const sHigh = moveStepFor('sphynx');        // spd=85
  const sBase = moveStepFor('russian_blue');  // spd=60
  const sLow  = moveStepFor('bulldog');       // spd=20
  assert.ok(sHigh > sBase, `sphynx(${sHigh}) should be > baseline(${sBase})`);
  assert.ok(sBase > sLow,  `baseline(${sBase}) should be > bulldog(${sLow})`);
  assert.ok(Math.abs(sBase - MOVE_STEP) < APPROX, 'baseline spd=60 → exactly MOVE_STEP');
});

// ---- skillKind: heal ----

test('skillKind heal: 回復 HP 不超過 maxHp 並發出 heal event', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },       // kind: heal
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.hp = 10;
  const beforeHp = s.players.a.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.ok(s.players.a.hp > beforeHp, 'HP 上升');
  assert.ok(s.players.a.hp <= s.players.a.maxHp, '不超過 maxHp');
  assert.equal(s.projectiles.length, 0, 'heal 不生成投射物');
  const healEvent = s.events.find(e => e.type === 'heal' && e.playerId === 'a');
  assert.ok(healEvent, 'heal event emitted');
  assert.ok(healEvent.amount > 0);
});

// ---- skillKind: shield ----

test('skillKind shield: 設定 shieldedUntil 並讓被投射物命中的傷害減半', () => {
  const buildWorld = () => {
    const s = createInitialState([
      { id: 'a', characterId: 'scottish_fold' }, // kind: shield
      { id: 'b', characterId: 'russian_blue' },
    ]);
    s.players.a.x = 0; s.players.a.y = 0;
    s.players.b.x = 4; s.players.b.y = 0;
    s.players.b.facing = Math.PI;                // 朝左瞄準 a
    return s;
  };

  // 無護盾對照組
  let control = buildWorld();
  const aHpBefore1 = control.players.a.hp;
  control = applyInput(control, 'b', input({ aimAngle: Math.PI, attack: true }), 1000, fixedRng);
  let now = 1000;
  for (let i = 0; i < 40 && control.projectiles.length > 0; i++) {
    now += 33;
    control = resolveTick(control, now).state;
  }
  const unshieldedDmg = aHpBefore1 - control.players.a.hp;
  assert.ok(unshieldedDmg > 0, '對照：b 應命中 a');

  // 有護盾組
  let s = buildWorld();
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.equal(s.players.a.shieldedUntil, 1000 + SHIELD_DURATION_MS);
  assert.equal(s.projectiles.length, 0, 'shield 不生成投射物');
  assert.ok(s.events.some(e => e.type === 'shield_on' && e.playerId === 'a'));

  const aHpBefore2 = s.players.a.hp;
  s = applyInput(s, 'b', input({ aimAngle: Math.PI, attack: true, seq: 2 }), 1000, fixedRng);
  now = 1000;
  for (let i = 0; i < 40 && s.projectiles.length > 0; i++) {
    now += 33;
    s = resolveTick(s, now).state;
  }
  const shieldedDmg = aHpBefore2 - s.players.a.hp;
  assert.ok(shieldedDmg > 0, 'shield 是減傷不是完全擋下');
  assert.ok(shieldedDmg < unshieldedDmg, `shielded(${shieldedDmg}) < unshielded(${unshieldedDmg})`);
});

// ---- skillKind: strike ----

test('skillKind strike: 命中 ATTACK_RANGE 內最近敵人（歐氏距離）', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },      // strike
    { id: 'b', characterId: 'british_shorthair' },
    { id: 'c', characterId: 'siamese' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 1; s.players.b.y = 0;   // dist 1
  s.players.c.x = 2; s.players.c.y = 0;   // dist 2
  const bBefore = s.players.b.hp;
  const cBefore = s.players.c.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.ok(s.players.b.hp < bBefore, '最近者 b 受傷');
  assert.equal(s.players.c.hp, cBefore, '非最近者 c 不受傷');
  assert.equal(s.projectiles.length, 0, 'strike 不生成投射物');
  const damageEvents = s.events.filter(e => e.type === 'damage' && e.sourceId === 'a');
  assert.equal(damageEvents.length, 1);
  assert.equal(damageEvents[0].targetId, 'b');
  assert.equal(damageEvents[0].isSkill, true);
});

test('skillKind strike: 超出 ATTACK_RANGE 不造成傷害', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 5; s.players.b.y = 0;   // dist 5 > 2
  const bBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.equal(s.players.b.hp, bBefore);
  assert.ok(!s.events.some(e => e.type === 'damage'));
});

// ---- skillKind: burst ----

test('skillKind burst: AOE 命中所有 ATTACK_RANGE 內的敵人', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'persian' },        // burst
    { id: 'b', characterId: 'british_shorthair' },
    { id: 'c', characterId: 'russian_blue' },
    { id: 'd', characterId: 'siamese' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 1; s.players.b.y = 0;       // 1 ✓
  s.players.c.x = 0; s.players.c.y = 1.8;     // 1.8 ✓
  s.players.d.x = 5; s.players.d.y = 0;       // 5 ✗
  const bBefore = s.players.b.hp;
  const cBefore = s.players.c.hp;
  const dBefore = s.players.d.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.ok(s.players.b.hp < bBefore);
  assert.ok(s.players.c.hp < cBefore);
  assert.equal(s.players.d.hp, dBefore, '超距者 d 不受傷');
  const damageEvents = s.events.filter(e => e.type === 'damage' && e.sourceId === 'a');
  assert.equal(damageEvents.length, 2);
});

// ---- skillKind: dash ----

test('skillKind dash: 沿 facing 方向瞬間位移 DASH_DISTANCE 並發出 dash_move', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },        // dash
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.facing = 0;                      // 朝右
  s.players.b.x = 5; s.players.b.y = 0;
  const startX = s.players.a.x;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  assert.ok(Math.abs(s.players.a.x - (startX + DASH_DISTANCE)) < APPROX, `dashed ${DASH_DISTANCE}`);
  assert.ok(Math.abs(s.players.a.y) < APPROX);
  const dashEvent = s.events.find(e => e.type === 'dash_move' && e.playerId === 'a');
  assert.ok(dashEvent);
  assert.ok(Math.abs(dashEvent.from.x - startX) < APPROX);
  assert.ok(Math.abs(dashEvent.to.x - (startX + DASH_DISTANCE)) < APPROX);
});

test('skillKind dash: 落點相鄰敵人吃接觸傷害', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  // b 正好落在 dash 終點附近
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.facing = 0;
  s.players.b.x = DASH_DISTANCE + 0.3; s.players.b.y = 0;
  const bBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  assert.ok(s.players.b.hp < bBefore, 'b 在 dash 落點相鄰受傷');
});

test('skillKind dash: 遇到矩形邊界會軸向 clamp', () => {
  // munchkin 才是 dash kind
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = ARENA_WIDTH / 2 - 1; s.players.a.y = 0;
  s.players.a.facing = 0;
  s.players.b.x = -5; s.players.b.y = 0;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  const maxX = ARENA_WIDTH / 2 - PLAYER_RADIUS;
  assert.ok(s.players.a.x <= maxX + APPROX, `落點 x=${s.players.a.x} 應 ≤ ${maxX}`);
  assert.ok(Math.abs(s.players.a.y) < APPROX);
});
