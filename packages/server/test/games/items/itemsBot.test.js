import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../../../src/games/itemsBot.js';
import {
  createInitialState, SKILLS,
} from '@office-colosseum/shared/src/games/items/index.js';

function baseState() {
  return createInitialState(
    [
      { id: 'bot', characterId: 'munchkin' },
      { id: 'enemy', characterId: 'husky' },
    ],
    {},
    0,
  );
}

test('死人 → idle', () => {
  const s = baseState();
  s.players.bot.alive = false;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, false);
});

test('低 HP + undo 可用 → 施 undo', () => {
  const s = baseState();
  const me = s.players.bot;
  me.hp = 20;
  me.mp = 100;
  me.skillCdUntil.undo = 0;
  const i = decideBotInput(s, 'bot', 500);
  assert.equal(i.skill, 'undo');
});

test('凍結中 + undo 可用 → 施 undo', () => {
  const s = baseState();
  const me = s.players.bot;
  me.frozenUntil = 5000;
  me.mp = 100;
  const i = decideBotInput(s, 'bot', 1000);
  assert.equal(i.skill, 'undo');
});

test('silenced 時 undo 不可用 → idle（凍結 + silenced）', () => {
  const s = baseState();
  const me = s.players.bot;
  me.frozenUntil = 5000;
  me.silencedUntil = 5000;
  me.mp = 100;
  const i = decideBotInput(s, 'bot', 1000);
  assert.equal(i.skill, null);
});

test('視線內敵人 → aim + attack', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 2.5; me.y = 3.5; en.x = 6.5; en.y = 3.5;
  const i = decideBotInput(s, 'bot', 200);
  assert.equal(i.attack, true);
  assert.ok(Math.abs(i.aimAngle - 0) < 0.3);
});

test('中距離 + MP 足 → 放 trap（優先 freeze）', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 2.5; me.y = 3.5; en.x = 7.5; en.y = 3.5;
  me.mp = 100;
  const i = decideBotInput(s, 'bot', 200);
  assert.equal(i.skill, 'freeze');
});

test('同位置不炸（fallback idle）', () => {
  const s = baseState();
  s.players.bot.x = 5; s.players.bot.y = 5;
  s.players.enemy.x = 5; s.players.enemy.y = 5;
  const i = decideBotInput(s, 'bot', 100);
  assert.ok(!isNaN(i.moveX) && !isNaN(i.aimAngle));
});
