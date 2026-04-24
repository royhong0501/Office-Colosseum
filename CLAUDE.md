# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 輸出語言

**與使用者對話、解釋、說明、commit message、註解、PR 描述一律使用繁體中文**。使用者是繁中母語者，除非對方明確切換成英文或要求英文輸出，不然所有 user-facing 文字都用繁中。程式碼識別字（變數名、function 名、檔名、event 名）維持英文，這是慣例也是避免 encoding 問題。

## 專案概觀

**Office Colosseum** 是一個以「試算表偽裝」為核心視覺的**區網多人遊戲平台**，外殼全部是 HiiiCalc 試算表介面（主選單、模式選擇、對戰大廳、戰鬥畫面、老闆鍵覆蓋層都是統一的 SheetWindow 外殼），實際裡面跑三款辦公室題材小遊戲：

1. **經典大逃殺**（`battle-royale`）：射擊 + #REF! 報錯毒圈 + 掩體 + 衝刺 + 舉盾。5 張試算表場景地圖可選。WASD 移動 / 滑鼠 aim / LMB 射擊 / RMB 舉盾 / Shift 衝刺 / ESC 老闆鍵。**已實作（Phase 1）**。
2. **道具戰**（`items`）：HP+MP 雙資源、基本射擊 + 5 個儲存格技能（凍結 trap / undo 回血 / 合併 trap 減速 / 唯讀 trap 封技 / 資料驗證 trap 傳送）。WASD + LMB 射擊 + 1–5 施放技能；單局 3 分鐘倒數。**已實作（Phase 2）**。
3. **數據領地爭奪戰**（`territory`）：走過即塗隊色、封閉區域連鎖填滿（flood fill）。2–3 隊、最多 6 人；單局 3 分鐘，時限結束時佔地最多的隊伍贏。**已實作（Phase 3）**。

設計假設：區網遊玩、延遲極低，所以採取「server 權威 + 無 client-side prediction」的最簡架構。各款遊戲的世界座標與規則差異大，但**共用同一條** Lobby / 戰績 / 房主 / bot / socket / 身分 pipeline。

20 隻動物角色（10 貓 + 10 狗）**只作為皮膚**——在三款遊戲中機制完全相同，差別純粹是貼圖 / 名字 / 代表色。

---

## 常用指令

所有指令都從 repo 根目錄執行；npm workspaces 會自動解析三個 package 的相依。

### 本機開發（兩個終端機，無 Docker）

```bash
npm install

# Terminal 1 — server 用 node --watch 熱重載，監聽 :3000
npm run dev:server

# Terminal 2 — Vite dev server 在 :5173，會把 /socket.io 代理到 :3000
npm run dev:client
```

開啟 `http://localhost:5173`。

### Docker / 正式出 build

（同前版；多遊戲重構不影響部署流程）

```bash
npm run build      # vite build → packages/client/dist/
npm start          # Express 從 dist/ 出靜態檔 + socket.io，監聽 :3000
```

### 測試

```bash
npm test                                                   # 所有 workspace 跑一遍
npm test --workspace @office-colosseum/shared              # shared 單元測試
npm test --workspace @office-colosseum/server              # server（含 brBot、lobby、records、rooms）
npm run smoke --workspace @office-colosseum/server         # 2-client 登入 lobby 的整合 smoke test
```

所有 test 檔用原生 `node:test` + `node:assert/strict`，無任何測試 framework。

---

## 架構總覽

npm workspaces monorepo，**單向相依**：`client, server → shared`，`shared` 不依賴其他兩者。

```
packages/
  shared/   純 ES module — 通用常數、20 角色（皮膚）、遊戲規則按 games/<id>/ 分目錄
  server/   Node + Express + socket.io — 擁有 Lobby + Match dispatcher，30 Hz 廣播
  client/   Vite + React 18 + socket.io-client — SheetWindow 外殼 + 模式選擇 + 戰鬥畫面（按 gameType 路由）
```

核心原則：**server 是權威**、**client 是啞視圖**、**shared 按 gameType 分子目錄**。
所有遊戲判定都在 server 跑；各款小遊戲的規則（simulation）放在 `packages/shared/src/games/<id>/`。

### Server 多遊戲 dispatcher

```
socketHandlers  →  Lobby (共用) + Match (gameType 參數化)
                                    ├─ 'battle-royale' → shared/games/br/*    + server/games/brBot
                                    ├─ 'items'         → shared/games/items/* + server/games/itemsBot
                                    └─ 'territory'     → shared/games/territory/* + server/games/territoryBot
```

- 同一個 server process 一次只跑一場 match（保留 singleton）。Lobby 新增 `gameType` 欄位 + `setGameType(host, gameType, config)`。
- `Match(io, players, gameType, config, onEnd)` 建構時用 `loadGame(gameType)` 拿到 `{ sim, bot }` 模組，tick loop 通用呼叫 `sim.applyInput / sim.resolveTick / sim.buildSnapshotPayload / sim.buildMatchStartPayload / bot.decideBotInput`。
- 加新遊戲：建 `shared/games/<id>/`（實作 simulation 介面）+ `server/src/games/<id>Bot.js` + 在 `server/src/games/index.js` 的 `GAMES` 註冊。

### Client 流程 + 戰鬥畫面 dispatcher

```
screen: menu → modeSelect → [mapSelect] → lobby → battle → gameover
                          (BR only)
        menu → characters / history（獨立頁）
```

- `NetworkedBattle.jsx` 是戰鬥層 dispatcher，依 `gameType` 路由到 `battle/<id>/BattleXxx.jsx`。
- 全部非戰鬥畫面（Lobby / ModeSelect / MapSelect / MainMenu / GameOver / CharacterBrowser / MatchHistory）都走同一個 `SheetWindow` 外殼。

---

## `packages/shared/` — 遊戲規則單一真實來源

純 ES module，**絕對不能**用到 `window`、`document`、`fs`、`process` 等任何平台 API。

| 檔案 | 職責 |
|---|---|
| `constants.js` | 通用常數（`MAX_PLAYERS=8`, `MIN_PLAYERS=2`, `TICK_RATE=30`, `TICK_MS`, `PLAYER_NAME_MAX=16`） |
| `characters.js` | 20 隻角色（10 貓 + 10 狗）。僅 `{id, name, nameEn, type, color}` —— 當皮膚用 |
| `math.js` | `manhattan / euclidean / distSq / clamp` 基本數學工具 |
| `protocol.js` | `MSG` event 名稱常數 + `GAME_TYPES` 清單 + `DEFAULT_GAME_TYPE='battle-royale'` |
| `index.js` | 統一 re-export，client/server 皆 import 這一個（`shared/games/<id>/` 需要深層 import） |
| `games/br/` | 經典大逃殺規則模組（見下方） |
| `games/items/` | 道具戰規則模組（見下方） |
| `games/territory/` | 數據領地爭奪戰規則模組（見下方） |

### `shared/games/br/` — 經典大逃殺

| 檔案 | 內容 |
|---|---|
| `constants.js` | `ARENA_COLS=20, ARENA_ROWS=9`, `MAX_HP=100`, `MOVE_SPEED=5.2`（cells/s）、`SHOOT_CD_MS=280`, `BULLET_DMG=14`, `BULLET_SPEED=16`, `BULLET_MAX_DIST=14`, `SHIELD_REDUCTION=0.7`, `DASH_CELLS=2, DASH_CD_MS=6000, DASH_INVULN_MS=200`, `POISON_DPS=5, POISON_SEVERE_MULT=2, POISON_START_MS=30000, POISON_WAVE_INTERVAL_MS=15000` |
| `maps.js` | 5 張地圖：年度預算報表 / 甘特圖 / 樞紐分析 / 股價 K 線 / 銷售熱區。`covers` 為 `[col, row, w, h]` 矩形列表；`expandCovers() → Set<"c,r">` 給碰撞用；`autoSpawns(map)` 四角+中點自動生出 spawn 點（避 cover）；`pickMap(idxOrId)`、`getMapById(id)` |
| `simulation.js` | `createInitialState / applyInput / resolveTick / aliveCount / getWinner / buildSnapshotPayload / buildMatchStartPayload` |

### BR `GameState` 形狀

```js
{
  phase: 'playing' | 'ended',
  tick, startedAtMs,
  gameType: 'battle-royale',
  config: { mapId },
  map: {
    id, name,
    covers: [[c,r,w,h]...],
    coversSet: Set<"c,r">,        // 展開後的單格 set（僅 server 狀態）
    spawns: [[c,r]...],
  },
  players: {
    [id]: {
      id, characterId,
      x, y,                        // 世界座標（float，corner-origin；x ∈ [0, ARENA_COLS]）
      hp, maxHp,
      alive, paused,
      moveX, moveY,                 // 正規化後的移動意圖（resolveTick 才真的位移）
      aimAngle, facing,             // radians
      shielding,                    // held bool
      shootCdUntil, dashCdUntil,    // absolute ms timestamps
      invulnUntil,                  // absolute ms timestamp
      lastPoisonTickAt, lastHurtAt,
    }
  },
  bullets: [{ id, ownerId, x, y, vx, vy, angle, traveled, spawnedAtMs }],
  poison: {
    infected: Set<"c,r">,
    severe: Set<"c,r">,
    nextWaveAtMs,
    waveCount,
  },
  nextBulletId,
  events: [...],
}
```

**重要**：client 收到的 snapshot 裡 `poison.infected / severe` 是 **array**（JSON 沒 Set），由 `buildSnapshotPayload` 轉好。server 內部的 state 仍用 Set 以支援 O(1) 查詢。

### BR 輸入 schema（INPUT event payload）

```js
{ seq, moveX, moveY, aimAngle, attack, shield, dash }
```

- `moveX/moveY`：任意向量（WASD / 方向鍵），server 端 `Math.hypot` 正規化
- `aimAngle`：弧度，由 client 依滑鼠世界座標算出，每 tick 送；決定 facing 與射擊 / dash 方向
- `attack`：left-click held bool，server 以 `SHOOT_CD_MS` 節流
- `shield`：right-click held bool，直接寫入 `player.shielding`（放開立即卸盾）
- `dash`：shift-press one-shot bool，server 檢查 `dashCdUntil` 決定是否生效；client 讀完要自行清掉 one-shot flag

### BR Event types（server → client SNAPSHOT payload）

- `damage` — `{ sourceId, targetId, amount, kind: 'bullet'|'poison', at: {x,y} }`
- `eliminated` — `{ playerId }`
- `projectile_spawn` — `{ id, ownerId, x, y, angle }`
- `projectile_hit` — `{ id, targetId|null, at }`（targetId=null 代表撞 cover）
- `projectile_expire` — `{ id }`
- `dash_move` — `{ playerId, from:{x,y}, to:{x,y} }`
- `shield_on` — `{ playerId, at }` / `shield_off` — `{ playerId }`
- `poison_wave` — `{ waveCount, newCells: [[c,r]...] }`

### `shared/games/items/` — 道具戰

| 檔案 | 內容 |
|---|---|
| `constants.js` | `ARENA_COLS=18, ARENA_ROWS=9`, `MAX_HP=100, MAX_MP=100, MP_REGEN_PER_SEC=2`, `MOVE_SPEED=4.8`（cells/s, slowed=2.4）、`SHOOT_CD_MS=600, BULLET_DMG=10, BULLET_SPEED=14, BULLET_MAX_DIST=12`, `ROUND_DURATION_MS=180000`, `SKILLS` 物件（freeze/undo/merge/readonly/validate 的 mpCost + cdMs + durationMs/rewindMs）, `SKILL_KEYS` 陣列, `HP_HISTORY_INTERVAL_MS=250, HP_HISTORY_LEN=12` |
| `simulation.js` | `createInitialState / applyInput / resolveTick / aliveCount / getWinner / buildSnapshotPayload / buildMatchStartPayload`；trap 放在施放者當下 cell，敵人踩到才觸發；`undo` 會查 `hpHistory` 復原 2 秒前 HP 並清除 freeze/slow |

### Items `GameState` 形狀

```js
{
  phase, tick, startedAtMs, roundEndsAtMs,
  gameType: 'items', config: {},
  players: { [id]: {
    id, characterId, x, y,
    hp, maxHp, mp, maxMp,
    alive, paused,
    moveX, moveY, aimAngle, facing,
    shootCdUntil,
    skillCdUntil: { freeze, undo, merge, readonly, validate },
    frozenUntil, slowedUntil, silencedUntil,
    hpHistory: [{ atMs, hp }, ...],
    lastHurtAt, lastHpRecordAt,
  }},
  bullets: [{ id, ownerId, x, y, vx, vy, angle, traveled, spawnedAtMs }],
  traps: [{ id, kind, cx, cy, ownerId, placedAtMs }],  // cx/cy = integer cell
  nextBulletId, nextTrapId,
  events: [...],
}
```

### Items 輸入 schema（INPUT event payload）

```js
{ seq, moveX, moveY, aimAngle, attack, skill }
```

- `attack`：LMB held bool，基本射擊（`SHOOT_CD_MS=600` 節流，10 dmg）
- `skill`：`'freeze'|'undo'|'merge'|'readonly'|'validate'|null`。one-shot（client 讀完要清掉）。前端 1–5 鍵對應 `SKILL_KEYS` 索引
- **凍結中（`now < frozenUntil`）**：只允許 `undo` 技能，移動 / 射擊 / 其他技能全擋
- **Silenced（`now < silencedUntil`）**：所有技能（含 undo）都擋，但可移動可射擊

### Items Event types

- `damage` — `{ sourceId, targetId, amount, kind: 'bullet', at }`
- `eliminated` — `{ playerId }`
- `projectile_spawn / projectile_hit / projectile_expire` — 同 BR
- `trap_placed` — `{ id, kind, cx, cy, ownerId }`
- `trap_triggered` — `{ id, kind, cx, cy, victimId }`
- `skill_cast` — `{ kind: 'undo', playerId, hpRestored }`
- `teleport` — `{ playerId, from, to }`（validate trap 觸發）

### `shared/games/territory/` — 數據領地爭奪戰

| 檔案 | 內容 |
|---|---|
| `constants.js` | `ARENA_COLS=22, ARENA_ROWS=13`, `MAX_TEAMS=3`, `MOVE_SPEED=4.5`（cells/s）, `ROUND_DURATION_MS=180000`, `TEAM_COLORS`（3 套預設 palette：A 淺綠 / B 淺紅 / C 淺黃） |
| `simulation.js` | `partitionTeams(players)` 依人數分隊（4→2v2、6→3×2、奇數各半）；移動每 tick 經過新 cell → 標隊色；每 tick 對剛塗色的 team 跑 flood fill，任何「被自己隊色完全包圍」的連通區塊（含他隊色或空白）整塊翻色並 push `area_captured`。`getWinner` 依 `countByTeam` 最大隊回第一位 playerId |

### Territory `GameState` 形狀

```js
{
  phase, tick, startedAtMs, roundEndsAtMs,
  gameType: 'territory', config: {},
  teams: [{ id, name, color: {base, deep, edge}, playerIds: [...] }],
  players: { [id]: {
    id, characterId, teamId,
    x, y, moveX, moveY, aimAngle, facing, alive, paused,
  }},
  cells: { 'c,r': teamId },        // sparse，未出現的 key 代表空白
  nextCaptureId,
  events: [...],
}
```

### Territory 輸入 schema

```js
{ seq, moveX, moveY, aimAngle }
```

只吃 WASD（moveX/moveY）。無射擊、無技能。`aimAngle` 僅供 sprite facing 顯示。

### Territory Event types

- `paint` — `{ cells: [[c, r, teamId], ...] }`（這 tick 新塗色的格子）
- `area_captured` — `{ teamId, cells: [[c, r], ...] }`（flood fill 連鎖填滿）

---

## `packages/server/` — 權威遊戲伺服器

Express + socket.io，`src/index.js` 掛靜態 `../client/dist` 和 socket server，共用 `:3000`。同時初始化 `records.init(RECORDS_PATH || 'data/records.json')`。

### 核心模組

- **`lobby.js`**（`Lobby` 類別）：共用 lobby。管 slot、角色選擇、ready flag、bot 增減。多了 `gameType` 與 `config` 欄位 + `setGameType(host, gameType, config)`。切換 gameType 時會把所有真人的 `ready` 歸 false（避免上一款的 ready 帶過來誤觸發 START）。
- **`match.js`**（`Match` 通用 dispatcher）：建構子 `new Match(io, players, gameType, config, onEnd)`。透過 `loadGame(gameType)` 拿到 `{ sim, bot }`，tick loop 呼叫 `sim.*` 與 `bot.decideBotInput`。保留 event slice 機制（tick 頭記錄 `eventsStartIdx`、結尾 `slice`）。
- **`games/index.js`**：`GAMES` registry（gameType → `{ sim, bot }`），`loadGame(gameType)`。
- **`games/brBot.js`**：BR 的 `decideBotInput(state, botId, now)`。策略：死 → idle；腳下毒圈 → 逃往中心；視線內距離 ≤ `BULLET_MAX_DIST` → aim + attack；被 cover 擋視線 → 靠近不射；HP<40 → 60% 舉盾 + 2% dash 退敵。
- **`games/itemsBot.js`**：Items 的 `decideBotInput`。策略：低 HP 或凍結 → 施 `undo`（若非 silenced）；視線內敵人 → aim + attack + 視距離繞切線；距離 3–7 + MP 足 → 放 trap（優先 `freeze`，其次 `readonly / merge / validate`）。
- **`games/territoryBot.js`**：Territory 的 `decideBotInput`。策略：朝「離自己最近、偏邊緣、未被自己佔領」的格子走；分數 = 曼哈頓距離 + 2×邊緣距離。簡單 deterministic，容易圍出邊緣大區。
- **`records.js`**：in-memory + JSON 檔持久化（atomic rename + 1s debounce）。`recordMatch({ gameType, config, startedAt, endedAt, participants })` 新增 `gameType` 與 `config` 欄位。`MIN_REAL_PLAYERS=2` 與 `MAX_MATCHES=10` 不變。
- **`socketHandlers.js`**：把 socket event 綁到 Lobby / Match / Records 方法。`SET_GAME_TYPE` handler 已加。`START` 會帶 `lobby.gameType` + `lobby.config` 到 Match。

### 未使用但保留（第二階段多房間預留）

`room.js` / `rooms.js` / `test/rooms.test.js` 未被 `socketHandlers.js` 引用，但保留測試與程式碼結構，之後做多房間時重新接回。

---

## `packages/client/` — Vite + React 18

**無 client-side prediction、無 interpolation**——收到 snapshot 直接 `setState` 觸發 re-render。

### Screen 流程（`App.jsx`）

```
menu → modeSelect → [mapSelect (BR only)] → lobby → battle → gameover
menu → characters (CharacterBrowser)
menu → history (MatchHistory)
```

### 重要元件

- **`net/socket.js`** — `getSocket()` singleton（autoConnect、同源）
- **`components/SheetWindow.jsx`** — 7 層試算表外殼（TitleBar / MenuBar / Toolbar / FormulaBar / 內容 / TabBar / StatusBar）。`formula` 可接 JSX、`tabs` 接 `[{id,label}]`
- **`components/CharacterSprite.jsx`** — `CharacterSpriteSvg`（戰鬥畫面用，世界座標 1×1 unit，含 pixelBob + hurt flash + facing 水平翻轉）和 `CharacterSpriteImg`（HTML 版）
- **`screens/MainMenu.jsx`** — 歡迎頁 + Player Card（勝率 / 場次）+ 最近檔案 + 三張 template 卡進不同子頁
- **`screens/ModeSelect.jsx`** — 畫面 01，三款遊戲模式選擇（BR 可玩、Items/Territory 顯示 SOON）。`onModeSelected(id)` 呼叫 App router
- **`screens/battle/br/MapSelect.jsx`** — 畫面 02，Excel「插入圖表」對話框風格；左側 5 張 map 縮圖 + 右側大預覽 + 確定 / 取消
- **`screens/Lobby.jsx`** — 入 lobby 先 JOIN 再 SET_GAME_TYPE（host only，非 host 會被 server 拒絕但無副作用）。頁首顯示 mode+map 名稱
- **`screens/NetworkedBattle.jsx`** — 戰鬥層 dispatcher，依 `gameType` 路由到 `battle/br/BattleRoyale`、`battle/items/ItemsBattle`、未來的 `battle/territory/*`
- **`screens/battle/items/ItemsBattle.jsx`** — 道具戰主畫面；入場會顯示 `TutorialModal`（5 技能說明），關閉前輸入不送出
- **`screens/battle/items/ArenaItems.jsx`** — SVG viewBox `0 0 18 9`；格線 + traps（依 kind 顯示 emoji ❄/⊞/🔒/▼）+ players（shield/freeze/slow/silence debuff 環）+ bullets
- **`screens/battle/items/useInputItems.js`** — WASD + LMB held + 1–5 one-shot `SKILL_KEYS` 對應
- **`screens/battle/items/BattleHudItems.jsx`** — HP bar / MP bar / 5 技能槽（顯示 CD 或 MP 需求）/ debuff badges / 回合倒數 / 全員名單
- **`screens/battle/items/TutorialModal.jsx`** — 入場彈出的 5 技能說明 modal
- **`screens/battle/territory/TerritoryBattle.jsx`** — 領地爭奪主畫面；訂閱 SNAPSHOT，`area_captured` 進 log
- **`screens/battle/territory/ArenaTerritory.jsx`** — SVG viewBox `0 0 22 13`；sparse cell 渲染（只畫有被佔的格子）+ players 帶隊色環
- **`screens/battle/territory/useInputTerritory.js`** — 純 WASD，無滑鼠、無技能
- **`screens/battle/territory/BattleHudTerritory.jsx`** — 隊伍分數比例條 + 分色卡 + 倒數 + 隊伍名單
- **`screens/battle/br/BattleRoyale.jsx`** — BR 主戰鬥畫面，訂閱 SNAPSHOT、處理 events 進 log + 飄字 + hurt flash + 毒圈 banner
- **`screens/battle/br/ArenaBR.jsx`** — SVG viewBox `0 0 20 9`，靜態層（grid + covers）+ 動態層（poison cells + players + bullets）。滑鼠 aim 透過 `arenaRef` + `xMidYMid meet` letterbox 對齊
- **`screens/battle/br/useInputBR.js`** — WASD + 方向鍵 + 左鍵 held + 右鍵 held（shield）+ Shift one-shot（dash）
- **`screens/battle/br/BattleHudBR.jsx`** — HP bar / dash CD / shield icon / 毒圈下一波倒數 / 全員名單 / 操作提示
- **`styles/game-ui.css`** — 模式卡 / 按鈕 / md-kv 等共用類別（由 main.jsx import）
- **`index.html` 的 inline `<style>`** — 主題 CSS 變數（warm/green/blue）+ 關鍵 keyframes（`pixelBob`、`floatUp`、`hurtFlash`、`shieldBreath`、`sheetStripesSlide`）

### `packages/client/src/assets/characters/`

20 張 PNG 貼圖。新增 / 換皮膚要同時更新 `shared/characters.js` 與 PNG 檔名。

---

## 協定（client ↔ server）

**所有 event 名稱常數定義在 `packages/shared/src/protocol.js` 的 `MSG` 物件**。

| 方向 | Event (`MSG.*`) | Payload | 備註 |
|---|---|---|---|
| C→S | `JOIN` | `{ name, uuid }` | uuid 由 client `playerIdentity.js` 提供 |
| C→S | `PICK` | `{ characterId }` | |
| C→S | `READY` | `{ ready }` | |
| C→S | `SET_GAME_TYPE` | `{ gameType, config }` | host only；切換遊戲時重置所有 ready |
| C→S | `START` | `{}` | 只有 host 能成功觸發；Match 依 lobby.gameType 建立 |
| C→S | `INPUT` | 依 gameType 不同 | BR：`{seq, moveX, moveY, aimAngle, attack, shield, dash}` |
| C→S | `PAUSED` | `{ paused }` | 老闆鍵進 / 出 |
| C→S | `LEAVE` | `{}` | |
| C→S | `ADD_BOT` / `REMOVE_BOT` | `{}` / `{ botId }` | 僅 host |
| C→S | `GET_RECORDS` | `{}` | 拉全站戰績 snapshot |
| S→C | `LOBBY_STATE` | `{ players, gameType, config }` | |
| S→C | `MATCH_START` | `{ gameType, config, state }` | BR 的 state 已把 Set 轉成 array（`poison.infected` 等） |
| S→C | `SNAPSHOT` | 依 gameType 不同 | BR：`{tick, phase, players, bullets, poison, events}` |
| S→C | `MATCH_END` | `{ winnerId, summary }` | summary 是每人的 `{dmgDealt, dmgTaken, survivedTicks}` |
| S→C | `RECORDS` | `{ meta, players, matches }` | |
| S→C | `ERROR` | `{ code, msg }` | |

---

## 慣例與地雷

### 一定要遵守

- **ES modules 全面使用**：每個 package 的 `package.json` 都有 `"type": "module"`。普通 JS 用 `.js`，有 JSX 的 React 檔用 `.jsx`。
- **Client 禁止跑遊戲邏輯**：看到自己想在 client 算傷害、判斷勝負、處理碰撞，立刻停下來——那個邏輯屬於 `shared/games/<id>/`。
- **`shared/` 純淨**：不准 import `express`、`react`、`socket.io`，不准用 `window`、`fs`、`process.env`。
- **Excel 偽裝是核心賣點**：非戰鬥畫面一律走 `SheetWindow` 外殼 + CSS 變數（`var(--bg-chrome)` / `var(--ink)` / `var(--line-soft)` / `var(--accent)` …）；禁 emoji、禁 border-radius、禁漸層。
- **角色是皮膚**：三款遊戲在 simulation 層不看 character 的任何屬性（stats 已移除）。加新角色只要：`shared/characters.js` 增加一筆 + 放貼圖 PNG。
- **MSG 名稱只能在 protocol.js 定義**：其他檔案寫死 event 字串（例如 `'snapshot'`）雖然會動，但 refactor 會漏改。一律 `import { MSG } from '@office-colosseum/shared'`。

### 容易踩的坑

- **Socket connect race**：`io({ autoConnect: true })` 同步回傳 socket，但 `socket.id` 要等 `'connect'` event 才有值。mount 時 emit 必須 `if (socket.connected) ... else socket.once('connect', ...)`。
- **BR 座標 corner-origin**：viewBox `0 0 20 9`，x ∈ [0, 20], y ∈ [0, 9]。跟舊版 center-origin 不同。
- **BR covers 是矩形列表 `[c,r,w,h]`**：`simulation` 內用 `expandCovers` 轉成 `Set<"c,r">`。畫 mini-map 的時候**直接用矩形**（別展開成 cells，會多很多 DOM）。
- **BR bullets 是 float 座標**：命中用 `(p.x-x)² + (p.y-y)² ≤ (PLAYER_RADIUS+PROJECTILE_RADIUS)²`。SVG 直接用 `cx/cy` 對應世界座標。
- **BR aim 計算要扣 letterbox**：SVG 是 `xMidYMid meet`，所以 client 把滑鼠座標換算世界座標時要用 `scale = min(rect.w/COLS, rect.h/ROWS)`，非獨立縮放。`useInputBR` 已處理。
- **BR snapshot 裡 poison 是 array，server state 裡是 Set**：`buildSnapshotPayload` 負責轉換。client 讀 `poison.infected` 當 array 用、`severe` 做 O(1) 查詢前要轉成 `new Set(poison.severe)`。
- **`facing` 是 radians**：任何 `facing === 'left' ? -1 : 1` 這種字串判斷都是舊碼。需要水平翻轉貼圖時用 `Math.cos(facing) < 0`。
- **`SET_GAME_TYPE` host only**：非 host client 也可以 emit（我們的 Lobby.jsx 就會 emit），server 會回 `not_host` ERROR；client 忽略即可。這是**故意設計**成冪等的——永遠是 host 的版本會生效，LOBBY_STATE 會把正確 gameType 送給其他人。
- **`left 鍵拖出 arena 不放會卡住連打`**：`mouseup` 要掛 window 層（不是 arena），另外掛 `window blur` 一併放開。`useInputBR` 已處理。
- **BR events slice**：`match.js` 在 tick 開頭記錄 `eventsStartIdx = this.state.events.length`，tick 結尾用 `state.events.slice(eventsStartIdx)` 切出當 tick 事件再廣播。忘記 slice 的話事件永遠到不了 client。
- **Windows 路徑**：主要開發環境是 Windows，shell 是 bash/Git-Bash。寫 path 用正斜線（`/dev/null` 不要寫 `NUL`）。
- **smoke.js 需從 `packages/server/` 執行**（`npm run smoke --workspace @office-colosseum/server`），因為它 `spawn('src/index.js', ...)` 是相對路徑。

---

## 已知 v1 限制（刻意的）

- **無 client-side prediction／interpolation**：區網體感良好，WAN 上會明顯感覺到 lag。
- **斷線＝淘汰**：v1 不支援斷線重連，中場斷線直接判死。
- **同格不處理碰撞**：兩個玩家可以重疊在同一位置。
- **老闆鍵被凍住時仍可被攻擊**：故意的平衡設計。
- **戰績只保留最後 10 場**：`records.js` 的 `MAX_MATCHES` 常數；個人累計 running sum 不捨棄。
- **身分靠 localStorage UUID**：清 cookie / 換瀏覽器 / 私密模式 = 新身分。
- **Territory 隊伍隨機分配**：目前 Lobby 沒有隊伍選擇 UI，server 在 `createInitialState` 時依 player 加入順序輪詢分隊。若要玩家自選隊伍，需擴充 Lobby。
- **BR `dash` 無敵僅 0.2s**。
- **BR 毒圈規則**：30s 後第 1 波（四邊隨機 0.6 機率汙染）、之後每 15s 從 infected 鄰居 0.55 機率擴散；嚴重格扣血 ×2。

---

## 加新遊戲流程

三款遊戲（BR / Items / Territory）都按同一個模板接進多遊戲平台。未來要再加第四款：

1. `packages/shared/src/games/<id>/` 新增 `constants.js + simulation.js + index.js`；simulation 必須 export `createInitialState / applyInput / resolveTick / aliveCount / getWinner / buildSnapshotPayload / buildMatchStartPayload`
2. `packages/server/src/games/<id>Bot.js` 新 AI，export `decideBotInput(state, botId, now) → input`
3. 在 `packages/server/src/games/index.js` 的 `GAMES` 物件註冊 `{ sim, bot }`
4. `packages/shared/src/protocol.js` 的 `GAME_TYPES` 陣列加上 `<id>`
5. `packages/client/src/screens/battle/<id>/` 新戰鬥元件 + HUD + input hook
6. `NetworkedBattle.jsx` dispatcher 加分支
7. `ModeSelect.jsx` MODES 陣列加新卡（或把 `available: true` 解鎖）
8. `App.jsx` 路由：如果需要先選地圖／隊伍則在 modeSelect 之後加新 screen；否則直接進 lobby
9. CSS：如果有新的 class 名稱，補進 `packages/client/src/styles/game-ui.css`
