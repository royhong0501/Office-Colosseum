// 數據領地爭奪戰 simulation — server-authoritative。
// 純塗色無戰鬥：移動經過的 cell 變自己隊色；當有「被自己隊色完全包圍」的連通區塊
// （含他隊色或空白），整塊翻成自己隊色 —— 模擬「格式刷」連鎖佔領。

import { TICK_MS } from '../../constants.js';
import { clamp } from '../../math.js';
import {
  ARENA_COLS, ARENA_ROWS,
  MAX_TEAMS, MOVE_SPEED, PLAYER_RADIUS, ROUND_DURATION_MS,
  TEAM_COLORS,
} from './constants.js';

export const GAME_ID = 'territory';
export const NAME = '數據領地爭奪戰';

/* ------------------------------------------------------------
   State shape
   ------------------------------------------------------------
   state = {
     phase, tick, startedAtMs, roundEndsAtMs,
     gameType: 'territory', config,
     teams: [{ id, name, color: { base, deep }, playerIds: [...] }, ...],
     players: { [id]: {
       id, characterId, teamId,
       x, y, moveX, moveY, aimAngle, facing, alive, paused,
     }},
     cells: { 'c,r': teamId }    // 被佔領的格子 → teamId；沒在 map 內的 key 表空白
     nextCaptureId,
     events: [...],
   }
   ------------------------------------------------------------ */

function cellKey(c, r) { return `${c},${r}`; }

/** 依人數切隊：4 人 → 2 隊×2；5 人 → 2+3；6+ → 3 隊等分。 */
export function partitionTeams(players) {
  const n = players.length;
  let teamCount;
  if (n <= 2) teamCount = n;                 // 1v1 或 1 人（trivial）
  else if (n === 3) teamCount = 3;           // 三方 1v1v1
  else if (n === 4) teamCount = 2;           // 2v2
  else teamCount = Math.min(MAX_TEAMS, Math.ceil(n / 2));
  const teams = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push({
      id: i,
      name: TEAM_COLORS[i].name,
      color: { base: TEAM_COLORS[i].base, deep: TEAM_COLORS[i].deep, edge: TEAM_COLORS[i].edge },
      playerIds: [],
    });
  }
  players.forEach((p, idx) => {
    const tid = idx % teamCount;
    teams[tid].playerIds.push(p.id);
  });
  return teams;
}

export function createInitialState(players, config = {}, startedAtMs = Date.now()) {
  const teams = partitionTeams(players);
  const state = {
    phase: 'playing',
    tick: 0,
    startedAtMs,
    roundEndsAtMs: startedAtMs + ROUND_DURATION_MS,
    gameType: GAME_ID,
    config: {},
    teams,
    players: {},
    cells: {},
    nextCaptureId: 1,
    events: [],
  };
  // 每隊分 spawn 區域：沿邊緣等分
  const spawnsByTeam = allocateSpawns(teams);
  for (const team of teams) {
    const spawns = spawnsByTeam[team.id] ?? [];
    team.playerIds.forEach((pid, i) => {
      const spec = players.find(p => p.id === pid);
      const [cx, cy] = spawns[i % spawns.length] ?? [0, 0];
      state.players[pid] = {
        id: pid,
        characterId: spec?.characterId,
        teamId: team.id,
        x: cx + 0.5, y: cy + 0.5,
        moveX: 0, moveY: 0,
        aimAngle: 0, facing: 0,
        alive: true, paused: false,
      };
      // spawn 本格直接被自己隊色佔領
      state.cells[cellKey(cx, cy)] = team.id;
    });
  }
  return state;
}

function allocateSpawns(teams) {
  const map = {};
  const edge = 1;
  const cornerPool = {
    0: [[edge, edge], [edge + 2, edge], [edge, edge + 2]],                                 // 左上
    1: [[ARENA_COLS - 1 - edge, ARENA_ROWS - 1 - edge], [ARENA_COLS - 3 - edge, ARENA_ROWS - 1 - edge], [ARENA_COLS - 1 - edge, ARENA_ROWS - 3 - edge]],  // 右下
    2: [[ARENA_COLS - 1 - edge, edge], [ARENA_COLS - 3 - edge, edge], [ARENA_COLS - 1 - edge, edge + 2]],  // 右上
  };
  for (const team of teams) {
    map[team.id] = cornerPool[team.id] ?? cornerPool[0];
  }
  return map;
}

/* ------------------------------------------------------------
   applyInput — Territory 只用 moveX/moveY（無射擊、無技能）
   ------------------------------------------------------------ */
export function applyInput(state, playerId, input, now, _rng) {
  const p = state.players[playerId];
  if (!p || !p.alive || p.paused) return state;
  const mx = input.moveX ?? 0, my = input.moveY ?? 0;
  const len = Math.hypot(mx, my);
  if (len > 0) { p.moveX = mx / len; p.moveY = my / len; }
  else { p.moveX = 0; p.moveY = 0; }
  if (typeof input.aimAngle === 'number') {
    p.aimAngle = input.aimAngle;
    p.facing = input.aimAngle;
  }
  return state;
}

/* ------------------------------------------------------------
   resolveTick：移動 + 塗色 + flood fill
   ------------------------------------------------------------ */
export function resolveTick(state, now, _rng = Math.random) {
  const dt = TICK_MS / 1000;
  state.tick += 1;

  const paintedNow = [];
  // 移動 + 紀錄經過的 cell
  for (const p of Object.values(state.players)) {
    if (!p.alive || p.paused) continue;
    const step = MOVE_SPEED * dt;
    p.x = clamp(p.x + p.moveX * step, PLAYER_RADIUS, ARENA_COLS - PLAYER_RADIUS);
    p.y = clamp(p.y + p.moveY * step, PLAYER_RADIUS, ARENA_ROWS - PLAYER_RADIUS);
  }

  // 軟碰撞（player↔player push-apart）：避免兩個玩家疊在同一格造成視覺卡住。
  // 跑 2 次 pass 讓多玩家疊加也能收斂。
  const minDist = PLAYER_RADIUS * 2;
  const minDistSq = minDist * minDist;
  for (let pass = 0; pass < 2; pass++) {
    const entries = Object.values(state.players).filter(p => p.alive && !p.paused);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dSq = dx * dx + dy * dy;
        if (dSq >= minDistSq) continue;
        // 疊在同點（d≈0）時隨機指派方向
        let d = Math.sqrt(dSq);
        if (d < 1e-6) {
          dx = 0.01 * (i < j ? 1 : -1);
          dy = 0.01 * (i < j ? 1 : -1);
          d = Math.hypot(dx, dy);
        }
        const overlap = minDist - d;
        const push = overlap / 2 + 0.001;
        a.x = clamp(a.x - (dx / d) * push, PLAYER_RADIUS, ARENA_COLS - PLAYER_RADIUS);
        a.y = clamp(a.y - (dy / d) * push, PLAYER_RADIUS, ARENA_ROWS - PLAYER_RADIUS);
        b.x = clamp(b.x + (dx / d) * push, PLAYER_RADIUS, ARENA_COLS - PLAYER_RADIUS);
        b.y = clamp(b.y + (dy / d) * push, PLAYER_RADIUS, ARENA_ROWS - PLAYER_RADIUS);
      }
    }
  }

  // 碰撞後才結算所在 cell 的塗色（避免碰撞前塗錯格）
  // 每個 player 一個 paint event，帶 playerId → match stats 可精準歸責
  for (const p of Object.values(state.players)) {
    if (!p.alive || p.paused) continue;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const key = cellKey(cx, cy);
    const prev = state.cells[key];
    if (prev !== p.teamId) {
      state.cells[key] = p.teamId;
      paintedNow.push({ key, cx, cy, teamId: p.teamId, playerId: p.id });
      state.events.push({ type: 'paint', playerId: p.id, teamId: p.teamId, cells: [[cx, cy]] });
    }
  }

  // 每個剛剛塗色的隊伍跑一次 flood fill 檢查封閉區塊
  const touchedTeams = new Set(paintedNow.map(pp => pp.teamId));
  for (const teamId of touchedTeams) {
    const captured = captureEnclosed(state, teamId);
    if (captured.length) {
      state.events.push({ type: 'area_captured', teamId, cells: captured.map(([c, r]) => [c, r]) });
    }
  }

  // 結束條件：時限到
  if (now >= state.roundEndsAtMs) {
    state.phase = 'ended';
  }

  return { state };
}

/**
 * Flood fill：對所有非 teamId 的 cell（包含空白），以「地圖邊緣」為外界。
 * 若某 cell 透過上下左右連通路徑可以到達邊緣且不跨過 teamId → 它仍是外界，不捕獲。
 * 不能到邊緣的連通區塊 → 整塊翻成 teamId 並記錄被捕 cells 回傳。
 */
function captureEnclosed(state, teamId) {
  const outside = new Set();    // 已證明可以到邊緣的 cell
  const inside = new Set();     // 已證明被 teamId 完全包圍的 cell
  const visiting = new Set();

  function reachesBoundary(startC, startR) {
    if (outside.has(cellKey(startC, startR))) return true;
    if (inside.has(cellKey(startC, startR))) return false;
    const stack = [[startC, startR]];
    const localVisited = new Set([cellKey(startC, startR)]);
    let touched = false;
    while (stack.length) {
      const [c, r] = stack.pop();
      // 若在邊界格 → 摸到外界
      if (c === 0 || c === ARENA_COLS - 1 || r === 0 || r === ARENA_ROWS - 1) {
        touched = true;
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= ARENA_COLS || nr < 0 || nr >= ARENA_ROWS) { touched = true; continue; }
        const nk = cellKey(nc, nr);
        if (localVisited.has(nk)) continue;
        if (state.cells[nk] === teamId) continue;   // teamId 是牆
        localVisited.add(nk);
        stack.push([nc, nr]);
      }
    }
    if (touched) {
      for (const k of localVisited) outside.add(k);
      return true;
    } else {
      for (const k of localVisited) inside.add(k);
      return false;
    }
  }

  // 掃整張 map，對每個非 teamId 的 cell 做連通測試
  const captured = [];
  for (let c = 0; c < ARENA_COLS; c++) {
    for (let r = 0; r < ARENA_ROWS; r++) {
      const k = cellKey(c, r);
      if (state.cells[k] === teamId) continue;
      if (outside.has(k) || inside.has(k)) continue;
      if (!reachesBoundary(c, r)) {
        // 這個連通塊被包圍 → 全翻成 teamId
        // 但我們 inside set 是局部的，只能在 reachesBoundary 裡標註。
        // 這裡直接從 inside set 把還沒捕獲的撿出來翻色：
      }
    }
  }
  for (const k of inside) {
    if (state.cells[k] !== teamId) {
      state.cells[k] = teamId;
      const [c, r] = k.split(',').map(Number);
      captured.push([c, r]);
    }
  }
  return captured;
}

/* ------------------------------------------------------------
   Queries / payload
   ------------------------------------------------------------ */
export function aliveCount(state) {
  return Object.values(state.players).filter(p => p.alive).length;
}

export function countByTeam(state) {
  const counts = state.teams.map(() => 0);
  for (const t of Object.values(state.cells)) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export function getWinner(state) {
  // 結束後回最大佔地那隊的第一個 playerId
  const counts = countByTeam(state);
  let best = -1, bestN = -1;
  counts.forEach((n, i) => { if (n > bestN) { bestN = n; best = i; } });
  if (best < 0) return null;
  return state.teams[best]?.playerIds?.[0] ?? null;
}

/** SNAPSHOT：cells 是 sparse object，直接送（key 數量通常 < 286，可接受）。 */
export function buildSnapshotPayload(state, newEvents) {
  return {
    tick: state.tick,
    phase: state.phase,
    startedAtMs: state.startedAtMs,
    roundEndsAtMs: state.roundEndsAtMs,
    players: state.players,
    teams: state.teams,
    cells: state.cells,
    counts: countByTeam(state),
    events: newEvents,
  };
}

export function buildMatchStartPayload(state, config) {
  return {
    gameType: GAME_ID,
    config: config ?? {},
    state: {
      ...state,
    },
  };
}
