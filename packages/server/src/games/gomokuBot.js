// 五子棋 bot：威脅評分啟發式（非完整 minimax；15×15 搜尋太重）。
// 對每個「鄰近已有子的空格」評估：我下這裡的攻擊分 + 對手下這裡的防守分，取最高。
// 自然會：能贏就贏、對手要贏就擋、否則往威脅最大處落子。
//
// 注意：match.js 的 bot input 不經過 sim.sanitizeInput，且 decideBotInput 回傳值後面會被
// 直接 input.seq = ... 賦值，所以「絕不能回傳 null」、且輪到自己時必須回合法的界內空格。
// 非自己回合回傳 { action: 'noop' }，applyInput 會忽略（action !== 'place'）。

import { BOARD_SIZE, WIN_LEN } from '@office-colosseum/shared/src/games/gomoku/constants.js';

const CENTER = Math.floor(BOARD_SIZE / 2);
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function noop() { return { seq: 0, action: 'noop' }; }
function key(c, r) { return `${c},${r}`; }
function inBounds(c, r) { return c >= 0 && c < BOARD_SIZE && r >= 0 && r < BOARD_SIZE; }

/** 假設在 (c,r) 落 color 子後，該點造成的威脅總分（四方向連子 + 開放端）。 */
function scoreAt(board, c, r, color) {
  let total = 0;
  for (const [dc, dr] of DIRS) {
    let count = 1;
    let k = 1;
    while (board[key(c + dc * k, r + dr * k)] === color) { count++; k++; }
    const fwdOpen = inBounds(c + dc * k, r + dr * k) && board[key(c + dc * k, r + dr * k)] === undefined;
    k = 1;
    while (board[key(c - dc * k, r - dr * k)] === color) { count++; k++; }
    const bwdOpen = inBounds(c - dc * k, r - dr * k) && board[key(c - dc * k, r - dr * k)] === undefined;
    total += patternScore(count, (fwdOpen ? 1 : 0) + (bwdOpen ? 1 : 0));
  }
  return total;
}

function patternScore(count, openEnds) {
  if (count >= WIN_LEN) return 1_000_000;   // 直接連成五
  if (openEnds === 0) return 0;             // 兩端都被堵，無用
  if (count === 4) return openEnds === 2 ? 100_000 : 10_000;  // 活四 / 沖四
  if (count === 3) return openEnds === 2 ? 5_000 : 500;       // 活三 / 眠三
  if (count === 2) return openEnds === 2 ? 200 : 50;
  return openEnds === 2 ? 10 : 2;           // 單子
}

/** 已有子附近（Chebyshev ≤ 2）的空格，作為候選落點。 */
function candidateCells(board) {
  const cand = new Set();
  const occupied = Object.keys(board);
  for (const k of occupied) {
    const [c, r] = k.split(',').map(Number);
    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        const nc = c + dc, nr = r + dr;
        if (!inBounds(nc, nr)) continue;
        const nk = key(nc, nr);
        if (board[nk] === undefined) cand.add(nk);
      }
    }
  }
  return [...cand].map(k => k.split(',').map(Number));
}

function seededJitter(botId) {
  const s = String(botId);
  return (s.charCodeAt(s.length - 1) % 5) * 0.5;
}

export function decideBotInput(state, botId, _now) {
  try {
    if (state.phase !== 'playing') return noop();
    if (state.turn !== botId) return noop();          // 不是我的回合
    const me = state.players?.[botId];
    if (!me) return noop();
    const myColor = me.color;
    const oppColor = myColor === 'black' ? 'white' : 'black';
    const board = state.board ?? {};

    // 開局：空盤下中心
    if (state.moveCount === 0 && board[key(CENTER, CENTER)] === undefined) {
      return { seq: 0, action: 'place', c: CENTER, r: CENTER };
    }

    const cands = candidateCells(board);
    const jitter = seededJitter(botId);
    let best = null, bestScore = -1;
    for (const [c, r] of cands) {
      const off = scoreAt(board, c, r, myColor);   // 我下這裡的攻擊價值
      const def = scoreAt(board, c, r, oppColor);  // 擋掉對手下這裡的價值
      let score = off + def * 0.9;
      score += ((c * 13 + r * 7) % 11) * jitter;   // 微擾動避免固定棋路
      if (score > bestScore) { bestScore = score; best = [c, r]; }
    }

    if (best) return { seq: 0, action: 'place', c: best[0], r: best[1] };

    // 後備：掃任一空格（理論上不會走到，除非候選集為空）
    for (let c = 0; c < BOARD_SIZE; c++) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (board[key(c, r)] === undefined) return { seq: 0, action: 'place', c, r };
      }
    }
    return noop();
  } catch {
    return noop();
  }
}
