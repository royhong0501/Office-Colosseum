# 電腦玩家（Bot）設計 Spec

> **Status:** Draft，待 review
> **Date:** 2026-04-21
> **Author:** roy.hong + Claude（brainstorming skill）

## 動機

目前 Office Colosseum 要求 `MIN_PLAYERS=2` 才能開場，作者在單人環境（開發中、沒人陪）無法實際進到 match 畫面測試戰鬥、子彈命中、技能冷卻、淘汰事件、結算畫面等功能。此 spec 定義一個由 server 驅動的 bot 玩家系統，讓 host 可以手動加入電腦對手來填補 slot，並在 match 中做出粗暴但功能完整的對戰行為。

### 成功條件

- Host 可以在 lobby 透過 UI 新增／移除 bot，總人數維持 ≤ `MAX_PLAYERS=8`
- 按下開始對戰後，bot 與真人走完全相同的 `applyInput → resolveTick → SNAPSHOT` 路徑，共用同一個 `GameState`
- Bot 在戰鬥中會朝最近的敵人移動、對齊後開火、技能冷卻結束時使用技能
- Bot 不讀子彈、不躲避、不預判（明確界線，v1 不做）
- Solo 情境下：host 加 1 個 bot → 開場 → 跑完一場能正常判定勝負、看到結算畫面

## 非範圍

以下項目刻意排除在 v1 外：

- Bot 難度分級（easy / normal / hard）
- Host 幫 bot 指定特定角色
- Bot AI 躲子彈、預判走位、HP 管理、省技能給低血時
- 踢真人玩家（權限模型不同）
- Bot 名稱自訂

---

## 架構

### 核心原則

**Bot 就是沒有 socket 的 Player**。Server 權威原則不變，bot 在 `Lobby.players` Map 中是一筆正常的 player entry，只差 `isBot: true` 旗標、`id` 是合成的 `'bot-N'`、沒有關聯的 socket 連線。

### 為什麼是 server-side 純函式，不是 client-side 假 socket？

- **Server-authoritative 原則**：遊戲邏輯永遠只有一份，在 server。Client-side bot 要生假 socket、假連線狀態，成本高於收益。
- **純函式好測**：AI 決策是 `(state, botId, now) → input`，無副作用，單元測試不需要 mock socket 或 game loop。
- **與現行架構對稱**：`applyInput` 不在乎 input 來自誰；bot 的 input 形狀跟真人 INPUT 一樣走完全同一條路徑。

### 模組邊界

| 模組 | 責任 | 依賴 |
|---|---|---|
| `packages/server/src/bot.js` | 純函式 `decideBotInput(state, botId, now) → input` 及其 helper | `shared`（讀 `GameState` schema、`PROJECTILE_MAX_DIST` 常數） |
| `packages/server/src/lobby.js` | 新增 `addBot` / `removeBot` 方法；`Player` entry 加 `isBot` 欄位 | 無新增外部依賴 |
| `packages/server/src/match.js` | Tick loop 中對 bot 呼叫 `decideBotInput`，包進 try/catch | `bot.js` |
| `packages/server/src/socketHandlers.js` | 綁 `MSG.ADD_BOT` / `MSG.REMOVE_BOT` 到 `Lobby` 方法 | 無 |
| `packages/client/src/screens/Lobby.jsx` | 渲染加/移除 bot 按鈕、bot slot 的 `[CPU]` 標籤 | 無 |
| `packages/shared/src/protocol.js` | 定義 `ADD_BOT` / `REMOVE_BOT` 常數 | 無 |

**關鍵決策：`bot.js` 放在 server 而非 shared**。Client 不需要 bot 邏輯（AI 只在 server 跑），放 shared 會破壞「`shared` 對 server/client 雙向中立」的原則。

---

## 資料模型

### `Lobby.players.get(id)` 的 Player entry

```js
{
  id: string,              // 真人 = socketId；bot = 'bot-1' / 'bot-2' / ...
  name: string,            // 真人自填；bot = 'Bot-1' / 'Bot-2' / ...
  characterId: string | null,
  ready: boolean,          // bot 恆為 true
  isHost: boolean,         // bot 恆為 false（bot 不能當 host）
  isBot: boolean,          // 新欄位；真人 = false（預設）
}
```

### `Lobby` 新內部狀態

- `nextBotSeq: number` — 從 1 開始的 monotonic counter，用於產生 `bot-N` id 與 `Bot-N` name
- 在 `resetForNewMatch()` 會清掉所有 `isBot: true` 的 entry 並重置 `nextBotSeq = 1`

### `Match` 新內部狀態

- `botSeqMap: Map<botId, number>` — 每個 bot 自己的 input seq counter，形狀對應真人 INPUT 的 `seq` 欄位

---

## 協定

### 新增 socket events（寫入 `shared/src/protocol.js`）

| 方向 | Event 常數 | Payload | 說明 |
|---|---|---|---|
| C→S | `ADD_BOT` (`'add_bot'`) | `{}` | 僅 host 成功；否則 `ERROR { code, msg }` |
| C→S | `REMOVE_BOT` (`'remove_bot'`) | `{ botId: string }` | 僅 host 成功；`botId` 必須是 `isBot: true` 的 entry，否則 `ERROR { code, msg }` |

**錯誤 shape 約定**：
- `Lobby` 方法內部 return 用 `{ ok: true, ... }` 或 `{ error: '<code>' }` 的形狀（既有慣例延續）。
- `socketHandlers` 把 `{ error: code }` 轉成 `ERROR { code, msg }` 送回 client——既有 `ERROR` event 已經是這個形狀。
- 可能的 code：`not_host`、`not_in_lobby`、`lobby_full`（僅 addBot）、`not_bot`（僅 removeBot）。

### 既有 event 的行為延伸

- `LOBBY_STATE { players }` 的 `players` 陣列已經包含 bot（因為走的是同一個 `Lobby.players` Map）；client 讀 `player.isBot` 決定渲染樣式。
- `SNAPSHOT { tick, players, projectiles, events }` 完全不變，bot 就是 `players` 裡的一筆。
- `INPUT` bot 不會 emit（沒 socket），但 server 端內部產生的 input 形狀完全相同。

---

## Lobby 行為

### `addBot(requesterId)`

1. 若 `phase !== 'lobby'` → return `{ error: 'not_in_lobby' }`
2. 若 `requesterId` 不是 host → return `{ error: 'not_host' }`
3. 若 `players.size >= MAX_PLAYERS` → return `{ error: 'lobby_full' }`
4. 產生 `id = 'bot-' + nextBotSeq`、`name = 'Bot-' + nextBotSeq`，`nextBotSeq++`
5. 從 `ALL_CHARACTERS` 隨機挑一隻，`characterId = pick.id`
6. `ready: true`、`isHost: false`、`isBot: true`
7. `players.set(id, entry)`、`broadcast()`、return `{ ok: true, botId: id }`

### `removeBot(requesterId, botId)`

1. 若 `phase !== 'lobby'` → return `{ error: 'not_in_lobby' }`
2. 若 `requesterId` 不是 host → return `{ error: 'not_host' }`
3. 若 `players.get(botId)?.isBot !== true` → return `{ error: 'not_bot' }`
4. `players.delete(botId)`、`broadcast()`、return `{ ok: true }`

### `resetForNewMatch()` 延伸

- 既有行為（清 ready、保留 characterId）不變
- 新增：對所有 `isBot: true` 的 entry 做 `players.delete()`
- 新增：`nextBotSeq = 1`

### Host 離開時的 bot 清理

`leave(socketId)` 既有邏輯在 host 離開時會把 host 權遞給下一個真人。新增：

- 若刪除後 `players` 中沒有任何真人（全是 bot）→ 清空所有 bot（`players.clear()` 等效於 `[...players.values()].filter(p => p.isBot).forEach(p => players.delete(p.id))`）
- 理由：bot 不能自己當 host，也沒有意義讓空 lobby 維持存在

### `canStart()` 不變

仍是 `size >= MIN_PLAYERS && 所有人 ready && 所有人有 characterId`。bot 的 `ready === true`、`characterId !== null`，所以不會擋 start。

---

## Match Tick Loop

### 現行流程

```
每 TICK_MS（= 1000/30 ≈ 33.3ms）：
  1. eventsStartIdx = state.events.length
  2. drain this.inputQueue（真人 socket 送的 INPUT）
  3. 對每筆 input，呼叫 applyInput(state, playerId, input, now)
  4. resolveTick(state, now) → 推進子彈、結算傷害、更新 alive、可能設 phase='ended'
  5. emit SNAPSHOT
  6. 若 ended → end()
```

### 新流程

```
每 TICK_MS：
  1. eventsStartIdx = state.events.length
  2. drain this.inputQueue（真人 input）
  3. 對每個 isBot === true && alive === true 的 player：
     try:
       input = decideBotInput(state, botId, now)
       input.seq = ++botSeqMap.get(botId)
     catch (err):
       console.warn(`bot ${botId} decide failed:`, err)
       input = { seq, dir: null, attack: false, skill: false }
     把 { playerId: botId, input } 加進 inputs-to-apply 集合
  4. 對每個 player 的 input（真人 + bot），呼叫 applyInput(...)
  5. resolveTick → 廣播 SNAPSHOT
```

### 為什麼 bot input 不進 `inputQueue`？

真人 input 進 queue 是因為 socket 非同步、一個 tick 可能來多筆需要合併；bot 邏輯是同步的純函式，剛好一 tick 一筆，直接算直接用省掉 queue race。

### 錯誤處理

`decideBotInput` 若 throw（bug、意料之外的 state 形狀）→ catch 住、log warn、當作 idle input。**Bot 邏輯 bug 絕不可弄死一場真人的 match**。

---

## AI 決策

### `decideBotInput(state, botId, now)`

**簽名**：

```js
/**
 * @param {GameState} state - 唯讀；不可 mutate
 * @param {string} botId - bot 的 player id
 * @param {number} now - absolute ms timestamp（給未來 cooldown-aware 決策用，v1 不用）
 * @returns {{ seq: number, dir: string | null, attack: boolean, skill: boolean }}
 *   seq 由 Match 層填，bot.js 回 0 即可
 */
```

**決策樹**（從上往下，第一條命中就 return）：

```
me = state.players[botId]
if !me || !me.alive:
  return { seq: 0, dir: null, attack: false, skill: false }

target = findNearestEnemy(state, botId)
if !target:
  return { seq: 0, dir: null, attack: false, skill: false }

dx = target.x - me.x
dy = target.y - me.y

// Case 1: 疊在同一格
if (dx === 0 && dy === 0) {
  return { seq: 0, dir: null, attack: true, skill: true }
}

// Case 2: 對齊同 row 或 col
if (dx === 0 || dy === 0) {
  const facing = dx === 0
    ? (dy > 0 ? 'down' : 'up')
    : (dx > 0 ? 'right' : 'left')
  const dist = Math.abs(dx) + Math.abs(dy)
  if (dist <= PROJECTILE_MAX_DIST) {
    return { seq: 0, dir: facing, attack: true, skill: true }
  } else {
    return { seq: 0, dir: facing, attack: false, skill: false }
  }
}

// Case 3: 未對齊，縮較小那一軸（tie 選橫軸）
const dir = Math.abs(dx) <= Math.abs(dy)
  ? (dx > 0 ? 'right' : 'left')
  : (dy > 0 ? 'down' : 'up')
return { seq: 0, dir, attack: false, skill: false }
```

### 輔助函式（internal，同檔不 export）

```js
function findNearestEnemy(state, selfId) {
  // Manhattan 最近的 alive 敵人；tie-break 用 player id 字串排序（確定性）
}
```

### 為什麼對齊時 attack + skill 同按？

Server 端的 `applyInput` 已經用 `ATTACK_COOLDOWN_MS=250` 與 `skillCdUntil` 過濾冷卻，bot 不用自己算。對齊時盡量輸出 = 粗暴 bot 定位。

### 為什麼不躲子彈、不看 `state.projectiles`？

明確的 v1 界線。B 級 AI 的意義是「驗證戰鬥系統功能正常」，不是「驗證 AI 是否聰明」。躲彈與預判留給可能的 v2 難度分級。

### 設計決策記錄

| 決策 | 選擇 | 替代 | 理由 |
|---|---|---|---|
| 目標選擇 | 最近 alive 敵人 | HP 最低 / 威脅最大 | 粗暴 bot 不做威脅評估 |
| 目標切換 | 每 tick 重選 | 鎖定加 hysteresis | 抖動可接受、邏輯更簡單 |
| 對齊優先軸 | 縮較小軸 | 縮較大軸 / 隨機 | 對齊最快 → 開火最早 |
| tie-break（\|dx\| === \|dy\|） | 橫軸 | 縱軸 / 隨機 | 一致性、可預測、可測試 |
| 未對齊時 attack | false | true（盲射） | 子彈不會命中，純噪音 |

---

## UI 設計（`Lobby.jsx`）

### 新增元素

1. **`+ 新增電腦對手` 按鈕**
   - host 才渲染、`players.size < MAX_PLAYERS` 才啟用
   - 按下呼叫 `socket.emit(MSG.ADD_BOT)`
   - 樣式：沿用既有「開始對戰」按鈕的 Excel toolbar 調性，灰階、無圓角、用 `excelColors`

2. **Bot slot 渲染**
   - 走跟真人 slot 一樣的 row template
   - 名字欄顯示 `Bot-N`（後端傳來的 `name`）
   - 右側多一個 `[CPU]` 標籤 cell，樣式對齊既有 `[HOST]` 標籤（同樣的 `<span>` 結構、`excelColors.headerBg` 底、灰字）
   - `ready` 永遠綠燈

3. **Bot slot 的移除按鈕**
   - 只有 host 看得到
   - 位置：row 最右側
   - 內容：`✕`（小）
   - 按下呼叫 `socket.emit(MSG.REMOVE_BOT, { botId: p.id })`
   - 樣式：同 Excel minus-column 風格的 tiny icon button

### 非 host 的 bot 感知

非 host 也看到 `[CPU]` 標籤以區分 bot，但不看到加/移除按鈕——host-only 操作對所有 client 一致隱藏。

### Excel 偽裝檢查

- 無圓角、無漸層、無彩色按鈕
- 所有顏色來自 `excelColors` palette
- `[CPU]` / `[HOST]` 標籤視覺一致

---

## 測試策略

### 單元測試

**`packages/server/test/bot.test.js`**（`node:test`，至少 7 個 case）：

1. `decideBotInput`：自己死了 → idle
2. 沒有敵人活著 → idle
3. 敵人在對角（dx=3, dy=5）→ 走縱軸（縮小軸）、不開火
4. 敵人同 row 近距離（dy=0, dx=3）→ `dir: 'right'`, attack + skill
5. 敵人同 col 遠距離（dx=0, dy=13 > 12）→ `dir: 'down'`, 不開火
6. 敵人已死 → 目標切到下一個活著的
7. 同格疊在一起（dx=0, dy=0）→ idle dir + attack + skill
8. Tie-break 測試：`|dx| === |dy|` → 走橫軸

**`packages/server/src/lobby.js` 的新方法測試**（整合進既有 lobby 測試或新檔 `lobby.test.js`，看 server 現有測試結構）：

1. `addBot` 非 host → error
2. `addBot` lobby 滿 → error
3. `addBot` 成功 → entry 有 `isBot: true`、`ready: true`、有 characterId
4. `addBot` 連加三個 → seq 為 1, 2, 3
5. `removeBot` 非 host → error
6. `removeBot` 目標不是 bot → `not_bot` error
7. `removeBot` 成功 → entry 被刪
8. `resetForNewMatch` → 所有 bot 被清、nextBotSeq 歸 1
9. `leave` host 且只剩 bot → 全部 bot 清空

### 整合測試

**`packages/server/test/bot-smoke.test.js`**（可選，視成本）：

- 1 個真人連線 → addBot → startMatch → 等若干 tick → 斷言收到 SNAPSHOT、state 有兩個 player、至少一筆 damage 或 projectile_spawn event
- 目的：驗證整條 pipeline（lobby add → match tick → applyInput for bot → SNAPSHOT）串得起來

### 手動驗證

- 開 dev server、用瀏覽器加入、按「新增 Bot」兩次、按「開始對戰」、觀察：
  - Lobby UI 顯示兩個 `[CPU]` slot、綠燈 ready
  - 戰鬥開始後 bot 會動、會開火、看到金色子彈
  - 其中一個 bot 被打死 → 墓碑 + log 顯示淘汰
  - 剩下一個 bot → match end → 結算畫面

---

## 風險與 Mitigation

| # | 風險 | 機率 | Mitigation |
|---|---|---|---|
| 1 | Bot AI 跟 simulation schema 耦合，schema 改 bot 會壞 | 中 | bot 的 7 個單元測試第一個變紅；bot.js 放 server 讓耦合可見 |
| 2 | Host 離開瞬間 bot 卡在空 lobby | 低 | `leave()` 後檢查「是否還有真人」、沒有就清 bot；有測試覆蓋 |
| 3 | Match 進行中嘗試加/移除 bot | 中 | `addBot` / `removeBot` 開頭檢查 `phase === 'lobby'` |
| 4 | 多個 bot 隨機到同角色（3 隻 Persian） | 高 | 不 mitigate；真人亦無角色互斥，bot 沿用 |
| 5 | Bot tick 效能 | 低 | 7 bot × 30 tick/s × O(8) = 1680 ops/s，非瓶頸 |
| 6 | UI 的 `[CPU]` / `[HOST]` 標籤不一致 | 低 | Review 時比對既有 `[HOST]` 實作、沿用同 `<span>` 樣式 |
| 7 | `bot.js` 的 exception 讓整場 match 崩潰 | 低 | Match tick 用 try/catch 包住 `decideBotInput`，fallback idle input |

---

## 文件更新

需要同步更新：

- `CLAUDE.md`
  - 協定表加 `ADD_BOT` / `REMOVE_BOT` 兩列
  - Lobby 描述加「host 可加 bot」段落
  - 新增 `packages/server/src/bot.js` 的條目到 server 模組表
  - 風險章節加 bot.js 耦合提醒
