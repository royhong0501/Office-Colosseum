import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner,
  buildSnapshotPayload, buildMatchStartPayload,
  MAX_HP, MAX_MP, BULLET_DMG, SHOOT_CD_MS, MP_REGEN_PER_SEC,
  ARENA_COLS, ARENA_ROWS, ROUND_DURATION_MS,
  SKILLS, SKILL_KEYS,
} from '../../../src/games/items/index.js';
import { TICK_MS } from '../../../src/constants.js';

const startedAtMs = 0;
const players2 = [
  { id: 'p1', characterId: 'munchkin' },
  { id: 'p2', characterId: 'husky' },
];

function emptyInput(over = {}) {
  return { seq: 1, moveX: 0, moveY: 0, aimAngle: 0, attack: false, skill: null, ...over };
}

test('createInitialState：玩家全員 HP=100 / MP=50', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  assert.equal(s.phase, 'playing');
  assert.equal(s.roundEndsAtMs, startedAtMs + ROUND_DURATION_MS);
  for (const p of Object.values(s.players)) {
    assert.equal(p.hp, MAX_HP);
    assert.equal(p.mp, MAX_MP / 2);
    assert.equal(p.alive, true);
  }
});

test('applyInput：LMB 射擊扣血 + CD 節流', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  assert.equal(s.bullets.length, 1);
  // CD 內第二擊無效
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 100);
  assert.equal(s.bullets.length, 1);
  // 跑幾個 tick 讓子彈命中
  for (let i = 0; i < 10; i++) resolveTick(s, (i + 1) * TICK_MS);
  assert.equal(b.hp, MAX_HP - BULLET_DMG);
});

test('MP regen：每秒 +MP_REGEN_PER_SEC', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  const before = p.mp;
  // 跑 30 ticks ≈ 1 秒
  for (let i = 0; i < 30; i++) resolveTick(s, (i + 1) * TICK_MS);
  assert.ok(Math.abs(p.mp - (before + MP_REGEN_PER_SEC)) < 0.5, `mp 應約為 ${before + MP_REGEN_PER_SEC}，實際 ${p.mp}`);
});

test('freeze trap：放置 → 敵人踩到 → 定身', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 3.5; a.y = 3.5;
  b.x = 7.5; b.y = 7.5;
  applyInput(s, 'p1', emptyInput({ skill: 'freeze' }), 100);
  assert.equal(s.traps.length, 1);
  assert.equal(s.traps[0].kind, 'freeze');
  // b 走到那格
  b.x = 3.5; b.y = 3.5;
  resolveTick(s, 200);
  assert.equal(s.traps.length, 0, '觸發後 trap 應消失');
  assert.ok(b.frozenUntil > 200);
});

test('freeze：施放者自己踩不觸發', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1;
  a.x = 3.5; a.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'freeze' }), 100);
  resolveTick(s, 200);
  assert.equal(s.traps.length, 1, '自己踩不觸發');
});

test('merge trap：敵人踩到後減速 3 秒', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 3.5; a.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'merge' }), 100);
  b.x = 3.5; b.y = 3.5;
  resolveTick(s, 200);
  assert.ok(b.slowedUntil > 200);
  assert.ok(b.slowedUntil - 200 <= SKILLS.merge.durationMs + 50);
});

test('readonly trap：敵人踩到後 5 秒 silenced，期間 skill 無效', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 3.5; a.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'readonly' }), 100);
  b.x = 3.5; b.y = 3.5;
  resolveTick(s, 200);
  assert.ok(b.silencedUntil > 200);
  // b 在 silenced 期間放 freeze 應該失敗
  applyInput(s, 'p2', emptyInput({ skill: 'freeze' }), 300);
  assert.equal(s.traps.length, 0, 'silenced 期間 skill 應無效');
});

test('validate trap：敵人踩到後被隨機傳送', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 3.5; a.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'validate' }), 100);
  b.x = 3.5; b.y = 3.5;
  // 固定 rng
  const rng = () => 0.25;
  resolveTick(s, 200, rng);
  // 被傳送
  assert.ok(b.x !== 3.5 || b.y !== 3.5);
  const expectedCx = Math.floor(0.25 * ARENA_COLS);
  const expectedCy = Math.floor(0.25 * ARENA_ROWS);
  assert.ok(Math.abs(b.x - (expectedCx + 0.5)) < 1e-9);
  assert.ok(Math.abs(b.y - (expectedCy + 0.5)) < 1e-9);
});

test('undo：恢復 2 秒前 HP + 清 freeze/slow（silence 不在此行為中）', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  // 過 2 秒，期間 HP snapshot 會存到 hpHistory
  for (let i = 1; i <= 30; i++) resolveTick(s, i * TICK_MS);
  // 此時 HP 還是 100（沒受傷），模擬挨打到 40
  p.hp = 40;
  p.frozenUntil = 100000;
  p.slowedUntil = 100000;
  // 注意：silenced 會擋所有 skill，所以 undo 實際上施不出；此處不 set silenced 來測行為。
  applyInput(s, 'p1', emptyInput({ skill: 'undo' }), 3000);
  assert.equal(p.hp, 100, `undo 應回到 2 秒前 HP=100，實際 ${p.hp}`);
  assert.equal(p.frozenUntil, 0);
  assert.equal(p.slowedUntil, 0);
});

test('silenced 狀態連 undo 都擋住', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.silencedUntil = 10000;
  applyInput(s, 'p1', emptyInput({ skill: 'undo' }), 500);
  // silenced 下連 undo 都沒打出 → CD 不該被設、MP 不該被扣
  assert.equal(p.skillCdUntil.undo, 0);
  assert.equal(p.mp, MAX_MP / 2);
});

test('skill MP 不足 → 不觸發', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.mp = 5;   // freeze 要 20
  p.x = 3.5; p.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'freeze' }), 100);
  assert.equal(s.traps.length, 0);
});

test('skill CD 內 → 不觸發', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.x = 3.5; p.y = 3.5;
  applyInput(s, 'p1', emptyInput({ skill: 'freeze' }), 100);
  assert.equal(s.traps.length, 1);
  p.x = 5.5; p.y = 5.5;
  applyInput(s, 'p1', emptyInput({ skill: 'freeze' }), 500);   // CD 沒過
  assert.equal(s.traps.length, 1);
});

test('凍結玩家不能動 / 射 / 施', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.frozenUntil = 10000;
  const beforeX = p.x;
  applyInput(s, 'p1', emptyInput({ moveX: 1, attack: true, aimAngle: 0, skill: 'merge' }), 500);
  resolveTick(s, 600);
  assert.equal(p.x, beforeX, '凍結不能移動');
  assert.equal(s.bullets.length, 0, '凍結不能射擊');
  assert.equal(s.traps.length, 0, '凍結不能施');
});

test('HP≤0 → eliminated + alive=false', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const a = s.players.p1, b = s.players.p2;
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  b.hp = 5;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (!b.alive) break;
  }
  assert.equal(b.alive, false);
});

test('活人 ≤1 → ended + getWinner 回剩下那個', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  s.players.p2.alive = false;
  resolveTick(s, 100);
  assert.equal(s.phase, 'ended');
  assert.equal(getWinner(s), 'p1');
});

test('超過 ROUND_DURATION_MS → ended + 剩餘 HP 高者贏', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  s.players.p1.hp = 40;
  s.players.p2.hp = 80;
  resolveTick(s, ROUND_DURATION_MS + 1);
  assert.equal(s.phase, 'ended');
  assert.equal(getWinner(s), 'p2');
});

test('SKILL_KEYS：5 個', () => {
  assert.deepEqual(SKILL_KEYS.sort(), ['freeze', 'merge', 'readonly', 'undo', 'validate'].sort());
});

test('aliveCount：alive=false 不算', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  assert.equal(aliveCount(s), 2);
  s.players.p1.alive = false;
  assert.equal(aliveCount(s), 1);
});

test('buildSnapshotPayload：含 tick / phase / players / bullets / traps / events', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const events = [{ type: 'damage', amount: 10 }];
  const payload = buildSnapshotPayload(s, events);
  assert.equal(payload.tick, s.tick);
  assert.equal(payload.phase, 'playing');
  assert.equal(payload.startedAtMs, startedAtMs);
  assert.equal(payload.roundEndsAtMs, startedAtMs + ROUND_DURATION_MS);
  assert.ok(payload.players);
  assert.ok(Array.isArray(payload.bullets));
  assert.ok(Array.isArray(payload.traps));
  assert.deepEqual(payload.events, events);
});

test('buildMatchStartPayload：含 gameType / config / state', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const payload = buildMatchStartPayload(s, { foo: 'bar' });
  assert.equal(payload.gameType, 'items');
  assert.deepEqual(payload.config, { foo: 'bar' });
  assert.ok(payload.state);
  assert.equal(payload.state.phase, 'playing');
});

test('silenced 玩家可以移動與射擊（只擋技能）', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.silencedUntil = 10000;
  applyInput(s, 'p1', emptyInput({ moveX: 1, attack: true, aimAngle: 0 }), 500);
  resolveTick(s, 600);
  assert.notEqual(p.x, 1.5, 'silenced 應該還能移動');
  assert.equal(s.bullets.length, 1, 'silenced 應該還能射擊');
});

test('paused 玩家：applyInput 與 resolveTick 都跳過', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  const p = s.players.p1;
  p.paused = true;
  const beforeX = p.x;
  applyInput(s, 'p1', emptyInput({ moveX: 1, attack: true }), 500);
  resolveTick(s, 600);
  assert.equal(p.x, beforeX, 'paused 不能移動');
  assert.equal(s.bullets.length, 0, 'paused 不能射擊');
});
