import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, finalizeStats,
  sanitizeInput, buildMatchStartPayload, buildSnapshotPayload,
  getDifficulty, DIFFICULTIES,
} from '../../../src/games/minesweeper/index.js';

const players = [{ id: 'p1', characterId: 'munchkin' }];

function reveal(s, c, r, now = 1000, rng = () => 0) {
  return applyInput(s, 'p1', { seq: 1, action: 'reveal', c, r }, now, rng);
}
function flag(s, c, r, now = 1000) {
  return applyInput(s, 'p1', { seq: 1, action: 'flag', c, r }, now);
}

test('createInitialState：套用難度、初始未佈雷', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  const d = DIFFICULTIES.easy;
  assert.equal(s.phase, 'playing');
  assert.equal(s.cols, d.cols);
  assert.equal(s.rows, d.rows);
  assert.equal(s.mineCount, d.mines);
  assert.equal(s.minesPlaced, false);
  assert.equal(s.safeTotal, d.cols * d.rows - d.mines);
  assert.equal(s.playerId, 'p1');
});

test('未知難度 → fallback normal', () => {
  const s = createInitialState(players, { difficulty: 'nope' }, 0);
  assert.equal(s.config.difficulty, 'normal');
});

test('首次翻開才佈雷，且首點與八鄰不會是雷', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  reveal(s, 4, 4);
  assert.equal(s.minesPlaced, true);
  assert.equal(s.mines.size, DIFFICULTIES.easy.mines);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      assert.ok(!s.mines.has(`${4 + dc},${4 + dr}`), `(${4 + dc},${4 + dr}) 不該是雷`);
    }
  }
});

test('首點必翻開至少一格，且發出 reveal 事件', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  reveal(s, 4, 4);
  assert.ok(s.revealed.has('4,4'));
  assert.ok(s.revealedCount >= 1);
  const ev = s.events.find(e => e.type === 'reveal');
  assert.ok(ev && Array.isArray(ev.cells));
  // cells 為 [c,r,adj]
  const self = ev.cells.find(([c, r]) => c === 4 && r === 4);
  assert.ok(self, 'reveal 事件應含首點');
});

test('插旗 / 取消旗：flagsUsed 與事件正確', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  flag(s, 0, 0);
  assert.ok(s.flagged.has('0,0'));
  assert.equal(s.flagsUsed, 1);
  assert.equal(s.events.at(-1).type, 'flag');
  assert.equal(s.events.at(-1).flagged, true);
  flag(s, 0, 0);
  assert.ok(!s.flagged.has('0,0'));
  assert.equal(s.flagsUsed, 0);
  assert.equal(s.events.at(-1).flagged, false);
});

test('有旗的格不能被 reveal', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  flag(s, 2, 2);
  reveal(s, 2, 2);
  assert.ok(!s.revealed.has('2,2'), '有旗保護不該翻開');
  assert.equal(s.minesPlaced, false, '被擋下時不應佈雷');
});

// 手動佈雷的小盤（跳過首點安全佈雷），雷放已知位置方便踩
function minedBoard() {
  const s = createInitialState(players, {}, 0);
  s.cols = 5; s.rows = 5; s.mineCount = 3; s.safeTotal = 22;
  s.mines = new Set(['0,0', '4,0', '0,4']);
  s.minesPlaced = true;
  return s;
}

test('踩到雷 → lost、phase ended、reveal_mines + game_over 事件', () => {
  const s = minedBoard();
  reveal(s, 0, 0, 2000);   // 直接踩雷
  assert.equal(s.result, 'lost');
  assert.equal(s.phase, 'ended');
  assert.equal(s.endedAtMs, 2000);
  assert.ok(s.events.some(e => e.type === 'explode' && e.c === 0 && e.r === 0));
  const rm = s.events.find(e => e.type === 'reveal_mines');
  assert.ok(rm && rm.cells.length === 3);
  assert.ok(s.events.some(e => e.type === 'game_over' && e.result === 'lost'));
});

test('結束後不再接受輸入', () => {
  const s = minedBoard();
  reveal(s, 0, 0, 2000);   // lost
  const before = s.revealedCount;
  reveal(s, 2, 2, 3000);
  assert.equal(s.revealedCount, before, '結束後不該再翻');
});

test('翻開所有非雷格 → won', () => {
  // 用最小盤自定：3×3、1 雷，手動佈雷在固定位置以便清盤
  const s = createInitialState(players, {}, 0);
  s.cols = 3; s.rows = 3; s.mineCount = 1; s.safeTotal = 8;
  // 手動佈雷（跳過首點佈雷邏輯）
  s.mines = new Set(['0,0']);
  s.minesPlaced = true;
  // 逐一翻開 8 個非雷格
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      if (c === 0 && r === 0) continue;
      applyInput(s, 'p1', { seq: 1, action: 'reveal', c, r }, 5000);
    }
  }
  assert.equal(s.result, 'won');
  assert.equal(s.phase, 'ended');
  assert.ok(s.events.some(e => e.type === 'game_over' && e.result === 'won'));
  assert.equal(getWinner(s), 'p1');
});

test('flood fill：全空盤（雷在角落）首點會連開一大片', () => {
  const s = createInitialState(players, {}, 0);
  s.cols = 5; s.rows = 5; s.mineCount = 1; s.safeTotal = 24;
  s.mines = new Set(['0,0']);
  s.minesPlaced = true;
  applyInput(s, 'p1', { seq: 1, action: 'reveal', c: 4, r: 4 }, 5000);
  // (4,4) 遠離唯一的雷，flood 應翻開絕大多數格
  assert.ok(s.revealedCount >= 20, `flood 應連開一大片，實際 ${s.revealedCount}`);
});

test('getWinner：lost → null', () => {
  const s = minedBoard();
  reveal(s, 0, 0, 2000);
  assert.equal(getWinner(s), null);
});

test('finalizeStats：回傳 timeMs / cellsRevealed / won', () => {
  const s = createInitialState(players, {}, 100);
  s.cols = 3; s.rows = 3; s.mineCount = 1; s.safeTotal = 8;
  s.mines = new Set(['0,0']); s.minesPlaced = true;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    if (c === 0 && r === 0) continue;
    applyInput(s, 'p1', { seq: 1, action: 'reveal', c, r }, 5100);
  }
  const fin = finalizeStats(s);
  assert.equal(fin.p1.won, 1);
  assert.equal(fin.p1.cellsRevealed, 8);
  assert.equal(fin.p1.timeMs, 5000);
});

test('aliveCount 恆為存活玩家數（單人=1）', () => {
  const s = createInitialState(players, {}, 0);
  assert.equal(aliveCount(s), 1);
});

test('resolveTick 只推 tick、不改 phase', () => {
  const s = createInitialState(players, {}, 0);
  resolveTick(s, 999);
  assert.equal(s.tick, 1);
  assert.equal(s.phase, 'playing');
});

test('sanitizeInput：合法 reveal/flag 通過、非法回 null', () => {
  assert.deepEqual(sanitizeInput({ seq: 2, action: 'reveal', c: 3, r: 4 }), { seq: 2, action: 'reveal', c: 3, r: 4 });
  assert.deepEqual(sanitizeInput({ action: 'flag', c: 0, r: 0 }), { seq: 0, action: 'flag', c: 0, r: 0 });
  assert.equal(sanitizeInput({ action: 'place', c: 1, r: 1 }), null);
  assert.equal(sanitizeInput({ action: 'reveal', c: 1.5, r: 1 }), null);
  assert.equal(sanitizeInput(null), null);
});

test('buildMatchStartPayload：不洩漏 mines', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  reveal(s, 4, 4);
  const payload = buildMatchStartPayload(s, {});
  assert.equal(payload.gameType, 'minesweeper');
  assert.equal(payload.state.mines, undefined, 'matchStart 絕不能含 mines');
  assert.equal(payload.state.cols, DIFFICULTIES.easy.cols);
});

test('buildSnapshotPayload：只含公開統計 + events', () => {
  const s = createInitialState(players, { difficulty: 'easy' }, 0);
  const payload = buildSnapshotPayload(s, [{ type: 'reveal', cells: [[4, 4, 0]] }]);
  assert.equal(payload.phase, 'playing');
  assert.equal(payload.mineCount, DIFFICULTIES.easy.mines);
  assert.equal(payload.mines, undefined);
  assert.ok(Array.isArray(payload.events));
});
