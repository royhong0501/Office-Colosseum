// 接龍（Klondike）simulation — server-authoritative、單人回合制。
// 規則：
//   - tableau 7 列，往下疊「降序、異色」；空列只能放 K。
//   - foundation 4 堆（依花色），A→K 同花升序。全滿 52 張即勝。
//   - stock 抽牌到 waste（一次一張）；stock 抽完可把 waste 回收再抽（無限次）。
// 面朝下的牌（stock、tableau 蓋著的）identity 不進 payload，避免玩家開 devtools 偷看。
//
// AUTO_END_ON_LAST_ALIVE = false：單人不能因 aliveCount<=1 秒結束。

import {
  NUM_TABLEAU, NUM_FOUNDATIONS, RANK_MAX, DECK_SIZE, altColor,
} from './constants.js';

export const GAME_ID = 'solitaire';
export const NAME = '接龍';
export const AUTO_END_ON_LAST_ALIVE = false;

/* ------------------------------------------------------------
   State shape
   ------------------------------------------------------------
   state = {
     phase, tick, startedAtMs, endedAtMs,
     gameType, config,
     players: { [id]: { id, characterId, alive } }, playerId,
     stock: [{s,r}],                    // 面朝下；抽牌取尾端
     waste: [{s,r}],                    // 面朝上；頂端為尾端
     foundations: [[{s,r}], ...4],      // 依花色 index；A..K
     tableau: [[{s,r,faceUp}], ...7],   // 每列由底到頂
     moves, result: 'won'|null, events,
   }
   ------------------------------------------------------------ */

function makeDeck(rng) {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= RANK_MAX; r++) deck.push({ s, r });
  }
  // Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

export function createInitialState(players, config = {}, startedAtMs = Date.now(), rng = Math.random) {
  const deck = makeDeck(rng);
  const tableau = Array.from({ length: NUM_TABLEAU }, () => []);
  let idx = 0;
  for (let col = 0; col < NUM_TABLEAU; col++) {
    for (let k = 0; k <= col; k++) {
      const c = deck[idx++];
      tableau[col].push({ s: c.s, r: c.r, faceUp: k === col });
    }
  }
  const stock = deck.slice(idx).map(c => ({ s: c.s, r: c.r }));

  const first = players[0] ?? null;
  const statePlayers = {};
  if (first) statePlayers[first.id] = { id: first.id, characterId: first.characterId, alive: true };

  const state = {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    endedAtMs: null,
    gameType: GAME_ID,
    config: {},
    players: statePlayers,
    playerId: first?.id ?? null,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    result: null,
    stuck: false,
    events: [],
  };
  return state;
}

/* ------------------------------------------------------------
   sanitizeInput
   ------------------------------------------------------------ */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = Number.isFinite(raw.seq) ? (raw.seq | 0) : 0;
  if (raw.action === 'draw' || raw.action === 'auto') {
    return { seq, action: raw.action };
  }
  if (raw.action === 'move') {
    const from = sanitizeLoc(raw.from, true);
    const to = sanitizeLoc(raw.to, false);
    if (!from || !to) return null;
    return { seq, action: 'move', from, to };
  }
  return null;
}

function sanitizeLoc(loc, isSource) {
  if (!loc || typeof loc !== 'object') return null;
  if (loc.pile === 'waste') return isSource ? { pile: 'waste' } : null;
  if (loc.pile === 'foundation') {
    // dest foundation 不需 idx（依牌花色決定）；source foundation 需要 idx
    if (isSource) {
      const idx = Number.isInteger(loc.idx) ? loc.idx : null;
      if (idx === null || idx < 0 || idx >= NUM_FOUNDATIONS) return null;
      return { pile: 'foundation', idx };
    }
    return { pile: 'foundation' };
  }
  if (loc.pile === 'tableau') {
    const col = Number.isInteger(loc.col) ? loc.col : null;
    if (col === null || col < 0 || col >= NUM_TABLEAU) return null;
    if (isSource) {
      const row = Number.isInteger(loc.row) ? loc.row : null;
      if (row === null || row < 0) return null;
      return { pile: 'tableau', col, row };
    }
    return { pile: 'tableau', col };
  }
  return null;
}

/* ------------------------------------------------------------
   applyInput
   ------------------------------------------------------------ */
export function applyInput(state, playerId, input, now = Date.now(), _rng) {
  if (state.phase !== 'playing') return state;
  if (playerId !== state.playerId) return state;
  if (!input) return state;

  let changed = false;
  if (input.action === 'draw') changed = doDraw(state);
  else if (input.action === 'move') changed = doMove(state, input.from, input.to);
  else if (input.action === 'auto') changed = doAuto(state);

  if (changed) {
    state.moves += 1;
    state.events.push({ type: 'board', board: buildBoard(state) });
    if (isWon(state)) {
      state.result = 'won';
      state.phase = 'ended';
      state.endedAtMs = now;
      state.events.push({ type: 'game_over', result: 'won' });
      return state;
    }
    // 卡關偵測（只在「轉為無合法步」時發一次事件；面朝下的牌只有 server 知道，故必須在此判）
    const stuck = !hasAnyLegalMove(state);
    if (stuck && !state.stuck) { state.stuck = true; state.events.push({ type: 'stuck' }); }
    else if (!stuck) state.stuck = false;
  }
  return state;
}

function doDraw(state) {
  if (state.stock.length > 0) {
    state.waste.push(state.stock.pop());
    return true;
  }
  if (state.waste.length > 0) {
    // 回收：waste 全數翻回 stock（順序反轉，維持抽牌循環）
    while (state.waste.length) state.stock.push(state.waste.pop());
    return true;
  }
  return false;
}

/** 取出來源要移動的牌陣列（不修改 state），連同一個 remove() 回呼。 */
function pickSource(state, from) {
  if (from.pile === 'waste') {
    if (!state.waste.length) return null;
    const card = state.waste[state.waste.length - 1];
    return { cards: [{ s: card.s, r: card.r }], remove: () => state.waste.pop() };
  }
  if (from.pile === 'foundation') {
    const pile = state.foundations[from.idx];
    if (!pile?.length) return null;
    const card = pile[pile.length - 1];
    return { cards: [{ s: card.s, r: card.r }], remove: () => pile.pop() };
  }
  if (from.pile === 'tableau') {
    const col = state.tableau[from.col];
    if (!col || from.row >= col.length) return null;
    const slice = col.slice(from.row);
    if (slice.some(c => !c.faceUp)) return null;           // 不能移動蓋著的牌
    if (!isValidRun(slice)) return null;                    // 必須是降序異色連續段
    const cards = slice.map(c => ({ s: c.s, r: c.r }));
    return {
      cards,
      remove: () => {
        col.length = from.row;                              // 砍掉 row 以後
        flipTopFaceUp(col);
      },
    };
  }
  return null;
}

/** 檢查一段 tableau 牌是否為合法可移動段（降序 + 異色）。 */
function isValidRun(cards) {
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i], b = cards[i + 1];
    if (!(a.r === b.r + 1 && altColor(a, b))) return false;
  }
  return true;
}

function flipTopFaceUp(col) {
  const top = col[col.length - 1];
  if (top && !top.faceUp) top.faceUp = true;
}

function doMove(state, from, to) {
  const src = pickSource(state, from);
  if (!src) return false;
  const bottom = src.cards[0];   // 要落在 dest 上的那張

  if (to.pile === 'foundation') {
    if (src.cards.length !== 1) return false;              // foundation 一次一張
    const pile = state.foundations[bottom.s];              // 依花色決定 foundation
    const ok = pile.length === 0 ? bottom.r === 1 : pile[pile.length - 1].r === bottom.r - 1;
    if (!ok) return false;
    src.remove();
    pile.push({ s: bottom.s, r: bottom.r });
    return true;
  }

  if (to.pile === 'tableau') {
    const col = state.tableau[to.col];
    if (from.pile === 'tableau' && from.col === to.col) return false;   // 不能移到自己
    let ok;
    if (col.length === 0) {
      ok = bottom.r === RANK_MAX;                           // 空列只能放 K
    } else {
      const top = col[col.length - 1];
      ok = top.faceUp && top.r === bottom.r + 1 && altColor(top, bottom);
    }
    if (!ok) return false;
    src.remove();
    for (const c of src.cards) col.push({ s: c.s, r: c.r, faceUp: true });
    return true;
  }

  return false;
}

/** 自動歸位：反覆把 waste 頂 / 各 tableau 頂能進 foundation 的牌收進去，直到沒有可收。 */
function doAuto(state) {
  let any = false;
  let progressed = true;
  while (progressed) {
    progressed = false;
    // waste 頂
    const w = state.waste[state.waste.length - 1];
    if (w && tryToFoundation(state, w, () => state.waste.pop())) { progressed = true; any = true; continue; }
    // 各 tableau 頂
    for (let col = 0; col < NUM_TABLEAU; col++) {
      const c = state.tableau[col];
      const top = c[c.length - 1];
      if (top && top.faceUp && tryToFoundation(state, top, () => { c.pop(); flipTopFaceUp(c); })) {
        progressed = true; any = true; break;
      }
    }
  }
  return any;
}

function tryToFoundation(state, card, remove) {
  const pile = state.foundations[card.s];
  const ok = pile.length === 0 ? card.r === 1 : pile[pile.length - 1].r === card.r - 1;
  if (!ok) return false;
  remove();
  pile.push({ s: card.s, r: card.r });
  return true;
}

function isWon(state) {
  return state.foundations.reduce((n, f) => n + f.length, 0) === DECK_SIZE;
}

/* ------------------------------------------------------------
   卡關偵測：是否還存在任一合法步。
   因為 1 張抽 + 無限回收，stock+waste 內每張牌最終都能被抽到，
   故把兩者合起來當「可取得的牌」逐一檢查能否進 foundation / tableau。
   ------------------------------------------------------------ */
function canToFoundation(state, c) {
  const pile = state.foundations[c.s];
  return pile.length === 0 ? c.r === 1 : pile[pile.length - 1].r === c.r - 1;
}
function canPlaceOnTableau(state, c, col) {
  const column = state.tableau[col];
  if (column.length === 0) return c.r === RANK_MAX;   // 空列只能放 K
  const top = column[column.length - 1];
  return top.faceUp && top.r === c.r + 1 && altColor(top, c);
}
export function hasAnyLegalMove(state) {
  // 1. stock + waste 內任一張能進 foundation 或某 tableau 欄（抽牌可取得）
  for (const c of [...state.stock, ...state.waste]) {
    if (canToFoundation(state, c)) return true;
    for (let col = 0; col < NUM_TABLEAU; col++) if (canPlaceOnTableau(state, c, col)) return true;
  }
  // 2. tableau 任一面朝上的合法連段能移到別欄，或單張進 foundation
  for (let col = 0; col < NUM_TABLEAU; col++) {
    const column = state.tableau[col];
    for (let row = 0; row < column.length; row++) {
      if (!column[row].faceUp) continue;
      const run = column.slice(row);
      if (!isValidRun(run)) continue;
      const bottom = run[0];
      if (run.length === 1 && canToFoundation(state, bottom)) return true;
      for (let t = 0; t < NUM_TABLEAU; t++) {
        if (t === col) continue;
        if (canPlaceOnTableau(state, bottom, t)) return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------
   Queries / payload
   ------------------------------------------------------------ */
export function resolveTick(state, _now, _rng) {
  state.tick += 1;
  return { state };
}

export function aliveCount(state) {
  return Object.values(state.players).filter(p => p.alive).length;
}

export function getWinner(state) {
  return state.result === 'won' ? state.playerId : null;
}

export function finalizeStats(state) {
  const pid = state.playerId;
  if (!pid) return {};
  const endedAt = state.endedAtMs ?? state.startedAtMs;
  return {
    [pid]: {
      moves: state.moves,
      timeMs: Math.max(0, endedAt - state.startedAtMs),
      won: state.result === 'won' ? 1 : 0,
    },
  };
}

/** 面朝下的牌只送 {faceUp:false}，不洩漏 identity。 */
export function buildBoard(state) {
  return {
    stockCount: state.stock.length,
    waste: state.waste.map(c => ({ s: c.s, r: c.r })),
    foundations: state.foundations.map(f => f.map(c => ({ s: c.s, r: c.r }))),
    tableau: state.tableau.map(col => col.map(c => (
      c.faceUp ? { s: c.s, r: c.r, faceUp: true } : { faceUp: false }
    ))),
  };
}

export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    result: state.result,
    moves: state.moves,
    events: newEvents,
  };
}

export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config: config ?? {},
    state: {
      phase: state.phase,
      startedAtMs: state.startedAtMs,
      gameType: GAME_ID,
      config: state.config,
      players: state.players,
      playerId: state.playerId,
      moves: state.moves,
      board: buildBoard(state),
    },
  };
}

export function buildSpectatorInitPayload(state, config) {
  return buildMatchStartPayload(state, config);
}
