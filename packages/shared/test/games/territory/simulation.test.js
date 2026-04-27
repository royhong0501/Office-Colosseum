import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, countByTeam, partitionTeams,
  buildSnapshotPayload, buildMatchStartPayload,
  ARENA_COLS, ARENA_ROWS, MAX_TEAMS, ROUND_DURATION_MS,
} from '../../../src/games/territory/index.js';
import { TICK_MS } from '../../../src/constants.js';

function emptyInput(over = {}) {
  return { seq: 1, moveX: 0, moveY: 0, aimAngle: 0, ...over };
}

const players4 = [
  { id: 'p1', characterId: 'munchkin' },
  { id: 'p2', characterId: 'persian' },
  { id: 'p3', characterId: 'husky' },
  { id: 'p4', characterId: 'shiba' },
];
const players6 = [
  ...players4,
  { id: 'p5', characterId: 'corgi' },
  { id: 'p6', characterId: 'poodle' },
];

test('partitionTeams：4 人 → 2 隊', () => {
  const teams = partitionTeams(players4);
  assert.equal(teams.length, 2);
  assert.equal(teams[0].playerIds.length, 2);
  assert.equal(teams[1].playerIds.length, 2);
});

test('partitionTeams：6 人 → 3 隊 × 2 人', () => {
  const teams = partitionTeams(players6);
  assert.equal(teams.length, 3);
  for (const t of teams) assert.equal(t.playerIds.length, 2);
});

test('partitionTeams：3 人 → 3 方各 1 人', () => {
  const teams = partitionTeams([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.equal(teams.length, 3);
});

test('createInitialState：每人被分到一隊，spawn cell 自動塗自己色', () => {
  const s = createInitialState(players4, {}, 0);
  assert.equal(s.phase, 'playing');
  assert.equal(s.teams.length, 2);
  for (const p of Object.values(s.players)) {
    assert.ok(typeof p.teamId === 'number');
  }
  // 應有 4 個 cells 被佔領（每人 spawn 一格）
  assert.equal(Object.keys(s.cells).length, 4);
});

test('移動塗色：走過新 cell 被標記成自己隊色', () => {
  const s = createInitialState(players4, {}, 0);
  const p = s.players.p1;
  p.x = 5.5; p.y = 5.5;
  delete s.cells['5,5'];
  applyInput(s, 'p1', emptyInput({ moveX: 1, moveY: 0 }), 100);
  // 跑幾 tick 讓它移動到下一格
  for (let i = 0; i < 8; i++) resolveTick(s, (i + 1) * TICK_MS);
  // 應該塗了新的 cell
  const paintedKeys = Object.entries(s.cells).filter(([, tid]) => tid === p.teamId).map(([k]) => k);
  assert.ok(paintedKeys.length >= 2, `預期至少 2 格自己隊色，實際 ${paintedKeys.length}`);
});

test('flood fill：畫正方形外框 → 內部被填滿', () => {
  const s = createInitialState(players4, {}, 0);
  const team0 = 0;
  // 手動把一個 5×5 外框塗成 team 0
  for (let c = 2; c <= 6; c++) {
    s.cells[`${c},2`] = team0;
    s.cells[`${c},6`] = team0;
  }
  for (let r = 2; r <= 6; r++) {
    s.cells[`2,${r}`] = team0;
    s.cells[`6,${r}`] = team0;
  }
  // 觸發 flood fill（需要讓 team 0 玩家走過一格才會啟動）
  const p = Object.values(s.players).find(pl => pl.teamId === team0);
  p.x = 5.5; p.y = 5.5;
  applyInput(s, p.id, emptyInput({ moveX: 1 }), 100);
  resolveTick(s, 200);
  // 內部 (3..5, 3..5) 9 格應被填
  let innerCount = 0;
  for (let c = 3; c <= 5; c++) {
    for (let r = 3; r <= 5; r++) {
      if (s.cells[`${c},${r}`] === team0) innerCount++;
    }
  }
  assert.equal(innerCount, 9, `預期內部 9 格被捕，實際 ${innerCount}`);
});

test('flood fill：外框沒封閉 → 不捕獲', () => {
  const s = createInitialState(players4, {}, 0);
  const team0 = 0;
  for (let c = 2; c <= 6; c++) {
    s.cells[`${c},2`] = team0;
    s.cells[`${c},6`] = team0;
  }
  // 故意漏 (2, 4)（缺口）
  for (let r = 2; r <= 6; r++) {
    if (r !== 4) s.cells[`2,${r}`] = team0;
    s.cells[`6,${r}`] = team0;
  }
  const p = Object.values(s.players).find(pl => pl.teamId === team0);
  p.x = 5.5; p.y = 5.5;
  applyInput(s, p.id, emptyInput({ moveX: 1 }), 100);
  resolveTick(s, 200);
  // 內部不該被填
  assert.notEqual(s.cells['3,3'], team0, '有缺口不該被捕獲');
});

test('countByTeam：正確計數', () => {
  const s = createInitialState(players4, {}, 0);
  const counts = countByTeam(s);
  assert.equal(counts.length, 2);
  assert.equal(counts[0] + counts[1], 4);
});

test('getWinner：佔地最多那隊的第一個 player', () => {
  const s = createInitialState(players4, {}, 0);
  // 手動讓 team 1 佔 100 格
  for (let i = 0; i < 100; i++) {
    const c = i % ARENA_COLS, r = Math.floor(i / ARENA_COLS);
    s.cells[`${c},${r}`] = 1;
  }
  const winner = getWinner(s);
  // 勝者應是 team 1 的某個玩家
  assert.ok(s.teams[1].playerIds.includes(winner));
});

test('軟碰撞：兩個玩家走到同一點會被推開（不再疊在同位置）', () => {
  const s = createInitialState(players4, {}, 0);
  const a = s.players.p1, b = s.players.p2;
  // 強制疊在同一點
  a.x = 5; a.y = 5;
  b.x = 5; b.y = 5;
  resolveTick(s, 100);
  const dx = a.x - b.x, dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  assert.ok(dist > 0.5, `碰撞後距離應 > 0.5，實際 ${dist.toFixed(3)}`);
});

test('軟碰撞：兩玩家靠近到重疊會被分開', () => {
  const s = createInitialState(players4, {}, 0);
  const a = s.players.p1, b = s.players.p2;
  a.x = 5; a.y = 5;
  b.x = 5.2; b.y = 5;  // 距離 0.2 < 2*PLAYER_RADIUS
  resolveTick(s, 100);
  const dx = a.x - b.x, dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  assert.ok(dist >= 0.78, `碰撞後距離應接近 2*PLAYER_RADIUS=0.8，實際 ${dist.toFixed(3)}`);
});

test('時限到 → ended', () => {
  const s = createInitialState(players4, {}, 0);
  resolveTick(s, ROUND_DURATION_MS + 1);
  assert.equal(s.phase, 'ended');
});

test('aliveCount：alive=false 不算', () => {
  const s = createInitialState(players4, {}, 0);
  assert.equal(aliveCount(s), 4);
  s.players.p1.alive = false;
  assert.equal(aliveCount(s), 3);
});

test('partitionTeams：5 人（奇數）→ 3 隊（不對稱分配但都有人）', () => {
  const teams = partitionTeams([
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
  ]);
  assert.ok(teams.length >= 2 && teams.length <= MAX_TEAMS);
  const total = teams.reduce((s, t) => s + t.playerIds.length, 0);
  assert.equal(total, 5);
  for (const t of teams) {
    assert.ok(t.playerIds.length >= 1, `每隊至少 1 人，team ${t.id} 是 ${t.playerIds.length}`);
  }
});

test('buildSnapshotPayload：含 counts / teams / events，但不含 cells（client 走 events 增量）', () => {
  const s = createInitialState(players4, {}, 0);
  const events = [{ type: 'paint', cells: [[0, 0, 0]] }];
  const payload = buildSnapshotPayload(s, events);
  assert.equal(payload.tick, s.tick);
  assert.equal(payload.phase, 'playing');
  assert.equal(payload.startedAtMs, 0);
  assert.equal(payload.roundEndsAtMs, ROUND_DURATION_MS);
  assert.ok(payload.players);
  assert.ok(payload.teams);
  assert.equal(payload.cells, undefined);
  assert.ok(Array.isArray(payload.counts));
  assert.equal(payload.counts.length, 2);
  assert.deepEqual(payload.events, events);
});

test('buildMatchStartPayload：含 gameType / state', () => {
  const s = createInitialState(players4, {}, 0);
  const payload = buildMatchStartPayload(s, { foo: 'bar' });
  assert.equal(payload.gameType, 'territory');
  assert.deepEqual(payload.config, { foo: 'bar' });
  assert.equal(payload.state.phase, 'playing');
  assert.equal(payload.state.teams.length, 2);
});

test('paused 玩家：移動跳過但 alive=true 保留', () => {
  const s = createInitialState(players4, {}, 0);
  const p = s.players.p1;
  p.paused = true;
  const beforeX = p.x;
  applyInput(s, 'p1', emptyInput({ moveX: 1 }), 100);
  resolveTick(s, 200);
  assert.equal(p.x, beforeX, 'paused 不能移動');
  assert.equal(p.alive, true, 'paused 不影響 alive');
});
