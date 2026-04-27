import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner,
  MAPS, expandCovers,
  MAX_HP, BULLET_DMG, DASH_CELLS,
  SHIELD_MAX_HP, SHIELD_BREAK_LOCK_MS,
  POISON_DPS, POISON_SEVERE_MULT, POISON_START_MS, POISON_WAVE_INTERVAL_MS,
  ARENA_COLS, ARENA_ROWS,
  SHOOT_CD_MS, DASH_CD_MS, DASH_INVULN_MS,
  MOVE_SPEED, MOVE_SPEED_SHIELD,
  stepPredictLocal, stepPlayerMovement, tryFireBullet,
  buildSnapshotPayload,
} from '../../../src/games/br/index.js';
import { TICK_MS } from '../../../src/constants.js';

const startedAtMs = 0;
const players2 = [
  { id: 'p1', characterId: 'munchkin' },
  { id: 'p2', characterId: 'husky' },
];
const config0 = { mapId: MAPS[0].id };

function emptyInput(over = {}) {
  return { seq: 1, moveX: 0, moveY: 0, aimAngle: 0, attack: false, shield: false, dash: false, ...over };
}

/* ---- createInitialState ---- */

test('createInitialState：玩家分配到 map.spawns、全員滿血', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  assert.equal(s.phase, 'playing');
  assert.equal(Object.keys(s.players).length, 2);
  for (const p of Object.values(s.players)) {
    assert.equal(p.hp, MAX_HP);
    assert.equal(p.alive, true);
    assert.equal(p.shielding, false);
  }
  assert.equal(s.map.id, MAPS[0].id);
  assert.ok(s.map.coversSet instanceof Set);
  assert.ok(s.map.spawns.length >= 2);
});

test('createInitialState：預設 mapId 時挑隨機地圖但不 crash', () => {
  const s = createInitialState(players2, {}, startedAtMs);
  assert.ok(s.map.id);
});

/* ---- applyInput ---- */

test('applyInput：移動向量正規化（對角 45 度）', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  applyInput(s, 'p1', emptyInput({ moveX: 1, moveY: 1 }), 0);
  const p = s.players['p1'];
  assert.ok(Math.abs(Math.hypot(p.moveX, p.moveY) - 1) < 1e-9);
});

test('applyInput：死人輸入無效', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  s.players['p1'].alive = false;
  applyInput(s, 'p1', emptyInput({ moveX: 1 }), 0);
  assert.equal(s.players['p1'].moveX, 0);
});

test('applyInput：攻擊冷卻內不重射', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  applyInput(s, 'p1', emptyInput({ attack: true }), 100);
  assert.equal(s.bullets.length, 1);
  applyInput(s, 'p1', emptyInput({ attack: true }), 200); // 100ms 後
  assert.equal(s.bullets.length, 1, '應仍只有 1 顆（CD 未過）');
  applyInput(s, 'p1', emptyInput({ attack: true }), 100 + SHOOT_CD_MS + 1);
  assert.equal(s.bullets.length, 2);
});

test('applyInput：舉盾 held 正確切換 + 事件', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  applyInput(s, 'p1', emptyInput({ shield: true }), 100);
  assert.equal(s.players['p1'].shielding, true);
  assert.ok(s.events.some(e => e.type === 'shield_on' && e.playerId === 'p1'));
  applyInput(s, 'p1', emptyInput({ shield: false }), 200);
  assert.equal(s.players['p1'].shielding, false);
  assert.ok(s.events.some(e => e.type === 'shield_off' && e.playerId === 'p1'));
});

test('applyInput：dash 一擊推 DASH_CELLS 格 + CD + 無敵', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  // 挑一個開闊無 cover 的位置，面向 +X
  p.x = 1.5; p.y = 1.5; p.aimAngle = 0;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, dash: true }), 500);
  assert.ok(p.x > 1.5 + DASH_CELLS - 0.5, `dash 應大幅向右，實際 x=${p.x}`);
  assert.equal(p.dashCdUntil, 500 + DASH_CD_MS);
  assert.equal(p.invulnUntil, 500 + DASH_INVULN_MS);
  assert.ok(s.events.some(e => e.type === 'dash_move' && e.playerId === 'p1'));
});

test('applyInput：dash CD 內第二次無效', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  p.x = 1.5; p.y = 1.5; p.aimAngle = 0;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, dash: true }), 0);
  const firstX = p.x;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, dash: true }), 500);
  assert.equal(p.x, firstX, 'CD 未過前 dash 應被吃掉');
});

/* ---- resolveTick：移動 ---- */

test('resolveTick：移動被 cover 擋住沿牆滑', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  // 找 map 中一個 cover 的位置，讓玩家站在它的西側 + 往正 +X 壓
  const [cx, cy] = MAPS[0].covers[0]; // [4,3,2,2] → cover at (4..5, 3..4)
  p.x = cx - 0.5; p.y = cy + 0.5; // 貼著 cover 左側
  applyInput(s, 'p1', emptyInput({ moveX: 1, moveY: 0 }), 0);
  const beforeX = p.x;
  resolveTick(s, 100);
  // X 應被擋住大致不動
  assert.ok(Math.abs(p.x - beforeX) < 0.1, 'X 應被 cover 擋住');
});

/* ---- resolveTick：子彈 ---- */

test('resolveTick：子彈命中敵人扣 BULLET_DMG', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const a = s.players['p1'], b = s.players['p2'];
  // 放在開闊區
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  a.aimAngle = 0;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  assert.equal(s.bullets.length, 1);
  // 子彈 BULLET_SPEED=16 cells/sec，3 格距離需 ~0.19s = 6 ticks 左右
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (!b.alive || b.hp < MAX_HP) break;
  }
  assert.equal(b.hp, MAX_HP - BULLET_DMG, `期望 HP = ${MAX_HP - BULLET_DMG}，實際 ${b.hp}`);
});

test('resolveTick：弧內被擊中 → 盾扣 BULLET_DMG、HP 不變', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const a = s.players['p1'], b = s.players['p2'];
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  // a 朝 +X 射；b 面向 -X（朝 a，弧中心線 = π）→ 子彈在弧內
  b.shielding = true;
  b.facing = Math.PI;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (b.shieldHp < SHIELD_MAX_HP) break;
  }
  assert.equal(b.hp, MAX_HP, 'HP 不應變動');
  assert.equal(b.shieldHp, SHIELD_MAX_HP - BULLET_DMG, '盾耐久應扣 BULLET_DMG');
  assert.ok(s.events.some(e => e.type === 'shield_block' && e.defenderId === 'p2'));
});

test('resolveTick：弧外被擊中（背後）→ 盾不變、HP 扣 BULLET_DMG', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const a = s.players['p1'], b = s.players['p2'];
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  // b 面向 +X（背對 a，子彈從 -X 來，差 π → 弧外）
  b.shielding = true;
  b.facing = 0;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (b.hp < MAX_HP) break;
  }
  assert.equal(b.hp, MAX_HP - BULLET_DMG, '弧外應正常扣 BULLET_DMG');
  assert.equal(b.shieldHp, SHIELD_MAX_HP, '盾耐久不應變');
});

test('resolveTick：「最後一擊」免費擋住 → shieldHp=0、shielding=false、shieldBrokenUntil 設好', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const a = s.players['p1'], b = s.players['p2'];
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  b.shielding = true;
  b.facing = Math.PI;
  b.shieldHp = 5;  // 比 BULLET_DMG=14 小 → 觸發最後一擊
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (b.shieldHp === 0) break;
  }
  assert.equal(b.hp, MAX_HP, '最後一擊不該扣 HP');
  assert.equal(b.shieldHp, 0);
  assert.equal(b.shielding, false);
  assert.ok(b.shieldBrokenUntil > 0, 'shieldBrokenUntil 應被設定');
  assert.ok(s.events.some(e => e.type === 'shield_break' && e.playerId === 'p2'));
});

test('applyInput：破盾鎖死期間舉盾無效', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  p.shieldHp = 0;
  p.shieldBrokenUntil = 5000;
  applyInput(s, 'p1', emptyInput({ shield: true }), 1000);   // now < shieldBrokenUntil
  assert.equal(p.shielding, false, '鎖死期間舉盾應被擋下');
});

test('resolveTick：5s 後 shield_recovered + shieldHp 回滿', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  p.shieldHp = 0;
  p.shieldBrokenUntil = 1000;  // 1s 處解鎖
  resolveTick(s, 999);          // 還沒到
  assert.equal(p.shieldHp, 0);
  resolveTick(s, 1000);         // 剛好到
  assert.equal(p.shieldHp, SHIELD_MAX_HP);
  assert.equal(p.shieldBrokenUntil, 0);
  assert.ok(s.events.some(e => e.type === 'shield_recovered' && e.playerId === 'p1'));
});

test('applyInput：舉盾期間 LMB 不射擊（互斥）', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  // 先讓盾真的舉起來（耐久滿、不在鎖死期）
  applyInput(s, 'p1', emptyInput({ shield: true, attack: true, aimAngle: 0 }), 100);
  assert.equal(p.shielding, true);
  assert.equal(s.bullets.length, 0, '舉盾時 LMB 不該發射子彈');
  assert.ok(!s.events.some(e => e.type === 'projectile_spawn'));
});

test('resolveTick：dash 無敵期間不受傷', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const a = s.players['p1'], b = s.players['p2'];
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  b.invulnUntil = 9_999_999; // 超長無敵
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) resolveTick(s, (i + 1) * TICK_MS);
  assert.equal(b.hp, MAX_HP, '無敵期間應不扣血');
});

test('resolveTick：HP<=0 → eliminated event + alive=false', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const b = s.players['p2'];
  b.hp = 5;
  const a = s.players['p1'];
  a.x = 2.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  applyInput(s, 'p1', emptyInput({ aimAngle: 0, attack: true }), 0);
  for (let i = 0; i < 10; i++) {
    resolveTick(s, (i + 1) * TICK_MS);
    if (!b.alive) break;
  }
  assert.equal(b.alive, false);
  assert.ok(s.events.some(e => e.type === 'eliminated' && e.playerId === 'p2'));
});

test('resolveTick：活人 ≤ 1 → phase=ended', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  s.players['p2'].alive = false;
  resolveTick(s, 33);
  assert.equal(s.phase, 'ended');
  assert.equal(aliveCount(s), 1);
  assert.equal(getWinner(s), 'p1');
});

/* ---- resolveTick：毒圈 ---- */

test('resolveTick：毒圈在 POISON_START_MS 後出第 1 波', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  // 開場 tick：不應該有毒
  resolveTick(s, 100);
  assert.equal(s.poison.waveCount, 0);
  // 30s 後：第 1 波
  const rng = () => 0.3; // < 0.6 → 會汙染
  resolveTick(s, POISON_START_MS + 1, rng);
  assert.equal(s.poison.waveCount, 1);
  assert.ok(s.poison.infected.size > 0, '第 1 波應有 infected cells');
  assert.ok(s.events.some(e => e.type === 'poison_wave' && e.waveCount === 1));
});

test('resolveTick：第 2 波會從鄰居擴散（seeded rng）', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const rng = () => 0.3;
  resolveTick(s, POISON_START_MS + 1, rng);
  const before = s.poison.infected.size;
  resolveTick(s, POISON_START_MS + POISON_WAVE_INTERVAL_MS + 2, rng);
  assert.equal(s.poison.waveCount, 2);
  assert.ok(s.poison.infected.size > before, '第 2 波應擴散出更多格');
});

test('resolveTick：站在毒圈上每秒扣 POISON_DPS', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  // 把 (2,2) 設為 infected + 玩家站上去
  s.poison.infected.add('2,2');
  p.x = 2.5; p.y = 2.5;
  p.lastPoisonTickAt = 0;
  resolveTick(s, 1000);
  assert.equal(p.hp, MAX_HP - POISON_DPS);
});

test('resolveTick：severe 格扣血 ×2', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = s.players['p1'];
  s.poison.infected.add('2,2');
  s.poison.severe.add('2,2');
  p.x = 2.5; p.y = 2.5;
  p.lastPoisonTickAt = 0;
  resolveTick(s, 1000);
  assert.equal(p.hp, MAX_HP - POISON_DPS * POISON_SEVERE_MULT);
});

/* ---- Maps ---- */

test('MAPS：5 張地圖都有 covers', () => {
  assert.equal(MAPS.length, 5);
  for (const m of MAPS) {
    assert.ok(m.id && m.name && Array.isArray(m.covers));
    const expanded = expandCovers(m.covers);
    assert.ok(expanded.size > 0);
  }
});

/* ---- RNG reproducibility ---- */

test('RNG：同樣 seed 的 resolveTick 產出可重現的毒圈擴散', () => {
  const s1 = createInitialState(players2, config0, startedAtMs);
  const s2 = createInitialState(players2, config0, startedAtMs);
  let seed1 = 1, seed2 = 1;
  const rng1 = () => { seed1 = (seed1 * 9301 + 49297) % 233280; return seed1 / 233280; };
  const rng2 = () => { seed2 = (seed2 * 9301 + 49297) % 233280; return seed2 / 233280; };
  resolveTick(s1, POISON_START_MS + 1, rng1);
  resolveTick(s2, POISON_START_MS + 1, rng2);
  assert.deepEqual([...s1.poison.infected].sort(), [...s2.poison.infected].sort());
});

/* ---- emote 整合 ---- */

test('br/applyInput：合法 emote → state.events 有 emote 事件', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const before = s.events.length;
  applyInput(s, 'p1', emptyInput({ emote: 6 }), 1000);
  const emoteEvents = s.events.slice(before).filter(e => e.kind === 'emote');
  assert.equal(emoteEvents.length, 1);
  assert.equal(emoteEvents[0].slot, 6);
  assert.equal(emoteEvents[0].playerId, 'p1');
});

test('br/applyInput：玩家死亡仍能 emote（社交訊號）', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  s.players.p1.alive = false;
  applyInput(s, 'p1', emptyInput({ emote: 1 }), 1000);
  const emoteEvents = s.events.filter(e => e.kind === 'emote' && e.playerId === 'p1');
  assert.equal(emoteEvents.length, 1);
});

test('br/applyInput：paused 玩家不能 emote', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  s.players.p1.paused = true;
  applyInput(s, 'p1', emptyInput({ emote: 1 }), 1000);
  const emoteEvents = s.events.filter(e => e.kind === 'emote' && e.playerId === 'p1');
  assert.equal(emoteEvents.length, 0);
});

/* ---- client-side prediction helpers ---- */

test('stepPredictLocal：moveX=1 推進大約 MOVE_SPEED * dt 距離', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = { ...s.players['p1'] };
  // 找一個確定可走的點（地圖左下安全區）
  p.x = 1; p.y = 12; p.moveX = 0; p.moveY = 0;
  const result = stepPredictLocal(p, emptyInput({ moveX: 1, aimAngle: 0 }), TICK_MS, s.map.coversSet, 0);
  const expected = MOVE_SPEED * (TICK_MS / 1000);
  assert.ok(Math.abs(result.player.x - (1 + expected)) < 1e-6, `expected x≈${1 + expected}, got ${result.player.x}`);
  assert.equal(result.ghostBullet, null);
});

test('stepPredictLocal：cover 阻擋方向上不推進', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  // 找一塊 cover，把玩家放它左邊一格內，向右移
  const [cc, cr, cw] = MAPS[0].covers[0]; // [4, 2, 2, 2] 之類
  const p = { ...s.players['p1'] };
  p.x = cc - 0.5;
  p.y = cr + 0.5;  // cover 同一 row
  const before = p.x;
  const result = stepPredictLocal(p, emptyInput({ moveX: 1, aimAngle: 0 }), TICK_MS, s.map.coversSet, 0);
  // 向右會撞到 cover，X 不該推到 cover 內（最多到 cover 邊界）
  assert.ok(result.player.x <= cc - 0.4, `expected x clamped near cover left edge, got ${result.player.x}`);
  // 必須有移動嘗試（即便被擋）— moveX 仍被記成正規化 1
  assert.equal(result.player.moveX, 1);
});

test('stepPredictLocal：attack && CD 過 → 回 ghostBullet 且推 shootCdUntil', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = { ...s.players['p1'] };
  p.x = 5; p.y = 5; p.shootCdUntil = 0;
  const now = 1000;
  const result = stepPredictLocal(p, emptyInput({ attack: true, aimAngle: 0 }), TICK_MS, s.map.coversSet, now);
  assert.ok(result.ghostBullet, 'ghostBullet 應存在');
  assert.equal(result.ghostBullet.ownerId, 'p1');
  assert.equal(result.player.shootCdUntil, now + SHOOT_CD_MS);
});

test('stepPredictLocal：attack 但 CD 未過 → 不開火', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = { ...s.players['p1'] };
  p.x = 5; p.y = 5; p.shootCdUntil = 999;
  const result = stepPredictLocal(p, emptyInput({ attack: true, aimAngle: 0 }), TICK_MS, s.map.coversSet, 500);
  assert.equal(result.ghostBullet, null);
  assert.equal(result.player.shootCdUntil, 999);
});

test('stepPredictLocal：shielding 條件正確（耐久 + 鎖死期）', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p = { ...s.players['p1'] };
  p.shieldHp = 100; p.shieldBrokenUntil = 0;
  let r = stepPredictLocal(p, emptyInput({ shield: true }), TICK_MS, s.map.coversSet, 1000);
  assert.equal(r.player.shielding, true);

  // 鎖死期內舉不起來
  p.shielding = false; p.shieldBrokenUntil = 5000;
  r = stepPredictLocal(p, emptyInput({ shield: true }), TICK_MS, s.map.coversSet, 1000);
  assert.equal(r.player.shielding, false);

  // 耐久=0 舉不起來
  p.shieldBrokenUntil = 0; p.shieldHp = 0;
  r = stepPredictLocal(p, emptyInput({ shield: true }), TICK_MS, s.map.coversSet, 1000);
  assert.equal(r.player.shielding, false);
});

test('stepPredictLocal：dead/paused 不動', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const p1 = { ...s.players['p1'], alive: false };
  const before1 = { x: p1.x, y: p1.y };
  stepPredictLocal(p1, emptyInput({ moveX: 1 }), TICK_MS, s.map.coversSet, 0);
  assert.equal(p1.x, before1.x);
  assert.equal(p1.y, before1.y);

  const p2 = { ...s.players['p1'], paused: true };
  const before2 = { x: p2.x, y: p2.y };
  stepPredictLocal(p2, emptyInput({ moveX: 1 }), TICK_MS, s.map.coversSet, 0);
  assert.equal(p2.x, before2.x);
  assert.equal(p2.y, before2.y);
});

test('stepPredictLocal：與 server 路徑（applyInput+resolveTick）位移結果一致', () => {
  // 同樣的初始 state + input，跑 server 路徑 vs predict 路徑，alive 玩家位置應相同
  const s1 = createInitialState(players2, config0, startedAtMs);
  const s2 = createInitialState(players2, config0, startedAtMs);
  const input = { seq: 1, moveX: 1, moveY: 0, aimAngle: 0, attack: false, shield: false, dash: false };
  // server 路徑
  applyInput(s1, 'p1', input, 0);
  resolveTick(s1, 0);
  // predict 路徑
  const p2 = s2.players['p1'];
  stepPredictLocal(p2, input, TICK_MS, s2.map.coversSet, 0);
  assert.ok(Math.abs(s1.players['p1'].x - p2.x) < 1e-6, `server.x=${s1.players['p1'].x} vs predict.x=${p2.x}`);
  assert.ok(Math.abs(s1.players['p1'].y - p2.y) < 1e-6);
});

test('buildSnapshotPayload：opts.acks 正確包進 payload，舊 caller 不影響', () => {
  const s = createInitialState(players2, config0, startedAtMs);
  const noAck = buildSnapshotPayload(s, []);
  assert.equal('acks' in noAck, false, '舊 caller 不傳 opts → payload 不應有 acks key');
  const withAck = buildSnapshotPayload(s, [], { acks: { p1: 42 } });
  assert.deepEqual(withAck.acks, { p1: 42 });
});
