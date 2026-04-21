import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../src/bot.js';
import { createInitialState, ALL_CHARACTERS } from '@office-colosseum/shared';

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
