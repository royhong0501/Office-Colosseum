// 整合測試：真的用 Match（match.js）跑一場 gomoku 人 vs bot，
// 驗證 bot 會經由 match tick 自動落子、對局能推進並以勝負結束。
// 不需 DB/socket：io 用 stub；1 真人（userId=null）→ recordMatch 會 skip，不碰 prisma。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../../src/match.js';

function makeMatch(onEnd) {
  const io = { emit() {} };
  const players = [
    { id: 'human', characterId: 'munchkin', isBot: false, userId: null },
    { id: 'bot-1', characterId: 'husky', isBot: true },
  ];
  return new Match(io, players, 'gomoku', {}, onEnd);
}

test('人 vs bot：bot 自動落子、對局以勝負結束', () => {
  let ended = false;
  const match = makeMatch(() => { ended = true; });

  // human 先手（black）。human 打右邊界的孤立子（不威脅），讓 bot 從容連五取勝。
  let humanRow = 0;
  for (let t = 0; t < 300 && match.state.phase === 'playing'; t++) {
    if (match.state.turn === 'human') {
      match.queueInput('human', { seq: t, action: 'place', c: 14, r: humanRow % 15 });
      humanRow += 1;
    }
    match.tick(1000 + t);   // now 遠小於 turnEndsAtMs，不會觸發逾時
  }

  assert.equal(match.state.phase, 'ended', '對局應結束');
  assert.ok(ended, 'onEnd 應被呼叫');
  assert.ok(match.state.winner, '應有勝者');

  // 雙方都下過子（證明 bot 有經由 match tick 落子）
  const colors = Object.values(match.state.board);
  assert.ok(colors.includes('black'), 'human(黑) 有落子');
  assert.ok(colors.includes('white'), 'bot(白) 有落子');

  // 對手完全不設防時，bot 應該贏
  assert.equal(match.state.winner, 'bot-1', 'bot 面對不設防對手應取勝');
});

test('bot 在自己回合會落子；非回合不動', () => {
  const match = makeMatch(() => {});
  // 開局輪到 human，先不給 human 輸入，只 tick 一次：bot 是白、非其回合 → 不落子
  match.tick(1000);
  assert.equal(Object.keys(match.state.board).length, 0, 'human 未動、bot 非回合 → 盤面應為空');

  // human 下一子後換 bot；再 tick 一次 → bot 應落子
  match.queueInput('human', { seq: 1, action: 'place', c: 7, r: 7 });
  match.tick(1001);   // human 落 (7,7)，turn→bot
  match.tick(1002);   // 換 bot 落子
  const colors = Object.values(match.state.board);
  assert.ok(colors.includes('white'), 'bot 在自己回合應落子');
});
