import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../../../src/games/territoryBot.js';
import { createInitialState } from '@office-colosseum/shared/src/games/territory/index.js';

function baseState() {
  return createInitialState([
    { id: 'bot', characterId: 'munchkin' },
    { id: 'enemy', characterId: 'husky' },
  ], {}, 0);
}

test('死人 → idle', () => {
  const s = baseState();
  s.players.bot.alive = false;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.moveX, 0);
  assert.equal(i.moveY, 0);
});

test('活著 → 朝未佔領格子方向移動', () => {
  const s = baseState();
  const me = s.players.bot;
  me.x = 1.5; me.y = 1.5;
  const i = decideBotInput(s, 'bot', 100);
  assert.ok(Math.abs(Math.hypot(i.moveX, i.moveY) - 1) < 0.05, '應返回單位向量');
});

test('不存在的 botId → idle 不 crash', () => {
  const s = baseState();
  const i = decideBotInput(s, 'ghost', 100);
  assert.equal(i.moveX, 0);
});

test('其他玩家腳下 cell 加大罰分：bot 不會鎖定同格', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 5.5; me.y = 5.5;
  // 敵人站在 (6,5)——這是 bot 最自然的下一步
  en.x = 6.5; en.y = 5.5;
  const i = decideBotInput(s, 'bot', 100);
  // bot 不該選擇朝敵人正右方（+X 接近 1）前進；應繞開
  const aimIsStraightRight = i.moveX > 0.95 && Math.abs(i.moveY) < 0.2;
  assert.ok(!aimIsStraightRight, `bot 不該直接鎖定敵人所在格，實際 move=(${i.moveX.toFixed(2)}, ${i.moveY.toFixed(2)})`);
});

test('直線路徑被擋 → 移動向量偏移 45°', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 5; me.y = 5;
  en.x = 6; en.y = 5;   // 擋在 bot 右側
  // 人為改小自己隊佔領，讓 target 明顯在 +X 方向但路徑擋住
  // 在這個初始 state，敵人擋住 +X 路線 → bot 會 steering 偏移
  const i = decideBotInput(s, 'bot', 100);
  // 不該是正右方向
  assert.ok(Math.abs(i.moveY) > 0.3 || i.moveX < 0.8,
    `被擋時應偏移，實際 move=(${i.moveX.toFixed(2)}, ${i.moveY.toFixed(2)})`);
});
