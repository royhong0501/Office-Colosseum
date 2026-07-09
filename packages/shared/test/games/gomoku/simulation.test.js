import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner,
  buildSnapshotPayload, buildMatchStartPayload,
  sanitizeInput,
  BOARD_SIZE, WIN_LEN, TURN_TIME_MS,
} from '../../../src/games/gomoku/index.js';

const players = [
  { id: 'black', characterId: 'munchkin' },
  { id: 'white', characterId: 'husky' },
];

function place(state, playerId, c, r, now = 1000) {
  return applyInput(state, playerId, { seq: 1, action: 'place', c, r }, now);
}

test('createInitialState：先手黑、後手白，輪到黑', () => {
  const s = createInitialState(players, {}, 0);
  assert.equal(s.phase, 'playing');
  assert.equal(s.players.black.color, 'black');
  assert.equal(s.players.white.color, 'white');
  assert.equal(s.turn, 'black');
  assert.equal(s.turnColor, 'black');
  assert.deepEqual(s.board, {});
  assert.equal(s.moveCount, 0);
});

test('落子後換手，board / lastMove / event 正確', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'black', 7, 7);
  assert.equal(s.board['7,7'], 'black');
  assert.equal(s.turn, 'white');
  assert.equal(s.moveCount, 1);
  assert.deepEqual(s.lastMove, { c: 7, r: 7, color: 'black', playerId: 'black' });
  const ev = s.events.find(e => e.type === 'stone_placed');
  assert.deepEqual(ev, { type: 'stone_placed', playerId: 'black', color: 'black', c: 7, r: 7 });
});

test('非自己回合落子被忽略', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'white', 3, 3);   // 還沒輪到白
  assert.equal(s.board['3,3'], undefined);
  assert.equal(s.turn, 'black');
  assert.equal(s.moveCount, 0);
});

test('已有子的格子不能再落', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'black', 7, 7);
  place(s, 'white', 7, 7);   // 白想下在黑的位置
  assert.equal(s.board['7,7'], 'black');
  assert.equal(s.turn, 'white');   // 白這手無效，仍輪白
  assert.equal(s.moveCount, 1);
});

test('水平五連 → 黑勝、phase ended、winningLine 長度 5、game_won 事件', () => {
  const s = createInitialState(players, {}, 0);
  // 黑下 (0..4, 7)，白下別處墊手
  for (let c = 0; c < 4; c++) {
    place(s, 'black', c, 7);
    place(s, 'white', c, 0);
  }
  place(s, 'black', 4, 7);   // 第五子 → 勝
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'black');
  assert.equal(s.winningLine.length, WIN_LEN);
  assert.ok(s.events.some(e => e.type === 'game_won' && e.playerId === 'black'));
  assert.equal(getWinner(s), 'black');
});

test('垂直五連也算勝', () => {
  const s = createInitialState(players, {}, 0);
  for (let r = 0; r < 4; r++) {
    place(s, 'black', 5, r);
    place(s, 'white', 10, r);
  }
  place(s, 'black', 5, 4);
  assert.equal(s.winner, 'black');
});

test('對角線五連也算勝', () => {
  const s = createInitialState(players, {}, 0);
  for (let k = 0; k < 4; k++) {
    place(s, 'black', k, k);
    place(s, 'white', k, 14);
  }
  place(s, 'black', 4, 4);
  assert.equal(s.winner, 'black');
  assert.equal(s.phase, 'ended');
});

test('反對角線五連也算勝', () => {
  const s = createInitialState(players, {}, 0);
  for (let k = 0; k < 4; k++) {
    place(s, 'black', k, 4 - k);
    place(s, 'white', k, 14);
  }
  place(s, 'black', 4, 0);
  assert.equal(s.winner, 'black');
});

test('只有四子不算勝', () => {
  const s = createInitialState(players, {}, 0);
  for (let c = 0; c < 3; c++) {
    place(s, 'black', c, 7);
    place(s, 'white', c, 0);
  }
  place(s, 'black', 3, 7);   // 黑四連
  assert.equal(s.phase, 'playing');
  assert.equal(s.winner, null);
});

test('遊戲結束後不再接受落子', () => {
  const s = createInitialState(players, {}, 0);
  for (let c = 0; c < 4; c++) {
    place(s, 'black', c, 7);
    place(s, 'white', c, 0);
  }
  place(s, 'black', 4, 7);   // 黑勝
  const movesAfter = s.moveCount;
  place(s, 'white', 8, 8);
  assert.equal(s.moveCount, movesAfter, '結束後不應再落子');
});

test('回合逾時 → 該手玩家判負', () => {
  const s = createInitialState(players, {}, 0);
  // 輪到黑；黑逾時未落子
  resolveTick(s, TURN_TIME_MS + 1);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'white');
  assert.ok(s.events.some(e => e.type === 'turn_timeout' && e.playerId === 'black'));
});

test('落子會刷新回合時限', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'black', 7, 7, 1000);
  assert.equal(s.turnEndsAtMs, 1000 + TURN_TIME_MS);
});

test('sanitizeInput：合法落子通過', () => {
  assert.deepEqual(
    sanitizeInput({ seq: 3, action: 'place', c: 5, r: 9 }),
    { seq: 3, action: 'place', c: 5, r: 9 },
  );
});

test('sanitizeInput：非法一律回 null', () => {
  assert.equal(sanitizeInput(null), null);
  assert.equal(sanitizeInput({ action: 'move', c: 1, r: 1 }), null);       // 非 place
  assert.equal(sanitizeInput({ action: 'place', c: 1.5, r: 1 }), null);    // 非整數
  assert.equal(sanitizeInput({ action: 'place', c: -1, r: 1 }), null);     // 出界
  assert.equal(sanitizeInput({ action: 'place', c: BOARD_SIZE, r: 1 }), null); // 出界
  assert.equal(sanitizeInput({ action: 'place' }), null);                  // 缺座標
});

test('aliveCount：alive=false 不算', () => {
  const s = createInitialState(players, {}, 0);
  assert.equal(aliveCount(s), 2);
  s.players.black.alive = false;
  assert.equal(aliveCount(s), 1);
});

test('buildSnapshotPayload：含 turn / lastMove / winningLine / events，board 靠 events 增量', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'black', 7, 7);
  const events = [{ type: 'stone_placed', playerId: 'black', color: 'black', c: 7, r: 7 }];
  const payload = buildSnapshotPayload(s, events);
  assert.equal(payload.turn, 'white');
  assert.deepEqual(payload.lastMove, { c: 7, r: 7, color: 'black', playerId: 'black' });
  assert.equal(payload.board, undefined);
  assert.deepEqual(payload.events, events);
});

test('buildMatchStartPayload：含 gameType / 完整 state（含 board）', () => {
  const s = createInitialState(players, {}, 0);
  place(s, 'black', 7, 7);
  const payload = buildMatchStartPayload(s, { foo: 'bar' });
  assert.equal(payload.gameType, 'gomoku');
  assert.deepEqual(payload.config, { foo: 'bar' });
  assert.equal(payload.state.board['7,7'], 'black');
});
