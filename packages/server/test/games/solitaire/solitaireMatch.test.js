// 整合測試：用 Match 跑單人接龍。userId=null → recordMatch skip，不碰 prisma。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../../src/match.js';

function makeMatch(onEnd = () => {}) {
  const io = { emit() {} };
  const players = [{ id: 'solo', characterId: 'munchkin', isBot: false, userId: null }];
  return new Match(io, players, 'solitaire', {}, onEnd);
}

test('單人接龍不會秒結束', () => {
  const m = makeMatch();
  for (let t = 0; t < 5; t++) m.tick(1000 + t);
  assert.equal(m.state.phase, 'playing');
});

test('完成最後一張 → ended + finalizeStats(won/moves/timeMs)', () => {
  let ended = false;
  const m = makeMatch(() => { ended = true; });
  m.startedAtMs = 0; m.state.startedAtMs = 0;
  // 佈成差一張 K♣ 的必勝盤
  for (let suit = 0; suit < 3; suit++) {
    m.state.foundations[suit] = Array.from({ length: 13 }, (_, i) => ({ s: suit, r: i + 1 }));
  }
  m.state.foundations[3] = Array.from({ length: 12 }, (_, i) => ({ s: 3, r: i + 1 }));
  m.state.stock = []; m.state.waste = [{ s: 3, r: 13 }];
  m.state.tableau = [[], [], [], [], [], [], []];

  m.queueInput('solo', { seq: 1, action: 'move', from: { pile: 'waste' }, to: { pile: 'foundation' } });
  m.tick(4000);

  assert.equal(m.state.phase, 'ended');
  assert.ok(ended);
  const gs = m.stats.solo.gameStats;
  assert.equal(gs.won, 1);
  assert.ok(gs.moves >= 1);
  assert.ok(gs.timeMs >= 0);
});
