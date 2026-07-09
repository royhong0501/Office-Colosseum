// 五子棋 simulation — server-authoritative、回合制。
// 與即時制遊戲不同：resolveTick 幾乎只推進 tick 與檢查回合逾時；
// 所有落子邏輯在 applyInput（依 state.turn 決定該誰動）。
//
// AUTO_END_ON_LAST_ALIVE 維持預設 true：兩人對局 aliveCount=2，正常靠 phase==='ended' 結束；
// 若對手斷線導致 aliveCount→1，match.js 會自動判剩下者勝，正是我們要的行為。

import { BOARD_SIZE, WIN_LEN, TURN_TIME_MS, COLORS } from './constants.js';

export const GAME_ID = 'gomoku';
export const NAME = '五子棋';

/* ------------------------------------------------------------
   State shape
   ------------------------------------------------------------
   state = {
     phase: 'playing' | 'ended',
     tick, startedAtMs,
     gameType: 'gomoku', config,
     players: { [id]: { id, characterId, color: 'black'|'white', alive, paused } },
     order: [blackId, whiteId],
     board: { 'c,r': 'black'|'white' },   // sparse
     turn: playerId,                       // 目前該誰落子（先手=black）
     turnColor: 'black'|'white',
     turnEndsAtMs,
     moveCount,
     lastMove: { c, r, color, playerId } | null,
     winner: playerId | null,
     winningLine: [[c,r], ...] | null,
     events: [...],
   }
   ------------------------------------------------------------ */

function cellKey(c, r) { return `${c},${r}`; }

export function createInitialState(players, config = {}, startedAtMs = Date.now()) {
  const order = [];
  const statePlayers = {};
  players.slice(0, 2).forEach((p, i) => {
    const color = COLORS[i];
    order.push(p.id);
    statePlayers[p.id] = {
      id: p.id,
      characterId: p.characterId,
      color,
      alive: true,
      paused: false,
    };
  });
  const blackId = order[0] ?? null;
  return {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    gameType: GAME_ID,
    config: config ?? {},
    players: statePlayers,
    order,
    board: {},
    turn: blackId,
    turnColor: 'black',
    turnEndsAtMs: startedAtMs + TURN_TIME_MS,
    moveCount: 0,
    lastMove: null,
    winner: null,
    winningLine: null,
    events: [],
  };
}

/* ------------------------------------------------------------
   sanitizeInput — INPUT 白名單。只接受合法的落子動作，其餘（含 bot 非其回合回傳 null）一律丟棄。
   ------------------------------------------------------------ */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.action !== 'place') return null;
  const c = Number.isInteger(raw.c) ? raw.c : null;
  const r = Number.isInteger(raw.r) ? raw.r : null;
  if (c === null || r === null) return null;
  if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) return null;
  return {
    seq: Number.isFinite(raw.seq) ? (raw.seq | 0) : 0,
    action: 'place',
    c, r,
  };
}

/* ------------------------------------------------------------
   applyInput — 只有輪到的玩家、落在空格才生效；否則靜默忽略。
   ------------------------------------------------------------ */
export function applyInput(state, playerId, input, _now, _rng) {
  if (state.phase !== 'playing') return state;
  const p = state.players[playerId];
  if (!p) return state;
  if (playerId !== state.turn) return state;          // 不是你的回合
  if (!input || input.action !== 'place') return state;

  const { c, r } = input;
  const key = cellKey(c, r);
  if (state.board[key]) return state;                  // 該格已有子

  state.board[key] = p.color;
  state.moveCount += 1;
  state.lastMove = { c, r, color: p.color, playerId };
  state.events.push({ type: 'stone_placed', playerId, color: p.color, c, r });

  const line = findWinningLine(state.board, c, r, p.color);
  if (line) {
    state.winner = playerId;
    state.winningLine = line;
    state.phase = 'ended';
    state.events.push({ type: 'game_won', playerId, color: p.color, line });
    return state;
  }

  if (state.moveCount >= BOARD_SIZE * BOARD_SIZE) {
    // 棋盤填滿無人連成五 → 和局
    state.phase = 'ended';
    state.winner = null;
    state.events.push({ type: 'draw' });
    return state;
  }

  // 換手
  const nextId = state.order.find(id => id !== playerId) ?? playerId;
  state.turn = nextId;
  state.turnColor = state.players[nextId]?.color ?? state.turnColor;
  state.turnEndsAtMs = _now + TURN_TIME_MS;
  return state;
}

/* ------------------------------------------------------------
   resolveTick — 回合制：只推 tick 與檢查回合逾時（逾時該手玩家判負）。
   ------------------------------------------------------------ */
export function resolveTick(state, now, _rng) {
  state.tick += 1;
  if (state.phase === 'playing' && now >= state.turnEndsAtMs) {
    const loserId = state.turn;
    const winnerId = state.order.find(id => id !== loserId) ?? null;
    state.winner = winnerId;
    state.phase = 'ended';
    state.events.push({ type: 'turn_timeout', playerId: loserId });
  }
  return { state };
}

/* ------------------------------------------------------------
   勝負判定：以 (c,r) 為中心，檢查四個方向是否連成 >= WIN_LEN 子。
   回傳勝連的座標陣列，或 null。
   ------------------------------------------------------------ */
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function findWinningLine(board, c, r, color) {
  for (const [dc, dr] of DIRS) {
    const line = [[c, r]];
    // 正向延伸
    for (let k = 1; k < WIN_LEN; k++) {
      const nc = c + dc * k, nr = r + dr * k;
      if (board[cellKey(nc, nr)] === color) line.push([nc, nr]); else break;
    }
    // 反向延伸
    for (let k = 1; k < WIN_LEN; k++) {
      const nc = c - dc * k, nr = r - dr * k;
      if (board[cellKey(nc, nr)] === color) line.unshift([nc, nr]); else break;
    }
    if (line.length >= WIN_LEN) return line;
  }
  return null;
}

/* ------------------------------------------------------------
   Queries / payload
   ------------------------------------------------------------ */
export function aliveCount(state) {
  return Object.values(state.players).filter(p => p.alive).length;
}

export function getWinner(state) {
  return state.winner ?? null;
}

export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    startedAtMs: state.startedAtMs,
    players: state.players,
    turn: state.turn,
    turnColor: state.turnColor,
    turnEndsAtMs: state.turnEndsAtMs,
    moveCount: state.moveCount,
    lastMove: state.lastMove,
    winner: state.winner,
    winningLine: state.winningLine,
    events: newEvents,
  };
}

export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config: config ?? {},
    state: { ...state },
  };
}

/** SPECTATE_INIT — 觀戰者中途加入；gomoku state 含完整 board，直接送當前 state 當 baseline。 */
export function buildSpectatorInitPayload(state, config) {
  return buildMatchStartPayload(state, config);
}
