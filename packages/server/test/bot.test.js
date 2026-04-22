import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../src/bot.js';
import { createInitialState, ALL_CHARACTERS, PROJECTILE_MAX_DIST } from '@office-colosseum/shared';

function makeStateWithTwo(aPos, bPos) {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'enemy', characterId: ALL_CHARACTERS[1].id },
  ]);
  s.players['bot-1'].x = aPos.x; s.players['bot-1'].y = aPos.y;
  s.players['enemy'].x = bPos.x; s.players['enemy'].y = bPos.y;
  return s;
}

const IDLE = { seq: 0, moveX: 0, moveY: 0, aimAngle: 0, attack: false, skill: false };

test('decideBotInput: 自己死了回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['bot-1'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, IDLE);
});

test('decideBotInput: me 不存在回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'nonexistent', 1000);
  assert.deepEqual(input, IDLE);
});

test('decideBotInput: 沒有敵人活著回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['enemy'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, IDLE);
});

test('decideBotInput: 射程內（dist ≤ PROJECTILE_MAX_DIST）→ 原地瞄準、attack + skill', () => {
  // bot (0,0)、敵人 (3,0)，距離 3 ≤ 12
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 3, y: 0 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.moveX, 0);
  assert.equal(input.moveY, 0);
  assert.ok(Math.abs(input.aimAngle - 0) < 1e-9, 'aim 朝右');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 射程內、敵人在上方 → aimAngle ≈ -π/2、開火', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 0, y: -4 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.ok(Math.abs(input.aimAngle - (-Math.PI / 2)) < 1e-9);
  assert.equal(input.attack, true);
});

test('decideBotInput: 射程內、敵人在左下 → aimAngle = atan2(dy, dx)', () => {
  // bot (0,0)、敵人 (-3, 3)，dy>0 dx<0 → 3π/4
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: -3, y: 3 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.ok(Math.abs(input.aimAngle - (3 * Math.PI / 4)) < 1e-9);
  assert.equal(input.attack, true);
});

test('decideBotInput: 射程邊界（dist = PROJECTILE_MAX_DIST）→ 開火', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: PROJECTILE_MAX_DIST, y: 0 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.moveX, 0);
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 射程外（dist > PROJECTILE_MAX_DIST）→ 朝敵人單位向量移動、不開火', () => {
  // 距離 20 > 12
  const s = makeStateWithTwo({ x: -10, y: 0 }, { x: 10, y: 0 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.ok(input.moveX > 0);
  assert.equal(input.moveY, 0);
  assert.ok(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-9, 'move 是單位向量');
  assert.ok(Math.abs(input.aimAngle - 0) < 1e-9);
  assert.equal(input.attack, false);
  assert.equal(input.skill, false);
});

test('decideBotInput: 射程外、敵人在右下 → moveX/Y 方向正確', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 9, y: 12 });  // dist = 15
  assert.ok(Math.hypot(9, 12) > PROJECTILE_MAX_DIST);
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.ok(input.moveX > 0);
  assert.ok(input.moveY > 0);
  assert.ok(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-9);
});

test('decideBotInput: 敵人已死 → 切到下一個活的', () => {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'dead', characterId: ALL_CHARACTERS[1].id },
    { id: 'alive', characterId: ALL_CHARACTERS[2].id },
  ]);
  s.players['bot-1'].x = 0; s.players['bot-1'].y = 0;
  s.players['dead'].x = 1; s.players['dead'].y = 0; s.players['dead'].alive = false;
  s.players['alive'].x = 0; s.players['alive'].y = 5;
  const input = decideBotInput(s, 'bot-1', 1000);
  // alive 在下方（y=5）→ aimAngle = π/2
  assert.ok(Math.abs(input.aimAngle - Math.PI / 2) < 1e-9);
  assert.equal(input.attack, true);
});

test('decideBotInput: 同點（dist=0）→ 保留 facing + attack + skill（盲射）', () => {
  const s = makeStateWithTwo({ x: 2, y: 2 }, { x: 2, y: 2 });
  s.players['bot-1'].facing = Math.PI;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.moveX, 0);
  assert.equal(input.moveY, 0);
  assert.equal(input.aimAngle, Math.PI);
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: tie-break 選字典序較小的 id', () => {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'bbb', characterId: ALL_CHARACTERS[1].id },
    { id: 'aaa', characterId: ALL_CHARACTERS[2].id },
  ]);
  s.players['bot-1'].x = 0; s.players['bot-1'].y = 0;
  s.players['bbb'].x = 3; s.players['bbb'].y = 0;   // 距離 3
  s.players['aaa'].x = 3; s.players['aaa'].y = 0;   // 距離 3，tie
  const input = decideBotInput(s, 'bot-1', 1000);
  // 兩個 tie，選 aaa（字典序較小）→ 敵人在 (3,0)，aimAngle=0
  assert.ok(Math.abs(input.aimAngle - 0) < 1e-9);
  assert.equal(input.attack, true);
});
