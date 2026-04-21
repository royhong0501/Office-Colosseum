import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../src/bot.js';
import { createInitialState, ALL_CHARACTERS, PROJECTILE_MAX_DIST } from '@office-colosseum/shared';

function makeStateWithTwo(aPos, bPos) {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'enemy', characterId: ALL_CHARACTERS[1].id },
  ]);
  s.players['bot-1'].x = aPos.x;  s.players['bot-1'].y = aPos.y;
  s.players['enemy'].x = bPos.x;  s.players['enemy'].y = bPos.y;
  return s;
}

test('decideBotInput: 自己死了回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['bot-1'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});

test('decideBotInput: me 不存在回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'nonexistent', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});

test('decideBotInput: 沒有敵人活著回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['enemy'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});

test('decideBotInput: 未對齊時走較小那一軸（dx<dy → 走橫軸）', () => {
  // bot 在 (5,5)，敵人在 (7,9) → dx=2, dy=4 → 走橫軸 right
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 7, y: 9 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, false);
  assert.equal(input.skill, false);
});

test('decideBotInput: 未對齊時走較小那一軸（dy<dx → 走縱軸）', () => {
  // bot 在 (0,3)，敵人在 (10,5) → dx=10, dy=2 → 走縱軸 down
  const s = makeStateWithTwo({ x: 0, y: 3 }, { x: 10, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'down');
});

test('decideBotInput: |dx|===|dy| tie-break 走橫軸', () => {
  // bot 在 (0,0)，敵人在 (5,5) → dx=5, dy=5 → tie → 走 right
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
});

test('decideBotInput: 敵人在左上（dx<0, dy<0）→ 縮較小軸、方向正確', () => {
  // bot 在 (10,9)，敵人在 (8,3) → dx=-2, dy=-6 → 走橫軸 left
  const s = makeStateWithTwo({ x: 10, y: 9 }, { x: 8, y: 3 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'left');
});

test('decideBotInput: 敵人已死 → 切到下個活的', () => {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'dead', characterId: ALL_CHARACTERS[1].id },
    { id: 'alive', characterId: ALL_CHARACTERS[2].id },
  ]);
  s.players['bot-1'].x = 0; s.players['bot-1'].y = 0;
  s.players['dead'].x = 1; s.players['dead'].y = 0; s.players['dead'].alive = false;
  s.players['alive'].x = 6; s.players['alive'].y = 4;
  // nearest alive 是 'alive' 在 (6,4) → dx=6, dy=4 → 走縱軸 down
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'down');
});

test('decideBotInput: 對齊同 row 近距離（dy=0, dx=3）→ right + attack + skill', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 8, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 對齊同 col 近距離（dx=0, dy=-4）→ up + attack + skill', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 5, y: 1 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'up');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 對齊遠距離（dx=0, dy > PROJECTILE_MAX_DIST）→ 只面向不開火', () => {
  // bot (0,0)、敵人 (15,0)，15 > 12 → 超出射程
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 15, y: 0 });
  assert.ok(15 > PROJECTILE_MAX_DIST, 'sanity: 15 必須大於 MAX_DIST');
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, false);
  assert.equal(input.skill, false);
});

test('decideBotInput: 對齊邊界距離（dx=0, dy = PROJECTILE_MAX_DIST）→ 開火', () => {
  // bot (0,0)、敵人 (12,0)，12 = 12 → 正好邊界應該開火
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 12, y: 0 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 同格（dx=0, dy=0）→ dir null + attack + skill（盲射當前 facing）', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, null);
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});
