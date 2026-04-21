# 電腦玩家（Bot）實作 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加入 server 端的 bot 玩家，讓 host 可以在 lobby 手動加入／移除隨機角色的電腦對手，戰鬥中 bot 會朝最近敵人移動、對齊後開火、用技能。

**Architecture:** Bot 是 `Lobby.players` 裡的一筆 `isBot: true` entry（id 形如 `bot-1`），無 socket；AI 邏輯是 `packages/server/src/bot.js` 的純函式 `decideBotInput(state, botId, now)`，在 `Match.tick` 中為每個 bot 逐 tick 呼叫，產生的 input 形狀跟真人 INPUT 完全相同走同一條 `applyInput` 路徑。

**Tech Stack:** Node 18+ / ES modules / socket.io / `node:test` / React 18 / Vite

**Spec:** `docs/superpowers/specs/2026-04-21-bot-players-design.md`

---

## Prerequisite（開始前請確認）

工作目錄有未 commit 的 projectile-combat 改動（packages/client/index.html, NetworkedBattle.jsx, ArenaGrid.jsx, useInputCapture.js, match.js, lobby.js, constants.js, simulation.js, simulation.test.js）以及未追蹤的 `packages/client/src/components/PixelCharacter.jsx` 與 `fly.toml`。

**Plan 假設這些改動已經存在（spec 就是基於此狀態撰寫）。** 開工前決定：

- 選項 A（推薦）：先把這些 projectile-combat 改動成一個 commit，plan 的 task 在其上疊加。
- 選項 B：把 plan 的改動混進既有未 commit 的改動中。**不推薦**，會讓 bot 功能 review 變亂。

如果選 A，第一件事：

```bash
git add packages/client packages/server packages/shared fly.toml
git commit -m "feat: projectile-based combat + pixel character renderer + fly.io config"
```

確認 `npm test` 過、`npm run build` 過，再進 Task 1。

---

## Task 1：加 server 的 test npm script

**為什麼**：Server package 目前只有 `smoke` 可跑，後續 task 要用 `node:test` 寫 `bot.test.js` 與 `lobby.test.js`，需要一個能批次跑的 `test` script。

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1：改 `packages/server/package.json` 的 `scripts`**

把現有的 `scripts` 區塊：

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "node --watch src/index.js",
  "smoke": "node test/smoke.js"
}
```

改成：

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "node --watch src/index.js",
  "test": "node --test test/*.test.js",
  "smoke": "node test/smoke.js"
}
```

**注意**：glob 是 `test/*.test.js`（只抓 `.test.js`），因為 `test/smoke.js` 不是 `node:test` 格式，抓到會 error。

- [ ] **Step 2：驗證 script 存在且不 crash**

```bash
npm test --workspace @office-colosseum/server
```

Expected output（目前沒有任何 `.test.js`）：

```
# tests 0
# suites 0
# pass 0
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

（exit code 0）

- [ ] **Step 3：Commit**

```bash
git add packages/server/package.json
git commit -m "chore(server): add node:test script for unit tests"
```

---

## Task 2：加 ADD_BOT / REMOVE_BOT 協定常數 + Lobby.join 顯式 isBot

**為什麼**：所有 bot 相關 socket event 名稱都要從 `MSG` 走（CLAUDE.md 慣例）。同時把 `Lobby.join` 新建的 entry 加上 `isBot: false`，讓 schema 顯式一致。

**Files:**
- Modify: `packages/shared/src/protocol.js`
- Modify: `packages/server/src/lobby.js:15`

- [ ] **Step 1：改 `packages/shared/src/protocol.js`**

把檔案完整取代為：

```js
export const MSG = {
  JOIN: 'join',
  LOBBY_STATE: 'lobby_state',
  PICK: 'pick_character',
  READY: 'ready',
  START: 'start_match',
  MATCH_START: 'match_start',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  MATCH_END: 'match_end',
  PAUSED: 'paused',
  LEAVE: 'leave',
  ERROR: 'error',
  ADD_BOT: 'add_bot',
  REMOVE_BOT: 'remove_bot',
};
```

- [ ] **Step 2：改 `packages/server/src/lobby.js`，讓 `join` 顯式設 `isBot: false`**

把 line 15：

```js
this.players.set(socketId, { id: socketId, name, characterId: null, ready: false, isHost });
```

改成：

```js
this.players.set(socketId, { id: socketId, name, characterId: null, ready: false, isHost, isBot: false });
```

順便改 line 6 的註解：

```js
this.players = new Map();  // socketId -> { id, name, characterId, ready, isHost, isBot }
```

- [ ] **Step 3：驗證現有測試沒壞**

```bash
npm test
```

Expected：shared 的 `simulation.test.js` 所有 test 都過。server 測試還是 0。

- [ ] **Step 4：Commit**

```bash
git add packages/shared/src/protocol.js packages/server/src/lobby.js
git commit -m "feat(protocol): add ADD_BOT/REMOVE_BOT events; add isBot field to Lobby entries"
```

---

## Task 3：Lobby.addBot（含測試）

**為什麼**：建立加入 bot 的 server 行為，測試先行。

**Files:**
- Create: `packages/server/test/lobby.test.js`
- Modify: `packages/server/src/lobby.js`（加 import、`nextBotSeq`、`addBot`）

- [ ] **Step 1：建 `packages/server/test/lobby.test.js`，寫測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../src/lobby.js';
import { MAX_PLAYERS, ALL_CHARACTERS } from '@office-colosseum/shared';

// Stub io — addBot/removeBot 會呼叫 broadcast() → io.emit()
function makeIo() {
  const emitted = [];
  return { emit: (event, payload) => emitted.push({ event, payload }), emitted };
}

test('addBot: 非 host 呼叫回 not_host', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const result = lobby.addBot('socket-guest');
  assert.deepEqual(result, { error: 'not_host' });
  assert.equal(lobby.players.size, 2);
});

test('addBot: lobby 滿了回 lobby_full', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  for (let i = 0; i < MAX_PLAYERS; i++) lobby.join(`s${i}`, `P${i}`);
  const result = lobby.addBot('s0');
  assert.deepEqual(result, { error: 'lobby_full' });
  assert.equal(lobby.players.size, MAX_PLAYERS);
});

test('addBot: host 呼叫成功、entry 有 isBot/ready/characterId/isHost: false', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const result = lobby.addBot('socket-host');
  assert.equal(result.ok, true);
  assert.ok(result.botId.startsWith('bot-'));
  const bot = lobby.players.get(result.botId);
  assert.equal(bot.isBot, true);
  assert.equal(bot.ready, true);
  assert.equal(bot.isHost, false);
  assert.ok(ALL_CHARACTERS.some(c => c.id === bot.characterId), 'characterId 必須是合法角色');
  assert.equal(bot.name, 'Bot-1');
});

test('addBot: 連加 3 個，id 與 name 都跟著 seq', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const r1 = lobby.addBot('socket-host');
  const r2 = lobby.addBot('socket-host');
  const r3 = lobby.addBot('socket-host');
  assert.equal(r1.botId, 'bot-1');
  assert.equal(r2.botId, 'bot-2');
  assert.equal(r3.botId, 'bot-3');
  assert.equal(lobby.players.get('bot-2').name, 'Bot-2');
});
```

- [ ] **Step 2：跑測試確認失敗（因為還沒實作 addBot）**

```bash
npm test --workspace @office-colosseum/server
```

Expected：4 個 test FAIL，錯誤類似 `TypeError: lobby.addBot is not a function`。

- [ ] **Step 3：實作 `addBot`**

改 `packages/server/src/lobby.js`：

把檔頭 import 改成：

```js
import { MAX_PLAYERS, MIN_PLAYERS, MSG, ALL_CHARACTERS } from '@office-colosseum/shared';
```

把 `constructor` 加一欄 `nextBotSeq`：

```js
constructor(io) {
  this.io = io;
  this.players = new Map();  // socketId -> { id, name, characterId, ready, isHost, isBot }
  this.nextBotSeq = 1;
}
```

在 `canStart()` 之後（line 39 之後）加 `addBot` 方法：

```js
addBot(requesterId) {
  const requester = this.players.get(requesterId);
  if (!requester?.isHost) return { error: 'not_host' };
  if (this.players.size >= MAX_PLAYERS) return { error: 'lobby_full' };
  const seq = this.nextBotSeq++;
  const id = `bot-${seq}`;
  const character = ALL_CHARACTERS[Math.floor(Math.random() * ALL_CHARACTERS.length)];
  this.players.set(id, {
    id,
    name: `Bot-${seq}`,
    characterId: character.id,
    ready: true,
    isHost: false,
    isBot: true,
  });
  this.broadcast();
  return { ok: true, botId: id };
}
```

- [ ] **Step 4：跑測試確認 4 個 test 都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 4` / `# fail 0`。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/lobby.js packages/server/test/lobby.test.js
git commit -m "feat(lobby): addBot — host adds random-character bot, returns botId or error"
```

---

## Task 4：Lobby.removeBot（含測試）

**Files:**
- Modify: `packages/server/test/lobby.test.js`
- Modify: `packages/server/src/lobby.js`

- [ ] **Step 1：在 `lobby.test.js` 末尾追加 removeBot 測試**

```js
test('removeBot: 非 host 回 not_host', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const addResult = lobby.addBot('socket-host');
  const result = lobby.removeBot('socket-guest', addResult.botId);
  assert.deepEqual(result, { error: 'not_host' });
  assert.equal(lobby.players.has(addResult.botId), true);
});

test('removeBot: 目標不是 bot 回 not_bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const result = lobby.removeBot('socket-host', 'socket-guest');
  assert.deepEqual(result, { error: 'not_bot' });
  assert.equal(lobby.players.has('socket-guest'), true);
});

test('removeBot: host 成功移除 bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const addResult = lobby.addBot('socket-host');
  const result = lobby.removeBot('socket-host', addResult.botId);
  assert.deepEqual(result, { ok: true });
  assert.equal(lobby.players.has(addResult.botId), false);
});

test('removeBot: 不存在的 botId 回 not_bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const result = lobby.removeBot('socket-host', 'bot-999');
  assert.deepEqual(result, { error: 'not_bot' });
});
```

- [ ] **Step 2：跑測試確認新增 4 個 test FAIL**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 4` / `# fail 4`，失敗訊息 `lobby.removeBot is not a function`。

- [ ] **Step 3：實作 `removeBot`**

在 `packages/server/src/lobby.js` 的 `addBot` 方法之後追加：

```js
removeBot(requesterId, botId) {
  const requester = this.players.get(requesterId);
  if (!requester?.isHost) return { error: 'not_host' };
  const target = this.players.get(botId);
  if (!target?.isBot) return { error: 'not_bot' };
  this.players.delete(botId);
  this.broadcast();
  return { ok: true };
}
```

- [ ] **Step 4：跑測試確認 8 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 8` / `# fail 0`。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/lobby.js packages/server/test/lobby.test.js
git commit -m "feat(lobby): removeBot — host removes bot slot, reject non-bot targets"
```

---

## Task 5：Lobby bot 清理（resetForNewMatch + leave 全 bot 情境）

**為什麼**：新 match 開始前清掉所有 bot；真人全部離開後也清掉殘留 bot（避免空 lobby 卡 bot 繼續存在）。

**Files:**
- Modify: `packages/server/test/lobby.test.js`
- Modify: `packages/server/src/lobby.js`

- [ ] **Step 1：在 `lobby.test.js` 末尾追加 cleanup 測試**

```js
test('resetForNewMatch: 清掉所有 bot、重置 nextBotSeq、保留真人 characterId', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.pick('socket-host', ALL_CHARACTERS[0].id);
  lobby.setReady('socket-host', true);
  lobby.addBot('socket-host');
  lobby.addBot('socket-host');
  assert.equal(lobby.players.size, 3);

  lobby.resetForNewMatch();

  assert.equal(lobby.players.size, 1);
  assert.equal(lobby.players.get('socket-host').characterId, ALL_CHARACTERS[0].id);
  assert.equal(lobby.players.get('socket-host').ready, false);
  assert.equal(lobby.nextBotSeq, 1);

  // 再加一個 bot，應該從 bot-1 開始
  const r = lobby.addBot('socket-host');
  assert.equal(r.botId, 'bot-1');
});

test('leave: host 走後還有真人，bot 保留', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  lobby.addBot('socket-host');
  lobby.leave('socket-host');
  assert.equal(lobby.players.size, 2);
  assert.equal(lobby.players.get('socket-guest').isHost, true);
  assert.ok([...lobby.players.values()].some(p => p.isBot));
});

test('leave: 真人全走了，bot 全清', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.addBot('socket-host');
  lobby.addBot('socket-host');
  assert.equal(lobby.players.size, 3);
  lobby.leave('socket-host');
  assert.equal(lobby.players.size, 0);
});
```

- [ ] **Step 2：跑測試確認新 test FAIL**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 8` / `# fail 3`。前兩個會因為 `resetForNewMatch` 沒清 bot 而 fail；第三個會因為 `leave` 沒清 bot 而 fail。

- [ ] **Step 3：改 `resetForNewMatch`**

`packages/server/src/lobby.js` 的 `resetForNewMatch` 改成：

```js
resetForNewMatch() {
  for (const [id, p] of this.players) {
    if (p.isBot) {
      this.players.delete(id);
    } else {
      p.ready = false;
      // keep characterId so players don't have to re-pick
    }
  }
  this.nextBotSeq = 1;
  this.broadcast();
}
```

- [ ] **Step 4：改 `leave` — 真人全走時清 bot**

`packages/server/src/lobby.js` 的 `leave` 改成：

```js
leave(socketId) {
  const wasHost = this.players.get(socketId)?.isHost;
  this.players.delete(socketId);
  // 如果沒有真人剩下，清掉所有 bot（空 lobby 保留 bot 無意義）
  const hasRealPlayer = [...this.players.values()].some(p => !p.isBot);
  if (!hasRealPlayer) {
    for (const [id, p] of this.players) {
      if (p.isBot) this.players.delete(id);
    }
  } else if (wasHost) {
    // 把 host 權遞給第一個真人（不是 bot）
    const nextHost = [...this.players.values()].find(p => !p.isBot);
    if (nextHost) nextHost.isHost = true;
  }
  this.broadcast();
}
```

- [ ] **Step 5：跑測試確認全部 11 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 11` / `# fail 0`。

- [ ] **Step 6：Commit**

```bash
git add packages/server/src/lobby.js packages/server/test/lobby.test.js
git commit -m "feat(lobby): cleanup bots on resetForNewMatch and when no real players remain"
```

---

## Task 6：socketHandlers 接上 ADD_BOT / REMOVE_BOT + ERROR emit

**為什麼**：讓 client 的 emit 真正跑到 Lobby 方法，並把 `{error: code}` 轉成 ERROR event 送回。

**Files:**
- Modify: `packages/server/src/socketHandlers.js`

- [ ] **Step 1：加 ADD_BOT / REMOVE_BOT handler**

把 `packages/server/src/socketHandlers.js` 檔案完整取代為：

```js
import { MSG } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';

export function registerSocketHandlers(io) {
  const lobby = new Lobby(io);
  let match = null;

  function replyError(socket, code) {
    socket.emit(MSG.ERROR, { code, msg: code });
  }

  io.on('connection', socket => {
    socket.on(MSG.JOIN, ({ name }) => lobby.join(socket.id, name || 'Player'));
    socket.on(MSG.PICK, ({ characterId }) => lobby.pick(socket.id, characterId));
    socket.on(MSG.READY, ({ ready }) => lobby.setReady(socket.id, ready));
    socket.on(MSG.START, () => {
      const p = lobby.players.get(socket.id);
      if (!p?.isHost || !lobby.canStart() || match) return;
      match = new Match(io, [...lobby.players.values()], () => {
        match = null;
        lobby.resetForNewMatch();
      });
      match.start();
    });
    socket.on(MSG.INPUT, input => { if (match) match.queueInput(socket.id, input); });
    socket.on(MSG.PAUSED, ({ paused }) => { if (match) match.setPaused(socket.id, paused); });
    socket.on(MSG.LEAVE, () => lobby.leave(socket.id));
    socket.on(MSG.ADD_BOT, () => {
      if (match) return replyError(socket, 'not_in_lobby');
      const result = lobby.addBot(socket.id);
      if (result.error) replyError(socket, result.error);
    });
    socket.on(MSG.REMOVE_BOT, ({ botId }) => {
      if (match) return replyError(socket, 'not_in_lobby');
      const result = lobby.removeBot(socket.id, botId);
      if (result.error) replyError(socket, result.error);
    });
    socket.on('disconnect', () => {
      lobby.leave(socket.id);
      if (match) match.setPaused(socket.id, false);
    });
  });
}
```

- [ ] **Step 2：跑既有 smoke 確認沒打爛**

```bash
npm run smoke --workspace @office-colosseum/server
```

Expected：`SMOKE PASS: lobby updates, match_start received`（兩個真人走完原本的 lobby → match 流程）。

- [ ] **Step 3：Commit**

```bash
git add packages/server/src/socketHandlers.js
git commit -m "feat(server): wire ADD_BOT/REMOVE_BOT to Lobby, emit ERROR on bad requests"
```

---

## Task 7：Bot AI skeleton + idle cases

**為什麼**：先實作最簡單的「沒敵人就 idle」與「自己死了就 idle」分支，建立 `decideBotInput` 檔案骨架。

**Files:**
- Create: `packages/server/test/bot.test.js`
- Create: `packages/server/src/bot.js`

- [ ] **Step 1：建 `packages/server/test/bot.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInput } from '../src/bot.js';
import { createInitialState, ALL_CHARACTERS } from '@office-colosseum/shared';

function makeStateWithTwo(aPos, bPos) {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'enemy', characterId: ALL_CHARACTERS[1].id },
  ]);
  s.players['bot-1'].x = aPos.x;  s.players['bot-1'].y = aPos.y;
  s.players['enemy'].x = bPos.x;  s.players['enemy'].y = bPos.y;
  return s;
}

test('decideBotInput: 自己死了回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['bot-1'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});

test('decideBotInput: me 不存在回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'nonexistent', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});

test('decideBotInput: 沒有敵人活著回 idle', () => {
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  s.players['enemy'].alive = false;
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.deepEqual(input, { seq: 0, dir: null, attack: false, skill: false });
});
```

- [ ] **Step 2：跑測試確認 3 個 FAIL（module not found）**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`Cannot find module ... bot.js` 之類錯誤。

- [ ] **Step 3：建 `packages/server/src/bot.js` skeleton**

```js
/**
 * 決定一個 bot 這個 tick 要做什麼。純函式，不 mutate state。
 * @param {object} state - GameState from shared/simulation.js
 * @param {string} botId - 這個 bot 的 player id
 * @param {number} now - absolute ms timestamp
 * @returns {{ seq: number, dir: string | null, attack: boolean, skill: boolean }}
 */
export function decideBotInput(state, botId, now) {
  const me = state.players[botId];
  if (!me || !me.alive) return idle();

  const target = findNearestEnemy(state, botId);
  if (!target) return idle();

  // TODO(next task): 未對齊時的移動邏輯
  return idle();
}

function idle() {
  return { seq: 0, dir: null, attack: false, skill: false };
}

function findNearestEnemy(state, selfId) {
  const me = state.players[selfId];
  if (!me) return null;
  let best = null, bestDist = Infinity;
  // tie-break 用 id 字串排序（確定性）
  const candidates = Object.values(state.players)
    .filter(p => p.id !== selfId && p.alive)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const p of candidates) {
    const d = Math.abs(p.x - me.x) + Math.abs(p.y - me.y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}
```

- [ ] **Step 4：跑測試確認 3 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 14` / `# fail 0`（11 lobby + 3 bot）。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/bot.js packages/server/test/bot.test.js
git commit -m "feat(bot): skeleton decideBotInput with idle cases (dead/no-target)"
```

---

## Task 8：Bot AI — 未對齊時的移動

**為什麼**：實作 Case 3（`dx !== 0 && dy !== 0`），走較小軸、tie-break 走橫軸。

**Files:**
- Modify: `packages/server/test/bot.test.js`
- Modify: `packages/server/src/bot.js`

- [ ] **Step 1：在 `bot.test.js` 末尾追加測試**

```js
test('decideBotInput: 未對齊時走較小那一軸（dx<dy → 走橫軸）', () => {
  // bot 在 (5,5)，敵人在 (7,9) → dx=2, dy=4 → 走橫軸 right
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 7, y: 9 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, false);
  assert.equal(input.skill, false);
});

test('decideBotInput: 未對齊時走較小那一軸（dy<dx → 走縱軸）', () => {
  // bot 在 (0,3)，敵人在 (10,5) → dx=10, dy=2 → 走縱軸 down
  const s = makeStateWithTwo({ x: 0, y: 3 }, { x: 10, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'down');
});

test('decideBotInput: |dx|===|dy| tie-break 走橫軸', () => {
  // bot 在 (0,0)，敵人在 (5,5) → dx=5, dy=5 → tie → 走 right
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
});

test('decideBotInput: 敵人在左上（dx<0, dy<0）→ 縮較小軸、方向正確', () => {
  // bot 在 (10,9)，敵人在 (8,3) → dx=-2, dy=-6 → 走橫軸 left
  const s = makeStateWithTwo({ x: 10, y: 9 }, { x: 8, y: 3 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'left');
});

test('decideBotInput: 敵人已死 → 切到下個活的', () => {
  const s = createInitialState([
    { id: 'bot-1', characterId: ALL_CHARACTERS[0].id },
    { id: 'dead', characterId: ALL_CHARACTERS[1].id },
    { id: 'alive', characterId: ALL_CHARACTERS[2].id },
  ]);
  s.players['bot-1'].x = 0; s.players['bot-1'].y = 0;
  s.players['dead'].x = 1; s.players['dead'].y = 0; s.players['dead'].alive = false;
  s.players['alive'].x = 6; s.players['alive'].y = 4;
  // nearest alive 是 'alive' 在 (6,4) → dx=6, dy=4 → 走縱軸 down
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'down');
});
```

- [ ] **Step 2：跑測試確認新 test FAIL**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# fail 5`，前 5 個 bot 新測試都 fail（dir 是 null 而不是 right/down 等）。

- [ ] **Step 3：實作未對齊移動**

把 `packages/server/src/bot.js` 的 `decideBotInput` 改成：

```js
export function decideBotInput(state, botId, now) {
  const me = state.players[botId];
  if (!me || !me.alive) return idle();

  const target = findNearestEnemy(state, botId);
  if (!target) return idle();

  const dx = target.x - me.x;
  const dy = target.y - me.y;

  // Case 3: 未對齊 — 縮較小軸（tie 選橫軸）
  if (dx !== 0 && dy !== 0) {
    const dir = Math.abs(dx) <= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    return { seq: 0, dir, attack: false, skill: false };
  }

  // TODO(next task): Case 2 對齊時
  return idle();
}
```

- [ ] **Step 4：跑測試確認 19 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 19` / `# fail 0`（11 lobby + 8 bot）。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/bot.js packages/server/test/bot.test.js
git commit -m "feat(bot): move toward nearest enemy by closing smaller-delta axis"
```

---

## Task 9：Bot AI — 對齊時的開火行為

**為什麼**：實作 Case 2（對齊在 row 或 col 上）。近距離（≤ `PROJECTILE_MAX_DIST`）開火，遠距離繼續推進。

**Files:**
- Modify: `packages/server/test/bot.test.js`
- Modify: `packages/server/src/bot.js`

- [ ] **Step 1：在 `bot.test.js` 追加測試**

先改檔頭 import，加 `PROJECTILE_MAX_DIST`：

```js
import { createInitialState, ALL_CHARACTERS, PROJECTILE_MAX_DIST } from '@office-colosseum/shared';
```

然後在尾端追加：

```js
test('decideBotInput: 對齊同 row 近距離（dy=0, dx=3）→ right + attack + skill', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 8, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 對齊同 col 近距離（dx=0, dy=-4）→ up + attack + skill', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 5, y: 1 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'up');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});

test('decideBotInput: 對齊遠距離（dx=0, dy > PROJECTILE_MAX_DIST）→ 只面向不開火', () => {
  // bot (0,0)、敵人 (0, 9)，但 PROJECTILE_MAX_DIST 是 12，9 < 12 → 會開火
  // 要製造超過 12 的距離需要 arena 外？16x10 arena 最遠 dy = 9
  // 這個 case 只在 dx 維度可能超過：bot (0,0)、enemy (15,0) → dx=15 > 12
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 15, y: 0 });
  assert.ok(15 > PROJECTILE_MAX_DIST, 'sanity: 15 必須大於 MAX_DIST');
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, false);
  assert.equal(input.skill, false);
});

test('decideBotInput: 對齊邊界距離（dx=0, dy = PROJECTILE_MAX_DIST）→ 開火', () => {
  // 在 16x10 arena 做不到 dy=12；用 dx 維度，bot (0,0)、enemy (12,0) → dx=12
  const s = makeStateWithTwo({ x: 0, y: 0 }, { x: 12, y: 0 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, 'right');
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});
```

- [ ] **Step 2：跑測試確認 4 個新 test FAIL**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# fail 4`，fail 訊息類似 `expected 'right' got null`（因為 Case 2 還沒實作，現在走 idle）。

- [ ] **Step 3：實作 Case 2**

把 `packages/server/src/bot.js` 檔頭 import 加進 `PROJECTILE_MAX_DIST`：

```js
import { PROJECTILE_MAX_DIST } from '@office-colosseum/shared';
```

把 `decideBotInput` 改成：

```js
export function decideBotInput(state, botId, now) {
  const me = state.players[botId];
  if (!me || !me.alive) return idle();

  const target = findNearestEnemy(state, botId);
  if (!target) return idle();

  const dx = target.x - me.x;
  const dy = target.y - me.y;

  // Case 2: 對齊（dx===0 or dy===0，且不是同格）
  if ((dx === 0) !== (dy === 0)) {
    const dir = dx === 0
      ? (dy > 0 ? 'down' : 'up')
      : (dx > 0 ? 'right' : 'left');
    const dist = Math.abs(dx) + Math.abs(dy);  // 其中一個是 0
    if (dist <= PROJECTILE_MAX_DIST) {
      return { seq: 0, dir, attack: true, skill: true };
    } else {
      return { seq: 0, dir, attack: false, skill: false };
    }
  }

  // Case 3: 未對齊 — 縮較小軸（tie 選橫軸）
  if (dx !== 0 && dy !== 0) {
    const dir = Math.abs(dx) <= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    return { seq: 0, dir, attack: false, skill: false };
  }

  // TODO(next task): Case 1 同格
  return idle();
}
```

**注意 `(dx === 0) !== (dy === 0)`**：這個 XOR 表達「剛好一個是 0」。都是 0 會掉到下面 Case 1 處理。

- [ ] **Step 4：跑測試確認 23 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 23` / `# fail 0`（11 lobby + 12 bot）。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/bot.js packages/server/test/bot.test.js
git commit -m "feat(bot): aligned firing — fire attack+skill when in range, approach when not"
```

---

## Task 10：Bot AI — 同格 edge case

**為什麼**：罕見但定義完整的邊界條件（dx===0 && dy===0），`Case 2` 的 XOR 會 skip 掉，需要明確處理。

**Files:**
- Modify: `packages/server/test/bot.test.js`
- Modify: `packages/server/src/bot.js`

- [ ] **Step 1：追加測試**

```js
test('decideBotInput: 同格（dx=0, dy=0）→ dir null + attack + skill（盲射當前 facing）', () => {
  const s = makeStateWithTwo({ x: 5, y: 5 }, { x: 5, y: 5 });
  const input = decideBotInput(s, 'bot-1', 1000);
  assert.equal(input.dir, null);
  assert.equal(input.attack, true);
  assert.equal(input.skill, true);
});
```

- [ ] **Step 2：跑測試確認 FAIL**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# fail 1`，`expected true got false`（attack 目前是 false，落在 idle 分支）。

- [ ] **Step 3：實作 Case 1**

把 `packages/server/src/bot.js` 的 `decideBotInput` 最後一行 `return idle()` 改成明確的同格處理：

```js
  // Case 1: 同格（dx===0 && dy===0，無碰撞系統造成的罕見狀況）
  return { seq: 0, dir: null, attack: true, skill: true };
}
```

（把 TODO 註解一起刪掉）

- [ ] **Step 4：跑測試確認 24 個都過**

```bash
npm test --workspace @office-colosseum/server
```

Expected：`# pass 24` / `# fail 0`。

- [ ] **Step 5：Commit**

```bash
git add packages/server/src/bot.js packages/server/test/bot.test.js
git commit -m "feat(bot): fire blindly in current facing when stacked on enemy (edge case)"
```

---

## Task 11：Match 整合 — propagate isBot + tick loop 呼叫 decideBotInput

**為什麼**：終於把 bot AI 接進遊戲 loop。

**Files:**
- Modify: `packages/server/src/match.js`

- [ ] **Step 1：改 `Match` 建構子與 tick**

把 `packages/server/src/match.js` 完整取代為：

```js
import {
  createInitialState, applyInput, resolveTick, aliveCount, getWinner,
  TICK_MS, MSG,
} from '@office-colosseum/shared';
import { decideBotInput } from './bot.js';

export class Match {
  constructor(io, lobbyPlayers, onEnd) {
    this.io = io;
    this.onEnd = onEnd;
    this.players = lobbyPlayers.map(p => ({
      id: p.id,
      characterId: p.characterId,
      isBot: !!p.isBot,
    }));
    this.state = createInitialState(this.players);
    this.inputs = new Map();
    this.interval = null;
    this.stats = {};
    this.botSeqMap = new Map();
    for (const p of this.players) {
      this.stats[p.id] = { dmgDealt: 0, dmgTaken: 0, survivedTicks: 0 };
      if (p.isBot) this.botSeqMap.set(p.id, 0);
    }
  }
  start() {
    this.io.emit(MSG.MATCH_START, { state: this.state });
    const startAt = Date.now();
    this.interval = setInterval(() => this.tick(Date.now() - startAt), TICK_MS);
  }
  queueInput(playerId, input) { this.inputs.set(playerId, input); }
  tick(now) {
    const eventsStartIdx = this.state.events.length;

    // 為每個活著的 bot 產生 input（和真人 input 走同一條 applyInput 路徑）
    for (const p of this.players) {
      if (!p.isBot) continue;
      const statePlayer = this.state.players[p.id];
      if (!statePlayer || !statePlayer.alive) continue;
      let input;
      try {
        input = decideBotInput(this.state, p.id, now);
      } catch (err) {
        console.warn(`bot ${p.id} decide failed:`, err);
        input = { seq: 0, dir: null, attack: false, skill: false };
      }
      input.seq = ++this.botSeqMap.get(p.id) || 0;
      // Map.get 回傳 undefined 時 ++ 會 NaN；修：用 local
      const nextSeq = (this.botSeqMap.get(p.id) ?? 0) + 1;
      this.botSeqMap.set(p.id, nextSeq);
      input.seq = nextSeq;
      this.inputs.set(p.id, input);
    }

    for (const [pid, input] of this.inputs) {
      this.state = applyInput(this.state, pid, input, now);
    }
    this.inputs.clear();
    const { state } = resolveTick(this.state, now);
    this.state = state;
    const newEvents = state.events.slice(eventsStartIdx);
    for (const p of Object.values(state.players)) {
      if (p.alive) this.stats[p.id].survivedTicks++;
    }
    for (const e of newEvents) {
      if (e.type === 'damage') {
        this.stats[e.sourceId].dmgDealt += e.amount;
        this.stats[e.targetId].dmgTaken += e.amount;
      }
    }
    this.io.emit(MSG.SNAPSHOT, {
      tick: state.tick,
      players: state.players,
      projectiles: state.projectiles,
      events: newEvents,
    });
    if (state.phase === 'ended' || aliveCount(state) <= 1) this.end();
  }
  end() {
    clearInterval(this.interval); this.interval = null;
    this.io.emit(MSG.MATCH_END, { winnerId: getWinner(this.state), summary: this.stats });
    if (this.onEnd) this.onEnd();
  }
  setPaused(playerId, paused) {
    if (this.state.players[playerId]) this.state.players[playerId].paused = paused;
  }
}
```

**清理**：上面 Step 1 的示意有點 redundant 的 seq 初始化邏輯，實際 paste 時簡化為：

```js
let input;
try {
  input = decideBotInput(this.state, p.id, now);
} catch (err) {
  console.warn(`bot ${p.id} decide failed:`, err);
  input = { dir: null, attack: false, skill: false };
}
const nextSeq = (this.botSeqMap.get(p.id) ?? 0) + 1;
this.botSeqMap.set(p.id, nextSeq);
input.seq = nextSeq;
this.inputs.set(p.id, input);
```

- [ ] **Step 2：跑 smoke + 既有測試確認沒 regressions**

```bash
npm run smoke --workspace @office-colosseum/server
npm test
```

Expected：smoke PASS、所有 shared + server test 都過。

- [ ] **Step 3：手動整合驗證**

兩個 terminal：

Terminal 1：`npm run dev:server`
Terminal 2：`npm run dev:client`

1. 開 `http://localhost:5173`，用一個瀏覽器視窗進 Lobby
2. 開瀏覽器 devtools console，手動 emit：
   ```js
   // 在 console 裡
   (await import('/src/net/socket.js')).getSocket().emit('add_bot');
   ```
3. 看 Lobby 畫面有沒有多一個 player（即便還沒有 UI 按鈕）
4. 挑角色 → ready → 按「開始比賽」
5. **預期**：match 開始、看得到 bot 的 pixel sprite 在動、會朝你衝、子彈會射出

如果觀察到 bot 站著不動或 match 直接結束，回到 Task 7-10 確認 bot AI 邏輯。

- [ ] **Step 4：Commit**

```bash
git add packages/server/src/match.js
git commit -m "feat(match): generate bot inputs per tick via decideBotInput (server-authoritative)"
```

---

## Task 12：Lobby.jsx — 「新增 Bot」按鈕

**為什麼**：UI 第一半——host 看得到按鈕、按下 emit ADD_BOT。

**Files:**
- Modify: `packages/client/src/screens/Lobby.jsx`

- [ ] **Step 1：加 handleAddBot 函式與按鈕**

在 `packages/client/src/screens/Lobby.jsx` 找到 `handleStart` 函式下方（line 49 附近），加：

```js
const handleAddBot = () => {
  socket.emit(MSG.ADD_BOT);
};
```

在 `{me.isHost && (...)}` 區塊內（現在包著「開始比賽」按鈕的那個 fragment），把內容換成：

```jsx
{me.isHost && (
  <>
    <button
      onClick={handleStart}
      disabled={!canStart}
      style={{
        padding: '8px 0', borderRadius: 3, border: 'none',
        cursor: canStart ? 'pointer' : 'not-allowed',
        background: canStart ? excelColors.accent : excelColors.cellBorder,
        color: '#F5F0E8', fontWeight: 700, fontSize: 12,
        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      }}
    >
      ▶ 開始比賽
    </button>
    {!canStart && startDisabledReason && (
      <div style={{
        fontSize: 10, color: excelColors.textLight,
        textAlign: 'center', lineHeight: 1.4, marginTop: -2,
      }}>
        {startDisabledReason}
      </div>
    )}
    <button
      onClick={handleAddBot}
      disabled={players.length >= 8}
      style={{
        padding: '6px 0', borderRadius: 3,
        border: `1px solid ${excelColors.cellBorder}`,
        background: players.length >= 8 ? excelColors.headerBg : excelColors.cellBg,
        color: players.length >= 8 ? excelColors.cellBorder : excelColors.text,
        cursor: players.length >= 8 ? 'not-allowed' : 'pointer',
        fontSize: 11,
        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      }}
    >
      + 新增電腦對手
    </button>
  </>
)}
```

- [ ] **Step 2：手動驗證**

重開 client（Vite 會 HMR），在 Lobby 畫面：
1. 非 host：看不到「+ 新增電腦對手」按鈕
2. Host：看得到、按下 → Lobby 列表多一個 `Bot-1` entry（還沒樣式標記）
3. 按到第 8 人時按鈕變灰 disabled

若 Lobby 列表沒多，打開瀏覽器 devtools Network → WS → 看有沒有 `add_bot` frame 送出、server 回傳 `lobby_state` 的 players 數有沒有變。

- [ ] **Step 3：Commit**

```bash
git add packages/client/src/screens/Lobby.jsx
git commit -m "feat(lobby-ui): add host-only '+ 新增電腦對手' button"
```

---

## Task 13：Lobby.jsx — [CPU] 標籤 + 移除按鈕

**為什麼**：UI 第二半——讓 bot slot 視覺上跟真人區分，host 可以從 row 移除。

**Files:**
- Modify: `packages/client/src/screens/Lobby.jsx`

- [ ] **Step 1：加 handleRemoveBot**

在 `handleAddBot` 下方加：

```js
const handleRemoveBot = (botId) => {
  socket.emit(MSG.REMOVE_BOT, { botId });
};
```

- [ ] **Step 2：改 player row 渲染，加 [CPU] tag 與 host-only 移除按鈕**

找到 `players.map((p) => { ... })` 的那個 row（line 112 附近的 `return <div ...>` 內部），把內層取代為：

```jsx
{players.map((p) => {
  const char = ALL_CHARACTERS.find((c) => c.id === p.characterId);
  const isMe = p.id === socket.id;
  return (
    <div
      key={p.id}
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${excelColors.cellBorder}`,
        background: isMe ? excelColors.selectedCell : 'transparent',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {p.isHost && (
          <span style={{ fontSize: 10, background: excelColors.accent, color: '#F5F0E8', padding: '1px 4px', borderRadius: 2 }}>
            HOST
          </span>
        )}
        {p.isBot && (
          <span style={{ fontSize: 10, background: excelColors.blueAccent, color: '#F5F0E8', padding: '1px 4px', borderRadius: 2 }}>
            CPU
          </span>
        )}
        <span style={{ fontWeight: isMe ? 700 : 400, color: excelColors.text }}>
          {p.name}
        </span>
        {p.ready && (
          <span style={{ marginLeft: 'auto', color: excelColors.greenAccent, fontWeight: 700 }}>
            ✔
          </span>
        )}
        {me.isHost && p.isBot && (
          <button
            onClick={() => handleRemoveBot(p.id)}
            title="移除"
            style={{
              marginLeft: p.ready ? 6 : 'auto',
              background: 'transparent',
              border: `1px solid ${excelColors.cellBorder}`,
              color: excelColors.textLight,
              cursor: 'pointer',
              fontSize: 10,
              lineHeight: 1,
              padding: '1px 4px',
              fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: excelColors.textLight, marginTop: 2 }}>
        {char ? char.name : '—'}
      </div>
    </div>
  );
})}
```

- [ ] **Step 3：手動驗證全流程**

1. Host 進 lobby
2. 按「+ 新增電腦對手」兩次 → 看到兩個 row 有 `[CPU]` 藍標 + 右側 `✕` 按鈕
3. 按其中一個 `✕` → bot row 消失，剩一個 bot
4. 挑自己的角色 → ready → 按「開始比賽」
5. Match 開始，看到 bot 在動、會開火、金色子彈飛來
6. 殺掉 bot → 看到墓碑 + log 有 `=ELIMINATED(...)` 訊息
7. Match 結束、結算畫面出現、回到 lobby → bot slot 都清空（因為 `resetForNewMatch`）

**非 host 視角**：再開第二個瀏覽器視窗 → 非 host 視窗看得到 `[CPU]` 標籤、看不到 `✕` 按鈕、看不到「+ 新增電腦對手」按鈕。

- [ ] **Step 4：Commit**

```bash
git add packages/client/src/screens/Lobby.jsx
git commit -m "feat(lobby-ui): [CPU] tag and host-only remove button on bot rows"
```

---

## Task 14：更新 CLAUDE.md

**為什麼**：文件跟實作同步，未來 Claude 讀到才不會過時。

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1：協定表加兩列**

找到協定表（`| C→S | \`JOIN\` | ... |` 那個 table），在 `LEAVE` 那列**之後、S→C 那段之前**插入：

```md
| C→S | `ADD_BOT` | `{}` — 僅 host；滿/非 host/進行中時回 ERROR |
| C→S | `REMOVE_BOT` | `{ botId }` — 僅 host；目標必須是 bot 否則 ERROR |
```

- [ ] **Step 2：server 模組表加 bot.js 條目**

找到 `packages/server/` 小節的「三個核心類別／模組」列表，在 `socketHandlers.js` 那條之後加：

```md
- **`bot.js`**：純函式 `decideBotInput(state, botId, now)`，回傳跟真人 INPUT 同 shape 的輸入。決策樹：死/沒敵人 → idle；未對齊 → 縮較小軸；對齊且在 `PROJECTILE_MAX_DIST` 內 → 面向 target + attack + skill；對齊但超距 → 面向推進不開火；同格疊在一起 → 盲射。**不讀 `state.projectiles`**——刻意界線，不躲彈不預判。Match tick 中對每個 `isBot && alive` 的 player 呼叫，包 try/catch fallback idle。
```

- [ ] **Step 3：Lobby 描述加 bot 段落**

找到 `- **\`lobby.js\` (\`Lobby\` 類別)**`：的條目，在段尾加：

```md
 Host 可在 lobby 透過 `addBot(requesterId)` 新增隨機角色的 bot（`id = 'bot-N'`、`name = 'Bot-N'`、`ready: true`、`isBot: true`），上限 `MAX_PLAYERS=8`。`removeBot(requesterId, botId)` 移除。`resetForNewMatch()` 會清掉所有 bot 並重置 `nextBotSeq`。`leave()` 後若沒有真人剩下，自動清空所有 bot（空 lobby 保留 bot 無意義）。
```

- [ ] **Step 4：地雷段加一條關於 bot 的耦合提醒**

在「容易踩的坑」清單末尾（區網防火牆那條之後）加：

```md
- **Bot AI 與 simulation schema 耦合**：`packages/server/src/bot.js` 直接讀 `state.players[id].{x,y,alive}` 結構；simulation.js 改 schema 時 bot 會連帶壞。24 個 bot 單元測試會第一個變紅——相信測試，別單獨修 bot.js 讓綠燈回來而不看 schema 是否真的改動。
```

- [ ] **Step 5：驗證改完的 CLAUDE.md 沒打錯段落**

```bash
grep -n 'ADD_BOT\|bot.js\|decideBotInput' CLAUDE.md
```

Expected：至少 4 個 match（協定表 2 個、server 模組表 1 個、地雷段 1 個）。

- [ ] **Step 6：Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document bot players in CLAUDE.md (protocol, lobby, bot.js, pitfall)"
```

---

## 完成後的 sanity check

- [ ] `npm test` 綠（shared + server 全過）
- [ ] `npm run smoke --workspace @office-colosseum/server` PASS
- [ ] 手動測：單人加 1 bot 能開局、能殺 bot 看到勝利畫面
- [ ] 手動測：單人加 3 bot 開局，看到 4 人混戰
- [ ] 手動測：兩個瀏覽器視窗一真人 + 一真人 + 一 bot 能正常開局
- [ ] git log 看到 ~14 個 feature commits，每個都獨立可 revert
