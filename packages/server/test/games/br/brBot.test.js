import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../../../src/games/brBot.js';
import {
  createInitialState, MAPS, expandCovers, ARENA_COLS, ARENA_ROWS, BULLET_MAX_DIST,
} from '@office-colosseum/shared/src/games/br/index.js';

const config0 = { mapId: MAPS[0].id };

function baseState() {
  return createInitialState(
    [
      { id: 'bot', characterId: 'munchkin' },
      { id: 'enemy', characterId: 'husky' },
    ],
    config0,
    0,
  );
}

test('死人 → idle input', () => {
  const s = baseState();
  s.players.bot.alive = false;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, false);
  assert.equal(i.moveX, 0);
  assert.equal(i.moveY, 0);
});

test('沒敵人 → idle', () => {
  const s = baseState();
  s.players.enemy.alive = false;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, false);
});

test('視線內敵人在射程內 → attack=true + aim 指向敵人', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 2.5; me.y = 1.5;
  en.x = 5.5; en.y = 1.5;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, true);
  assert.ok(Math.abs(i.aimAngle - 0) < 0.2, `aim 應指向 +X（0 rad）實際 ${i.aimAngle}`);
});

test('敵人距離超過 BULLET_MAX_DIST → 靠近但不射擊', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 1.5; me.y = 1.5;
  en.x = 18.5; en.y = 1.5; // 距離 17 > 14
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, false);
  assert.ok(i.moveX > 0, `過遠應向 +X 前進，實際 moveX=${i.moveX}`);
});

test('敵人被 cover 擋住 → 不射擊', () => {
  const s = baseState();
  // 把一整條 cover 放在 me 和 en 之間
  s.map.coversSet = expandCovers([[5, 4, 1, 1]]);
  const me = s.players.bot, en = s.players.enemy;
  me.x = 3.5; me.y = 4.5;
  en.x = 7.5; en.y = 4.5;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.attack, false, '視線擋住不開火');
});

test('腳下踩到毒圈 → 朝場地中心逃跑', () => {
  const s = baseState();
  const me = s.players.bot;
  me.x = 0.5; me.y = 0.5;
  s.poison.infected.add('0,0');
  const i = decideBotInput(s, 'bot', 100);
  // 中心 (10, 4.5)，從 (0.5, 0.5) 出發 → moveX > 0, moveY > 0
  assert.ok(i.moveX > 0);
  assert.ok(i.moveY > 0);
  assert.equal(i.attack, false, '毒圈裡不浪費射擊');
});

test('低 HP 傾向舉盾（多次取樣）', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.hp = 30;
  me.x = 2.5; me.y = 1.5;
  en.x = 5.5; en.y = 1.5;
  let shieldCount = 0;
  for (let i = 0; i < 50; i++) {
    if (decideBotInput(s, 'bot', 100).shield) shieldCount++;
  }
  // 期望 ~60% = 30 次左右；允許 15~45
  assert.ok(shieldCount >= 15 && shieldCount <= 45, `shield 觸發 ${shieldCount}/50 不在合理區間`);
});

test('同位置不炸（fallback idle）', () => {
  const s = baseState();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 5; me.y = 5;
  en.x = 5; en.y = 5;
  const i = decideBotInput(s, 'bot', 100);
  assert.ok(typeof i.moveX === 'number' && !isNaN(i.moveX));
  assert.ok(typeof i.aimAngle === 'number');
});

test('state.players 不存在的 botId → idle 不 crash', () => {
  const s = baseState();
  const i = decideBotInput(s, 'not-exist-id', 100);
  assert.equal(i.attack, false);
  assert.equal(i.moveX, 0);
});

/* ---- Cover steering（avoid 撞牆卡住） ---- */

test('cover steering：路徑暢通時直接朝目標（不轉向）', () => {
  const s = baseState();
  // 清掉所有 cover，確保路徑暢通
  s.map.coversSet = new Set();
  const me = s.players.bot, en = s.players.enemy;
  me.x = 3; me.y = 4.5;
  en.x = 18; en.y = 4.5;   // 距離 15 > BULLET_MAX_DIST - 1 → 走追擊分支
  const i = decideBotInput(s, 'bot', 100);
  // 應該幾乎正右（baseline 0°）
  assert.ok(i.moveX > 0.95, `路徑暢通時 moveX 應接近 1，實際 ${i.moveX.toFixed(3)}`);
  assert.ok(Math.abs(i.moveY) < 0.1, `moveY 應接近 0，實際 ${i.moveY.toFixed(3)}`);
});

test('cover steering：直線被 cover 擋 → 轉向繞行', () => {
  const s = baseState();
  // bot 與敵人間放一片 cover 牆
  s.map.coversSet = expandCovers([[6, 4, 1, 3]]);  // cell (6, 4..6)
  const me = s.players.bot, en = s.players.enemy;
  me.x = 4; me.y = 5;
  en.x = 10; en.y = 5;
  const i = decideBotInput(s, 'bot', 100);
  // 應該不再是純正右方（moveX ≈ 1, moveY ≈ 0）；moveY 會明顯偏移（繞行）
  const isStraightRight = i.moveX > 0.9 && Math.abs(i.moveY) < 0.15;
  assert.ok(!isStraightRight, `被擋應繞行，實際 move=(${i.moveX.toFixed(3)}, ${i.moveY.toFixed(3)})`);
});

test('cover steering：四面被 cover 圍死 + dash CD 到 → 觸發 dash', () => {
  const s = baseState();
  // 把 bot 周圍 1 格範圍內所有 cell 填成 cover（除了 bot 自己腳下）
  // bot 會站在 (5.5, 5.5)，corversSet 含 cell (4..6, 4..6) 除了 (5,5)
  const covers = [];
  for (let c = 4; c <= 6; c++) {
    for (let r = 4; r <= 6; r++) {
      if (c === 5 && r === 5) continue;
      covers.push([c, r, 1, 1]);
    }
  }
  s.map.coversSet = expandCovers(covers);
  const me = s.players.bot, en = s.players.enemy;
  me.x = 5.5; me.y = 5.5;
  en.x = 15; en.y = 5;
  me.dashCdUntil = 0;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.dash, true, '四面被封 + CD 到應觸發 dash');
});

