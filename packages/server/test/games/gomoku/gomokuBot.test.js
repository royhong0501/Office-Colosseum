import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../../../src/games/gomokuBot.js';
import { createInitialState, applyInput } from '@office-colosseum/shared/src/games/gomoku/index.js';

// bot 為黑（先手），enemy 為白
function baseState() {
  return createInitialState([
    { id: 'bot', characterId: 'munchkin' },
    { id: 'enemy', characterId: 'husky' },
  ], {}, 0);
}

test('非自己回合 → noop（applyInput 會忽略）', () => {
  const s = baseState();
  s.turn = 'enemy';
  const i = decideBotInput(s, 'bot', 100);
  assert.notEqual(i.action, 'place');
});

test('不存在的 botId → noop 不 crash', () => {
  const s = baseState();
  const i = decideBotInput(s, 'ghost', 100);
  assert.notEqual(i.action, 'place');
});

test('空盤先手 → 下中心 (7,7)', () => {
  const s = baseState();
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.action, 'place');
  assert.equal(i.c, 7);
  assert.equal(i.r, 7);
});

test('永遠回傳界內空格', () => {
  const s = baseState();
  // 隨手擺幾顆子
  s.board = { '7,7': 'black', '7,8': 'white', '8,7': 'black' };
  s.moveCount = 3;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.action, 'place');
  assert.ok(i.c >= 0 && i.c < 15 && i.r >= 0 && i.r < 15);
  assert.equal(s.board[`${i.c},${i.r}`], undefined, '不能下在已有子的格');
});

test('自己已有四連 → 補成五連取勝', () => {
  const s = baseState();
  // bot(黑) 已有 (3..6, 7)，(7,7) 可成五
  s.board = { '3,7': 'black', '4,7': 'black', '5,7': 'black', '6,7': 'black', '2,0': 'white' };
  s.moveCount = 5;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.action, 'place');
  // 應下在 (2,7) 或 (7,7) 完成五連
  assert.ok((i.c === 7 && i.r === 7) || (i.c === 2 && i.r === 7),
    `應補成五連，實際 (${i.c},${i.r})`);
  // 驗證真的贏
  applyInput(s, 'bot', i, 100);
  assert.equal(s.winner, 'bot');
});

test('對手有活四 → 擋掉', () => {
  const s = baseState();
  // enemy(白) 有 (3..6, 7)，若不擋下一手就輸；(2,7) 與 (7,7) 皆可擋
  s.board = { '3,7': 'white', '4,7': 'white', '5,7': 'white', '6,7': 'white', '8,8': 'black' };
  s.moveCount = 5;
  const i = decideBotInput(s, 'bot', 100);
  assert.equal(i.action, 'place');
  assert.ok((i.c === 7 && i.r === 7) || (i.c === 2 && i.r === 7),
    `應擋住對手四連，實際 (${i.c},${i.r})`);
});

test('自己贏優先於擋對手（同時存在自身五連與對手四連）', () => {
  const s = baseState();
  s.board = {
    '3,7': 'black', '4,7': 'black', '5,7': 'black', '6,7': 'black',   // 黑四，(7,7)成五
    '3,1': 'white', '4,1': 'white', '5,1': 'white', '6,1': 'white',   // 白四，(7,1)成五
  };
  s.moveCount = 8;
  const i = decideBotInput(s, 'bot', 100);
  applyInput(s, 'bot', i, 100);
  assert.equal(s.winner, 'bot', '應選擇自己取勝而非擋對手');
});
