import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, moveStepFor,
} from '../src/simulation.js';
import {
  ATTACK_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  SHIELD_DURATION_BASE_MS, SHIELD_SPC_MULT_MS,
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS,
  MOVE_STEP, DASH_DISTANCE,
  STRIKE_RECOIL_DIST,
  BURST_BUFF_DURATION_MS, BURST_BUFF_MULT,
  HEAL_PASSIVE_CD_MS,
} from '../src/constants.js';
import { getCharacterById } from '../src/characters.js';

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

test('skill: 遵守 SKILL_COOLDOWN_MS（冷卻內第二次 skill 不再發飛彈）', () => {
  // russian_blue = strike，右鍵射出飛彈；冷卻中第二次不產生新投射物
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 5; s.players.b.y = 0;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  assert.equal(s.projectiles.length, 1, '第一次 skill 發一顆飛彈');
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true, seq: 2 }), 1001, fixedRng);
  assert.equal(s.projectiles.length, 1, '冷卻中第二次 skill 無新投射物');
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

// ---- skillKind: heal（已改成被動觸發，右鍵 no-op） ----

test('skillKind heal: 右鍵完全無效（不回血、不吃 CD、不發 skill_cast）', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },       // kind: heal
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.hp = 10;
  const cdBefore = s.players.a.skillCdUntil;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.equal(s.players.a.hp, 10, '右鍵不回血');
  assert.equal(s.players.a.skillCdUntil, cdBefore, '右鍵不吃主動 CD');
  assert.ok(!s.events.some(e => e.type === 'skill_cast' && e.playerId === 'a'),
    '右鍵不發 skill_cast');
  assert.ok(!s.events.some(e => e.type === 'heal' && e.playerId === 'a'),
    '右鍵不發 heal event');
});

test('heal 被動: HP ≤ 30% 時 resolveTick 自動回血 + 設 passive CD', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },
    { id: 'b', characterId: 'russian_blue' },
  ]);
  const maxHp = s.players.a.maxHp;
  s.players.a.hp = Math.floor(maxHp * 0.3);     // 剛好 30%
  const hpBefore = s.players.a.hp;
  const { state } = resolveTick(s, 5000);
  assert.ok(state.players.a.hp > hpBefore, '被動回血');
  assert.ok(state.players.a.hp <= state.players.a.maxHp);
  assert.equal(state.players.a.healPassiveCdUntil, 5000 + HEAL_PASSIVE_CD_MS);
  assert.ok(state.events.some(e => e.type === 'heal' && e.playerId === 'a'));
  assert.ok(state.events.some(e => e.type === 'skill_cast' && e.kind === 'heal' && e.playerId === 'a'));
});

test('heal 被動: HP > 30% 不觸發', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },
    { id: 'b', characterId: 'russian_blue' },
  ]);
  const maxHp = s.players.a.maxHp;
  s.players.a.hp = Math.ceil(maxHp * 0.31);
  const hpBefore = s.players.a.hp;
  const { state } = resolveTick(s, 5000);
  assert.equal(state.players.a.hp, hpBefore, 'HP > 30% 不觸發被動');
  assert.equal(state.players.a.healPassiveCdUntil, 0);
});

test('heal 被動: 觸發後 HEAL_PASSIVE_CD_MS 內不重複觸發', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'ragdoll' },
    { id: 'b', characterId: 'russian_blue' },
  ]);
  const maxHp = s.players.a.maxHp;
  s.players.a.hp = Math.floor(maxHp * 0.2);
  let r = resolveTick(s, 5000);
  s = r.state;
  const afterFirstHp = s.players.a.hp;
  // 把血壓回 20% 模擬再次受重傷
  s.players.a.hp = Math.floor(maxHp * 0.2);
  r = resolveTick(s, 5000 + HEAL_PASSIVE_CD_MS - 100);
  assert.equal(r.state.players.a.hp, Math.floor(maxHp * 0.2), 'CD 內不重觸發');
  r = resolveTick(r.state, 5000 + HEAL_PASSIVE_CD_MS + 1);
  assert.ok(r.state.players.a.hp > Math.floor(maxHp * 0.2), 'CD 過後重新觸發');
});

test('heal 被動: 非 heal-kind 角色不會被動觸發', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },    // strike
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.hp = 1;
  const { state } = resolveTick(s, 5000);
  assert.equal(state.players.a.hp, 1, 'strike 角色不會自動回血');
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
  const sfSpc = getCharacterById('scottish_fold').stats.spc;
  assert.equal(s.players.a.shieldedUntil, 1000 + SHIELD_DURATION_BASE_MS + sfSpc * SHIELD_SPC_MULT_MS);
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

// ---- skillKind: strike（改成射出青綠色飛彈 + 後座力）----

test('skillKind strike: 沿 facing 射出 isSkill 飛彈（variant=strike）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.facing = 0;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  assert.equal(s.projectiles.length, 1);
  const proj = s.projectiles[0];
  assert.equal(proj.ownerId, 'a');
  assert.equal(proj.isSkill, true);
  assert.equal(proj.variant, 'strike');
  assert.ok(Math.abs(proj.vx - PROJECTILE_SPEED) < APPROX);
  assert.ok(Math.abs(proj.vy) < APPROX);
  const spawnEv = s.events.find(e => e.type === 'projectile_spawn');
  assert.equal(spawnEv?.variant, 'strike');
});

test('skillKind strike: 後座力把施法者沿 -facing 推 STRIKE_RECOIL_DIST', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.facing = 0;  // 朝右；應該被後推到 -STRIKE_RECOIL_DIST
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  assert.ok(Math.abs(s.players.a.x - (-STRIKE_RECOIL_DIST)) < APPROX,
    `x=${s.players.a.x} 應 ≈ ${-STRIKE_RECOIL_DIST}`);
  assert.ok(Math.abs(s.players.a.y) < APPROX);
  const recoilEv = s.events.find(e => e.type === 'strike_recoil' && e.playerId === 'a');
  assert.ok(recoilEv);
  assert.ok(Math.abs(recoilEv.from.x) < APPROX);
  assert.ok(Math.abs(recoilEv.to.x - (-STRIKE_RECOIL_DIST)) < APPROX);
});

test('skillKind strike: 後座力碰牆會 clamp', () => {
  let s = createInitialState(PLAYERS);
  // 面向右 + 貼左牆 → 後退方向是左，會 clamp
  s.players.a.x = -(ARENA_WIDTH / 2 - PLAYER_RADIUS) + 0.3;
  s.players.a.y = 0;
  s.players.a.facing = 0;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  const minX = -(ARENA_WIDTH / 2 - PLAYER_RADIUS);
  assert.ok(s.players.a.x >= minX - APPROX, `x=${s.players.a.x} 應 ≥ ${minX}`);
});

test('skillKind strike: 飛彈命中敵人造成傷害（走 resolveTick 路徑）', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = -3; s.players.a.y = 0;
  s.players.a.facing = 0;
  s.players.b.x = 3;  s.players.b.y = 0;
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  // 注意：strike 讓 a 後退到 (-5, 0)；飛彈從 a 原位置前方（(-2.5, 0) 附近）開始飛
  let now = 1000;
  for (let i = 0; i < 40 && s.projectiles.length > 0; i++) {
    now += 33;
    s = resolveTick(s, now, fixedRng).state;
  }
  assert.ok(s.players.b.hp < bHpBefore, '飛彈命中 b');
  const dmgEv = s.events.find(e => e.type === 'damage' && e.sourceId === 'a' && e.targetId === 'b');
  assert.ok(dmgEv);
  assert.equal(dmgEv.isSkill, true);
});

// ---- skillKind: burst（改成 3 秒 buff：移動 + 攻擊速度 × BURST_BUFF_MULT） ----

test('skillKind burst: 設定 speedBuffUntil 並發出 burst_buff_on event', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'husky' },          // burst
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.equal(s.players.a.speedBuffUntil, 1000 + BURST_BUFF_DURATION_MS);
  assert.equal(s.projectiles.length, 0, 'burst 不發射投射物');
  const ev = s.events.find(e => e.type === 'burst_buff_on' && e.playerId === 'a');
  assert.ok(ev);
  assert.equal(ev.untilMs, 1000 + BURST_BUFF_DURATION_MS);
});

test('skillKind burst: buff 期間不造成傷害', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'husky' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.b.x = 1; s.players.b.y = 0;      // 原本 ATTACK_RANGE 內
  const bBefore = s.players.b.hp;
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  assert.equal(s.players.b.hp, bBefore, 'burst 不再造成 AOE 傷害');
  assert.ok(!s.events.some(e => e.type === 'damage' && e.sourceId === 'a'));
});

test('burst buff: 期間移動每 tick 位移 × BURST_BUFF_MULT', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },    // baseline spd=60，MOVE_STEP 用標準值
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.speedBuffUntil = 2000;            // 強制設 buff
  s = applyInput(s, 'a', input({ moveX: 1 }), 1000);
  assert.ok(Math.abs(s.players.a.x - MOVE_STEP * BURST_BUFF_MULT) < APPROX,
    `buff 下一步 ${s.players.a.x} 應 ≈ ${MOVE_STEP * BURST_BUFF_MULT}`);
});

test('burst buff: 期間 attack cooldown 縮短為 ATTACK_COOLDOWN_MS / BURST_BUFF_MULT', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.speedBuffUntil = 5000;
  s = applyInput(s, 'a', input({ attack: true }), 1000);
  assert.equal(s.projectiles.length, 1);
  const shortCd = ATTACK_COOLDOWN_MS / BURST_BUFF_MULT;
  // 縮短後還沒到的時間點：正常 CD 會 block，buff 下應可以發射
  s = applyInput(s, 'a', input({ attack: true, seq: 2 }), 1000 + shortCd + 1);
  assert.equal(s.projectiles.length, 2, 'buff 縮短後的 CD 允許更早發射');
});

test('burst buff: 過期後移動恢復正常', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'russian_blue' },
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.speedBuffUntil = 1000;            // buff 於 t=1000 結束
  s = applyInput(s, 'a', input({ moveX: 1 }), 2000);  // t=2000 已過期
  assert.ok(Math.abs(s.players.a.x - MOVE_STEP) < APPROX, 'buff 過期，步伐回到 MOVE_STEP');
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

// ---- skill_cast event（統一施法訊號，供 client VFX 用） ----

test('skill_cast: strike 放技能時發出 skill_cast 且帶 kind/playerId/at/facing', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = 2; s.players.a.y = -1;
  s.players.a.facing = Math.PI / 4;
  s = applyInput(s, 'a', input({ aimAngle: Math.PI / 4, skill: true }), 1000, fixedRng);
  const ev = s.events.find(e => e.type === 'skill_cast' && e.playerId === 'a');
  assert.ok(ev, 'skill_cast event emitted');
  assert.equal(ev.kind, 'strike');
  assert.equal(ev.at.x, 2);
  assert.equal(ev.at.y, -1);
  assert.equal(ev.facing, Math.PI / 4);
});

test('skill_cast: burst 發出 kind=burst', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'husky' },          // burst
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  const ev = s.events.find(e => e.type === 'skill_cast');
  assert.ok(ev);
  assert.equal(ev.kind, 'burst');
});

test('skill_cast: dash 發出 kind=dash（at 用施法前位置，非位移後）', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'munchkin' },       // dash
    { id: 'b', characterId: 'british_shorthair' },
  ]);
  s.players.a.x = 0; s.players.a.y = 0;
  s.players.a.facing = 0;
  s = applyInput(s, 'a', input({ aimAngle: 0, skill: true }), 1000, fixedRng);
  const ev = s.events.find(e => e.type === 'skill_cast');
  assert.ok(ev);
  assert.equal(ev.kind, 'dash');
  assert.equal(ev.at.x, 0, 'at 紀錄 dash 前的起點');
  assert.equal(ev.at.y, 0);
});

test('skill_cast: shield 發出 kind=shield', () => {
  let s = createInitialState([
    { id: 'a', characterId: 'scottish_fold' },  // shield
    { id: 'b', characterId: 'russian_blue' },
  ]);
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  const ev = s.events.find(e => e.type === 'skill_cast');
  assert.ok(ev);
  assert.equal(ev.kind, 'shield');
});

// heal 的 skill_cast（kind='heal'）已改從被動路徑發出，見上方「heal 被動」測試。

test('skill_cast: 冷卻中不重發 skill_cast', () => {
  let s = createInitialState(PLAYERS);
  s = applyInput(s, 'a', input({ skill: true }), 1000, fixedRng);
  const firstCount = s.events.filter(e => e.type === 'skill_cast').length;
  assert.equal(firstCount, 1);
  s = applyInput(s, 'a', input({ skill: true, seq: 2 }), 1001, fixedRng);
  const secondCount = s.events.filter(e => e.type === 'skill_cast').length;
  assert.equal(secondCount, 1, '冷卻中第二次按 skill 不產生新 skill_cast');
});

// ---- resolveTick RNG 傳遞（修正 projectile 命中決定性） ----

test('resolveTick: 固定 rng 讓 projectile 命中傷害可重現', () => {
  const buildHit = (rng) => {
    let s = createInitialState(PLAYERS);
    s.players.a.x = -3; s.players.a.y = 0;
    s.players.b.x = 3;  s.players.b.y = 0;
    s = applyInput(s, 'a', input({ aimAngle: 0, attack: true }), 1000, fixedRng);
    let now = 1000;
    for (let i = 0; i < 30; i++) {
      now += 33;
      s = resolveTick(s, now, rng).state;
      if (s.projectiles.length === 0) break;
    }
    return s.players.b.maxHp - s.players.b.hp;
  };
  const dmg1 = buildHit(() => 0.5);
  const dmg2 = buildHit(() => 0.5);
  assert.equal(dmg1, dmg2, '同 rng seed 應得到相同 projectile 命中傷害');
  const dmg3 = buildHit(() => 0.0);
  const dmg4 = buildHit(() => 0.99);
  assert.notEqual(dmg3, dmg4, '不同 rng 應產生不同 variance 結果');
});

// ---- skillKind: dash (boundary) ----

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
