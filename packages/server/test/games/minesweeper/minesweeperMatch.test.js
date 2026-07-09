// 整合測試：用 Match 跑單人踩地雷，驗證
//   1. AUTO_END_ON_LAST_ALIVE=false → 單人（aliveCount=1）不會秒結束
//   2. 清盤 → phase ended、finalizeStats 把 won/cellsRevealed/timeMs 寫進 match.stats
//   3. abort() 停 tick loop 不記錄
// userId=null → recordMatch 會 skip，不碰 prisma。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../../src/match.js';

function makeMatch(onEnd = () => {}) {
  const io = { emit() {} };
  const players = [{ id: 'solo', characterId: 'munchkin', isBot: false, userId: null }];
  return new Match(io, players, 'minesweeper', { difficulty: 'easy' }, onEnd);
}

test('單人不會因 aliveCount<=1 秒結束', () => {
  const m = makeMatch();
  for (let t = 0; t < 5; t++) m.tick(1000 + t);
  assert.equal(m.state.phase, 'playing', '單人踩地雷不應自動結束');
});

test('清盤 → ended + finalizeStats 寫入 won/cellsRevealed/timeMs', () => {
  let ended = false;
  const m = makeMatch(() => { ended = true; });
  // 換成可控小盤：3×3、雷在 (0,0)
  m.state.cols = 3; m.state.rows = 3; m.state.mineCount = 1; m.state.safeTotal = 8;
  m.state.mines = new Set(['0,0']);
  m.state.minesPlaced = true;
  m.startedAtMs = 0; m.state.startedAtMs = 0;

  // 逐格翻開 8 個安全格
  let now = 100;
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      if (c === 0 && r === 0) continue;
      m.queueInput('solo', { seq: now, action: 'reveal', c, r });
      m.tick(now);
      now += 10;
    }
  }
  assert.equal(m.state.phase, 'ended');
  assert.ok(ended, 'onEnd 應被呼叫');
  const gs = m.stats.solo.gameStats;
  assert.equal(gs.won, 1);
  assert.equal(gs.cellsRevealed, 8);
  assert.ok(gs.timeMs >= 0);
});

test('abort：停 tick loop、不觸發 onEnd', () => {
  let ended = false;
  const m = makeMatch(() => { ended = true; });
  m.start();
  m.abort();
  assert.equal(m.interval, null, 'interval 應清除');
  m.end();   // abort 後再呼叫 end 應 no-op
  assert.equal(ended, false, 'abort 後不應記錄/觸發 onEnd');
});
