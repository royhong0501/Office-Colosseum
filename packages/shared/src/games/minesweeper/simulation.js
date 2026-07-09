// 踩地雷 simulation — server-authoritative、單人回合制。
// 重點：雷的位置只存在 server（mines Set），永遠不進 snapshot/matchStart，
// 直到遊戲結束才透過 reveal_mines 事件公開，避免 client 作弊。
//
// AUTO_END_ON_LAST_ALIVE = false：單人 aliveCount=1，不能因 <=1 秒結束；
// 只認 phase==='ended'（踩雷或清盤）。

import { getDifficulty } from './constants.js';

export const GAME_ID = 'minesweeper';
export const NAME = '踩地雷';
export const AUTO_END_ON_LAST_ALIVE = false;

/* ------------------------------------------------------------
   State shape（Set 為 server-only，不序列化）
   ------------------------------------------------------------
   state = {
     phase: 'playing'|'ended', tick, startedAtMs, endedAtMs,
     gameType, config: { difficulty },
     cols, rows, mineCount,
     players: { [id]: { id, characterId, alive } },
     playerId,
     mines: Set<'c,r'>, revealed: Set<'c,r'>, flagged: Set<'c,r'>,
     minesPlaced: bool, safeTotal, revealedCount, flagsUsed,
     result: 'won'|'lost'|null,
     events: [],
   }
   ------------------------------------------------------------ */

function key(c, r) { return `${c},${r}`; }

export function createInitialState(players, config = {}, startedAtMs = Date.now()) {
  const diff = getDifficulty(config?.difficulty);
  const first = players[0] ?? null;
  const statePlayers = {};
  if (first) {
    statePlayers[first.id] = { id: first.id, characterId: first.characterId, alive: true };
  }
  return {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    endedAtMs: null,
    gameType: GAME_ID,
    config: { difficulty: diff.id },
    cols: diff.cols,
    rows: diff.rows,
    mineCount: diff.mines,
    players: statePlayers,
    playerId: first?.id ?? null,
    mines: new Set(),
    revealed: new Set(),
    flagged: new Set(),
    minesPlaced: false,
    safeTotal: diff.cols * diff.rows - diff.mines,
    revealedCount: 0,
    flagsUsed: 0,
    result: null,
    events: [],
  };
}

/* ------------------------------------------------------------
   sanitizeInput — 只接受合法的 reveal / flag 動作
   ------------------------------------------------------------ */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.action !== 'reveal' && raw.action !== 'flag') return null;
  const c = Number.isInteger(raw.c) ? raw.c : null;
  const r = Number.isInteger(raw.r) ? raw.r : null;
  if (c === null || r === null) return null;
  return {
    seq: Number.isFinite(raw.seq) ? (raw.seq | 0) : 0,
    action: raw.action,
    c, r,
  };
}

/* ------------------------------------------------------------
   applyInput
   ------------------------------------------------------------ */
export function applyInput(state, playerId, input, now = Date.now(), rng = Math.random) {
  if (state.phase !== 'playing') return state;
  if (playerId !== state.playerId) return state;
  if (!input) return state;
  const { c, r } = input;
  if (c < 0 || c >= state.cols || r < 0 || r >= state.rows) return state;
  const k = key(c, r);

  if (input.action === 'flag') {
    if (state.revealed.has(k)) return state;   // 已翻開不能插旗
    if (state.flagged.has(k)) {
      state.flagged.delete(k); state.flagsUsed -= 1;
      state.events.push({ type: 'flag', c, r, flagged: false });
    } else {
      state.flagged.add(k); state.flagsUsed += 1;
      state.events.push({ type: 'flag', c, r, flagged: true });
    }
    return state;
  }

  // action === 'reveal'
  if (state.flagged.has(k)) return state;      // 有旗保護，不誤翻
  if (state.revealed.has(k)) return state;

  // 首次翻開才佈雷，排除首點及其八鄰（保證首點必開一片）
  if (!state.minesPlaced) {
    placeMines(state, c, r, rng);
    state.minesPlaced = true;
  }

  if (state.mines.has(k)) {
    state.revealed.add(k);
    state.result = 'lost';
    state.phase = 'ended';
    state.endedAtMs = now;
    state.events.push({ type: 'explode', c, r });
    state.events.push({ type: 'reveal_mines', cells: [...state.mines].map(mk => mk.split(',').map(Number)) });
    state.events.push({ type: 'game_over', result: 'lost' });
    return state;
  }

  const newly = floodReveal(state, c, r);
  if (newly.length) {
    state.events.push({ type: 'reveal', cells: newly });
  }

  if (state.revealedCount >= state.safeTotal) {
    state.result = 'won';
    state.phase = 'ended';
    state.endedAtMs = now;
    state.events.push({ type: 'game_over', result: 'won' });
  }
  return state;
}

/** 佈雷：在所有格子中排除 (fc,fr) 及八鄰，隨機取 mineCount 個。 */
function placeMines(state, fc, fr, rng) {
  const safe = new Set();
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      safe.add(key(fc + dc, fr + dr));
    }
  }
  const candidates = [];
  for (let c = 0; c < state.cols; c++) {
    for (let r = 0; r < state.rows; r++) {
      const kk = key(c, r);
      if (!safe.has(kk)) candidates.push(kk);
    }
  }
  // Fisher–Yates 取前 mineCount 個
  const need = Math.min(state.mineCount, candidates.length);
  for (let i = 0; i < need; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i));
    const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    state.mines.add(candidates[i]);
  }
}

/** 計算 (c,r) 周圍地雷數。 */
function countAdj(state, c, r) {
  let n = 0;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      if (state.mines.has(key(c + dc, r + dr))) n += 1;
    }
  }
  return n;
}

/** BFS flood fill：翻開 (c,r)，若 adj==0 連帶翻開鄰格。回傳新翻開的 [[c,r,adj],...]。 */
function floodReveal(state, c, r) {
  const out = [];
  const stack = [[c, r]];
  while (stack.length) {
    const [cc, cr] = stack.pop();
    if (cc < 0 || cc >= state.cols || cr < 0 || cr >= state.rows) continue;
    const kk = key(cc, cr);
    if (state.revealed.has(kk)) continue;
    if (state.mines.has(kk)) continue;         // flood 不會翻到雷
    // 有旗的格子在 flood 時自動清旗再翻（標錯了）
    if (state.flagged.has(kk)) { state.flagged.delete(kk); state.flagsUsed -= 1; }
    const adj = countAdj(state, cc, cr);
    state.revealed.add(kk);
    state.revealedCount += 1;
    out.push([cc, cr, adj]);
    if (adj === 0) {
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          stack.push([cc + dc, cr + dr]);
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------
   resolveTick — 單人無時限：只推 tick
   ------------------------------------------------------------ */
export function resolveTick(state, _now, _rng) {
  state.tick += 1;
  return { state };
}

/* ------------------------------------------------------------
   Queries / payload
   ------------------------------------------------------------ */
export function aliveCount(state) {
  return Object.values(state.players).filter(p => p.alive).length;
}

export function getWinner(state) {
  return state.result === 'won' ? state.playerId : null;
}

/** 戰績結算（match.js 通用 finalizeStats hook 呼叫）。 */
export function finalizeStats(state) {
  const pid = state.playerId;
  if (!pid) return {};
  const endedAt = state.endedAtMs ?? state.startedAtMs;
  return {
    [pid]: {
      timeMs: Math.max(0, endedAt - state.startedAtMs),
      cellsRevealed: state.revealedCount,
      won: state.result === 'won' ? 1 : 0,
    },
  };
}

export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    result: state.result,
    revealedCount: state.revealedCount,
    flagsUsed: state.flagsUsed,
    mineCount: state.mineCount,
    events: newEvents,
  };
}

/** 只送公開資訊：盤面尺寸、雷數、玩家。絕不含 mines。 */
export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config: config ?? { difficulty: state.config.difficulty },
    state: {
      phase: state.phase,
      startedAtMs: state.startedAtMs,
      gameType: GAME_ID,
      config: state.config,
      cols: state.cols,
      rows: state.rows,
      mineCount: state.mineCount,
      players: state.players,
      playerId: state.playerId,
      flagsUsed: state.flagsUsed,
      revealedCount: state.revealedCount,
    },
  };
}

/** 觀戰中途加入：帶目前已翻開格（含 adj）與旗子；仍不含 mines（除非已結束）。 */
export function buildSpectatorInitPayload(state, config) {
  const base = buildMatchStartPayload(state, config);
  const revealedCells = [...state.revealed].map(k => {
    const [c, r] = k.split(',').map(Number);
    return [c, r, countAdj(state, c, r)];
  });
  const flaggedCells = [...state.flagged].map(k => k.split(',').map(Number));
  base.state.revealedCells = revealedCells;
  base.state.flaggedCells = flaggedCells;
  if (state.phase === 'ended') {
    base.state.mineCells = [...state.mines].map(k => k.split(',').map(Number));
  }
  return base;
}
