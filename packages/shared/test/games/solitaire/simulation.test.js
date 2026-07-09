import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, finalizeStats,
  sanitizeInput, buildBoard, buildMatchStartPayload,
  NUM_TABLEAU, DECK_SIZE,
} from '../../../src/games/solitaire/index.js';

const players = [{ id: 'p1', characterId: 'munchkin' }];
// 花色：0=黑桃(黑) 1=紅心(紅) 2=方塊(紅) 3=梅花(黑)

function blankState() {
  const s = createInitialState(players, {}, 0, () => 0);
  s.stock = []; s.waste = [];
  s.foundations = [[], [], [], []];
  s.tableau = [[], [], [], [], [], [], []];
  s.moves = 0; s.events = [];
  return s;
}
function move(s, from, to, now = 1000) {
  return applyInput(s, 'p1', { seq: 1, action: 'move', from, to }, now);
}

test('createInitialState：發牌形狀正確、共 52 張且不重複', () => {
  const s = createInitialState(players, {}, 0, () => 0.5);
  assert.equal(s.tableau.length, NUM_TABLEAU);
  let total = 0;
  const seen = new Set();
  for (let col = 0; col < NUM_TABLEAU; col++) {
    assert.equal(s.tableau[col].length, col + 1, `第 ${col} 列應 ${col + 1} 張`);
    // 只有頂端 faceUp
    s.tableau[col].forEach((c, i) => {
      assert.equal(c.faceUp, i === col);
      seen.add(`${c.s},${c.r}`);
      total++;
    });
  }
  total += s.stock.length;
  s.stock.forEach(c => seen.add(`${c.s},${c.r}`));
  assert.equal(s.stock.length, DECK_SIZE - (1 + 2 + 3 + 4 + 5 + 6 + 7)); // 24
  assert.equal(total, DECK_SIZE);
  assert.equal(seen.size, DECK_SIZE, '52 張不重複');
});

test('抽牌：stock → waste；stock 空時回收 waste', () => {
  const s = blankState();
  s.stock = [{ s: 0, r: 1 }, { s: 1, r: 2 }];  // 頂端為尾端 → 先抽 2♥
  applyInput(s, 'p1', { seq: 1, action: 'draw' }, 1000);
  assert.equal(s.waste.length, 1);
  assert.deepEqual(s.waste[0], { s: 1, r: 2 });
  applyInput(s, 'p1', { seq: 2, action: 'draw' }, 1000);
  assert.equal(s.stock.length, 0);
  assert.equal(s.waste.length, 2);
  // stock 空 → 再抽一次回收
  applyInput(s, 'p1', { seq: 3, action: 'draw' }, 1000);
  assert.equal(s.stock.length, 2);
  assert.equal(s.waste.length, 0);
});

test('waste → foundation：A 進空 foundation', () => {
  const s = blankState();
  s.waste = [{ s: 0, r: 1 }];   // A♠
  const ok = move(s, { pile: 'waste' }, { pile: 'foundation' });
  assert.equal(s.foundations[0].length, 1);
  assert.equal(s.waste.length, 0);
  assert.equal(s.moves, 1);
  assert.ok(ok.events.some(e => e.type === 'board'));
});

test('foundation 需同花升序：2♥ 不能疊在 A♠ 上（不同 foundation）', () => {
  const s = blankState();
  s.foundations[0] = [{ s: 0, r: 1 }];  // A♠
  s.waste = [{ s: 1, r: 2 }];           // 2♥ → 只能進 foundations[1]，但那是空的且非 A
  move(s, { pile: 'waste' }, { pile: 'foundation' });
  assert.equal(s.foundations[1].length, 0, '2♥ 不該進空 foundation');
  assert.equal(s.waste.length, 1, '移動應被拒');
});

test('tableau → tableau：紅 7 疊上黑 8，異色降序合法', () => {
  const s = blankState();
  s.tableau[0] = [{ s: 1, r: 7, faceUp: true }];  // 7♥
  s.tableau[1] = [{ s: 0, r: 8, faceUp: true }];  // 8♠
  const ok = move(s, { pile: 'tableau', col: 0, row: 0 }, { pile: 'tableau', col: 1 });
  assert.ok(ok);
  assert.equal(s.tableau[0].length, 0);
  assert.equal(s.tableau[1].length, 2);
  assert.deepEqual(s.tableau[1][1], { s: 1, r: 7, faceUp: true });
});

test('tableau → tableau：同色不合法', () => {
  const s = blankState();
  s.tableau[0] = [{ s: 0, r: 7, faceUp: true }];  // 7♠(黑)
  s.tableau[1] = [{ s: 3, r: 8, faceUp: true }];  // 8♣(黑)
  move(s, { pile: 'tableau', col: 0, row: 0 }, { pile: 'tableau', col: 1 });
  assert.equal(s.tableau[1].length, 1, '同色不該接受');
});

test('移走後露出的蓋牌自動翻開', () => {
  const s = blankState();
  s.tableau[0] = [{ s: 2, r: 5, faceUp: false }, { s: 1, r: 7, faceUp: true }];
  s.tableau[1] = [{ s: 0, r: 8, faceUp: true }];
  move(s, { pile: 'tableau', col: 0, row: 1 }, { pile: 'tableau', col: 1 });
  assert.equal(s.tableau[0].length, 1);
  assert.equal(s.tableau[0][0].faceUp, true, '露出的牌應翻開');
});

test('多張連續段一起搬移', () => {
  const s = blankState();
  // 9♠(黑) 8♥(紅) 7♣(黑) — 合法降序異色段
  s.tableau[0] = [
    { s: 0, r: 9, faceUp: true },
    { s: 1, r: 8, faceUp: true },
    { s: 3, r: 7, faceUp: true },
  ];
  s.tableau[1] = [{ s: 1, r: 10, faceUp: true }];  // 10♥(紅)
  const ok = move(s, { pile: 'tableau', col: 0, row: 0 }, { pile: 'tableau', col: 1 });
  assert.ok(ok);
  assert.equal(s.tableau[1].length, 4);
  assert.equal(s.tableau[0].length, 0);
});

test('斷裂的段不能搬移', () => {
  const s = blankState();
  s.tableau[0] = [
    { s: 0, r: 9, faceUp: true },
    { s: 1, r: 8, faceUp: true },
    { s: 0, r: 6, faceUp: true },  // 7→6 之間斷了（8 後面不是 7）
  ];
  s.tableau[1] = [{ s: 1, r: 10, faceUp: true }];
  move(s, { pile: 'tableau', col: 0, row: 0 }, { pile: 'tableau', col: 1 });
  assert.equal(s.tableau[1].length, 1, '非法段不該移動');
});

test('空列只能放 K', () => {
  const s = blankState();
  s.waste = [{ s: 0, r: 12 }];   // Q♠
  move(s, { pile: 'waste' }, { pile: 'tableau', col: 0 });
  assert.equal(s.tableau[0].length, 0, 'Q 不能放空列');
  s.waste = [{ s: 0, r: 13 }];   // K♠
  move(s, { pile: 'waste' }, { pile: 'tableau', col: 0 });
  assert.equal(s.tableau[0].length, 1, 'K 可放空列');
});

test('不能移到自己所在列', () => {
  const s = blankState();
  s.tableau[0] = [{ s: 0, r: 13, faceUp: true }];
  const before = JSON.stringify(s.tableau[0]);
  move(s, { pile: 'tableau', col: 0, row: 0 }, { pile: 'tableau', col: 0 });
  assert.equal(JSON.stringify(s.tableau[0]), before);
});

test('foundation 同花升序疊放', () => {
  const s = blankState();
  s.foundations[1] = [{ s: 1, r: 1 }];   // A♥
  s.waste = [{ s: 1, r: 2 }];            // 2♥
  move(s, { pile: 'waste' }, { pile: 'foundation' });
  assert.equal(s.foundations[1].length, 2);
});

test('auto：把可歸位的牌自動收進 foundation', () => {
  const s = blankState();
  s.waste = [{ s: 0, r: 1 }];             // A♠
  s.tableau[0] = [{ s: 0, r: 2, faceUp: true }];  // 2♠（A 收好後可跟進）
  applyInput(s, 'p1', { seq: 1, action: 'auto' }, 1000);
  assert.equal(s.foundations[0].length, 2, 'A♠ + 2♠ 應被自動收進');
  assert.equal(s.waste.length, 0);
  assert.equal(s.tableau[0].length, 0);
});

test('勝利：最後一張進 foundation → won + ended', () => {
  const s = blankState();
  // 3 花色全滿(13)，第 4 花色(梅花)差一張 K
  for (let suit = 0; suit < 3; suit++) {
    s.foundations[suit] = Array.from({ length: 13 }, (_, i) => ({ s: suit, r: i + 1 }));
  }
  s.foundations[3] = Array.from({ length: 12 }, (_, i) => ({ s: 3, r: i + 1 }));
  s.waste = [{ s: 3, r: 13 }];   // K♣
  move(s, { pile: 'waste' }, { pile: 'foundation' }, 5000);
  assert.equal(s.result, 'won');
  assert.equal(s.phase, 'ended');
  assert.equal(s.endedAtMs, 5000);
  assert.equal(getWinner(s), 'p1');
  assert.ok(s.events.some(e => e.type === 'game_over' && e.result === 'won'));
});

test('結束後不再接受輸入', () => {
  const s = blankState();
  s.phase = 'ended'; s.result = 'won';
  const before = s.moves;
  applyInput(s, 'p1', { seq: 1, action: 'draw' }, 6000);
  assert.equal(s.moves, before);
});

test('buildBoard：蓋著的牌不洩漏 identity', () => {
  const s = blankState();
  s.tableau[0] = [{ s: 2, r: 5, faceUp: false }, { s: 1, r: 7, faceUp: true }];
  s.stock = [{ s: 0, r: 3 }, { s: 1, r: 4 }];
  const b = buildBoard(s);
  assert.equal(b.stockCount, 2);
  assert.equal(b.tableau[0][0].faceUp, false);
  assert.equal(b.tableau[0][0].s, undefined, '蓋牌不含花色');
  assert.equal(b.tableau[0][0].r, undefined, '蓋牌不含點數');
  assert.equal(b.tableau[0][1].r, 7, '翻開的牌含點數');
});

test('buildMatchStartPayload：含 board，stock 只給數量', () => {
  const s = createInitialState(players, {}, 0, () => 0.3);
  const payload = buildMatchStartPayload(s, {});
  assert.equal(payload.gameType, 'solitaire');
  assert.equal(payload.state.board.stockCount, 24);
  assert.equal(payload.state.stock, undefined, 'matchStart 不應直接送 stock 陣列');
});

test('finalizeStats：moves / timeMs / won', () => {
  const s = blankState();
  s.startedAtMs = 100;
  for (let suit = 0; suit < 3; suit++) {
    s.foundations[suit] = Array.from({ length: 13 }, (_, i) => ({ s: suit, r: i + 1 }));
  }
  s.foundations[3] = Array.from({ length: 12 }, (_, i) => ({ s: 3, r: i + 1 }));
  s.waste = [{ s: 3, r: 13 }];
  move(s, { pile: 'waste' }, { pile: 'foundation' }, 5100);
  const fin = finalizeStats(s);
  assert.equal(fin.p1.won, 1);
  assert.equal(fin.p1.timeMs, 5000);
  assert.ok(fin.p1.moves >= 1);
});

test('sanitizeInput：draw/auto/move 合法通過，非法回 null', () => {
  assert.deepEqual(sanitizeInput({ seq: 1, action: 'draw' }), { seq: 1, action: 'draw' });
  assert.deepEqual(sanitizeInput({ seq: 2, action: 'auto' }), { seq: 2, action: 'auto' });
  assert.deepEqual(
    sanitizeInput({ action: 'move', from: { pile: 'waste' }, to: { pile: 'foundation' } }),
    { seq: 0, action: 'move', from: { pile: 'waste' }, to: { pile: 'foundation' } },
  );
  assert.equal(sanitizeInput({ action: 'nope' }), null);
  assert.equal(sanitizeInput({ action: 'move', from: { pile: 'foundation' }, to: { pile: 'tableau', col: 0 } }), null, 'source foundation 需 idx');
  assert.equal(sanitizeInput({ action: 'move', from: { pile: 'tableau', col: 99, row: 0 }, to: { pile: 'tableau', col: 0 } }), null, 'col 出界');
});

test('aliveCount / resolveTick', () => {
  const s = blankState();
  assert.equal(aliveCount(s), 1);
  resolveTick(s, 1);
  assert.equal(s.tick, 1);
  assert.equal(s.phase, 'playing');
});
