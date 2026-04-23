# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 輸出語言

**與使用者對話、解釋、說明、commit message、註解、PR 描述一律使用繁體中文**。使用者是繁中母語者，除非對方明確切換成英文或要求英文輸出，不然所有 user-facing 文字都用繁中。程式碼識別字（變數名、function 名、檔名、event 名）維持英文，這是慣例也是避免 encoding 問題。

## 專案概觀

**Office Colosseum**——辦公室偽裝的區域網路多人對戰遊戲。外表看起來像 Excel 試算表（主選單、Lobby、HUD、老闆鍵覆蓋層都是名為「HiiiCalc」的統一試算表外殼），實際是 2–8 人大逃殺。滑鼠 + WASD 混合操作（WASD 移動 / 滑鼠 aim 決定朝向 / 左鍵普攻 / 右鍵技能 / ESC 老闆鍵）。

設計假設：區網遊玩，延遲極低，所以採取「server 權威 + 無 client-side prediction」的最簡架構。世界座標是連續浮點（不是格子），16:9 矩形競技場。

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

開啟 `http://localhost:5173`。Vite 的 proxy 讓 client 以為自己連的是同一台機器，所以同一份 `getSocket()` 程式碼在 dev 和 prod 都能用。

### Docker 開發（雙 container，HMR）

```bash
docker compose up --build
```

開啟 `http://localhost:5173`。bind mount `.:/app` + 每個 `node_modules/` 匿名 volume，保留容器內 npm workspaces 的 symlink（Windows filesystem 沒有 symlink 支援）。`docker-compose.yml` 的 `client` 服務吃 `VITE_PROXY_TARGET=http://server:3000` 這個 env，讓 client container 把 `/socket.io` 代理到 server container。

### 正式出 build（LAN 主機實際跑的流程）

```bash
# 純本機
npm run build      # vite build → packages/client/dist/
npm start          # Express 從 dist/ 出靜態檔 + socket.io，監聽 :3000

# 或 Docker（多階段 build，約 260 MB）
docker build -t office-colosseum .
docker run --rm -p 3000:3000 office-colosseum

# 或 prod compose
docker compose -f docker-compose.prod.yml up --build -d
```

開啟 `http://localhost:3000`。同事連 `http://<你的區網 IP>:3000`（Windows 要在防火牆放行 :3000 inbound）。

### 測試

```bash
npm test                                                   # 所有 workspace 跑一遍
npm test --workspace @office-colosseum/shared              # shared 的 node:test 單元測試
npm test --workspace @office-colosseum/server              # server 的 lobby / bot / records 單元測試
npm run smoke --workspace @office-colosseum/server         # 2-client 登入 lobby 的整合 smoke test
node --test packages/shared/test/simulation.test.js        # 單一檔案
```

所有 test 檔用原生 `node:test` + `node:assert/strict`，無任何測試 framework。

---

## 架構總覽

npm workspaces monorepo，**單向相依**：`client, server → shared`，`shared` 不依賴其他兩者。

```
packages/
  shared/   純 ES module — 常數、20 隻角色、傷害計算、權威模擬
  server/   Node + Express + socket.io — 擁有 GameState，30 Hz 廣播，JSON 戰績持久化
  client/   Vite + React 18 + socket.io-client — 訂閱 snapshot 渲染
```

核心原則：**server 是權威，client 是啞視圖**。所有遊戲判定（含技能命中與衝刺位移）都在 server 跑，client 只負責渲染 server 送來的 snapshot 以及把滑鼠 / 鍵盤輸入打包丟回去。

### `packages/shared/` — 遊戲邏輯的唯一真實來源

純 ES module，**絕對不能**用到 `window`、`document`、`fs`、`process` 等任何平台 API。原因：server 會當成 node_modules import，client 會被 Vite bundle，兩邊都要能吃。

| 檔案 | 職責 |
|---|---|
| `constants.js` | 所有可調參數（見下方整理表） |
| `characters.js` | 20 隻角色（10 貓 + 10 狗）。每隻都有 `skillKind` 決定技能走 projectile 還是瞬發判定 |
| `math.js` | `manhattan(a,b)` / `euclidean(a,b)` / `distSq(a,b)` / `clamp(v,lo,hi)` / `calculateDamage(attacker, defender, isSkill, rng, skillMult=1.5)` |
| `spawns.js` | `getSpawnPositions(n)` — 沿內縮 0.4× 邊界的橢圓均分，第 0 位在正上方 |
| `simulation.js` | `createInitialState / applyInput / resolveTick / aliveCount / getWinner / moveStepFor` |
| `protocol.js` | `MSG` 常數（client↔server 共用的 event 名稱） |
| `index.js` | 統一 re-export，server / client 都只 `import` 這一個 |

**關鍵常數**（`constants.js`）：

| 常數 | 值 | 用途 |
|---|---|---|
| `ARENA_WIDTH / ARENA_HEIGHT` | 24 / 13.5 | 競技場尺寸（世界單位），中心在 (0,0)，16:9 比例 |
| `PLAYER_RADIUS / PROJECTILE_RADIUS` | 0.5 / 0.2 | 碰撞半徑（歐氏距離判定） |
| `MIN_PLAYERS / MAX_PLAYERS` | 2 / 8 | Match 開始門檻與 lobby 上限 |
| `TICK_RATE / TICK_MS` | 30 / 33.33 | Server tick 頻率 |
| `MOVE_STEP / *_MIN / *_MAX` | 0.15 / 0.08 / 0.30 | baseline SPD=60 時每 tick 位移；`moveStepFor(charId)` 依 SPD 線性縮放 + clamp |
| `BASELINE_SPD` | 60 | 對應到 `MOVE_STEP` 的 SPD 基準值 |
| `ATTACK_COOLDOWN_MS / SKILL_COOLDOWN_MS` | 250 / 5000 | 普攻 4 shots/sec、技能 5 秒冷卻 |
| `PROJECTILE_SPEED / PROJECTILE_MAX_DIST` | 0.4 / 12 | 子彈每 tick 位移 + 最大射程 |
| `ATTACK_RANGE / BURST_MULT` | 2 / 1.0 | 近戰 strike/burst 生效距離（歐氏） |
| `DASH_DISTANCE / DASH_DMG_MULT` | 3 / 0.8 | dash 技能一次性位移 + 接觸傷害係數 |
| `SHIELD_DURATION_BASE_MS + SHIELD_SPC_MULT_MS` | 1500 + 25×spc | shield 持續時間 |
| `SHIELD_DAMAGE_MULT` | 0.5 | 盾期間所受傷害乘數 |
| `HEAL_PCT + HEAL_SPC_MULT` | 0.2 × maxHp + 0.4×spc | heal 回血量 |

**角色資料 schema**（`characters.js`；client/server 共用的唯一真實來源）：

```js
{
  id: 'border_collie',          // snake_case；同步對應 packages/client/src/assets/characters/<id>.png
  name: '邊境牧羊犬',
  nameEn: 'Border Collie',
  type: 'cat' | 'dog',
  ascii: ['row1', 'row2', ...], // 留給 CharacterBrowser 舊版顯示的備用資料
  stats: { hp, atk, def, spd, spc },
  skill: '牧羊凝視',             // 技能名（字串）
  skillDesc: '專注眼神鎖定...',
  skillKind: 'strike' | 'burst' | 'dash' | 'shield' | 'heal' | undefined,
  color: '#3A3A3A',             // CharacterBrowser 長條圖 / 戰鬥畫面 fallback 方塊底色
}
```

⚠️ 欄位名常踩雷：是 **`ascii`（陣列）、`skill`、`skillDesc`、`skillKind`**，不是 `asciiArt` / `skillName` / `description`。UI 碼亂用會爆 `Cannot read properties of undefined`。`skillKind` 未設定（`undefined`）會走預設的 projectile 分支（發一顆大子彈）。

**傷害公式**（寫死在 `math.js`）：

```
base     = isSkill ? atk.spc : atk.atk
variance = 0.85 + rng() × 0.3
raw      = max(1, floor(base × (1 − def/(def+80)) × variance))
final    = isSkill ? floor(raw × skillMult) : raw    // skillMult 預設 1.5
```

`rng` 是**注入參數**，單元測試可以固定成 `() => 0.5` 來驗證確定性結果。production 會傳 `Math.random`。`calculateDamage` 的第 5 個參數 `skillMult` 是 burst/dash 用來調整技能倍率（burst=1.0 / dash=0.8）的旋鈕。

**`GameState` 形狀**：

```js
{
  phase: 'playing' | 'ended',
  tick: number,
  players: {
    [id]: {
      id, characterId,
      x, y,                 // 浮點世界座標，範圍 [-ARENA_WIDTH/2, ARENA_WIDTH/2] × [-ARENA_HEIGHT/2, ARENA_HEIGHT/2]
      hp, maxHp,
      alive, paused,        // paused = 老闆鍵中，仍可被攻擊
      skillCdUntil,         // absolute ms timestamp
      lastAttackAt,         // absolute ms timestamp，配合 ATTACK_COOLDOWN_MS 節流
      facing,               // 弧度（radians），0 = 朝右（+X）、π/2 = 朝下（+Y）。由 client 的 aimAngle 每 tick 覆寫
      shieldedUntil,        // shield 技能生效截止的 absolute ms timestamp
    }
  },
  projectiles: [
    {
      id, ownerId, isSkill,
      x, y,                 // 浮點座標
      vx, vy,               // 每 tick 位移向量
      angle,                // 弧度，同 shooter 當下 facing
      traveled, spawnedAt,
    }
  ],
  nextProjectileId: number, // monotonic，用來配對 spawn/expire/hit event
  events: []                // 累積事件（見下方清單）
}
```

**Event types 清單**（寫到 `state.events`、tick 結尾切 slice 廣播）：

- `damage` — `{ sourceId, targetId, amount, isSkill, at: {x,y} }` — 投射物命中、近戰 strike / burst / dash 結算都會 emit
- `eliminated` — `{ playerId }` — hp 掉到 0 轉 `alive=false` 時
- `projectile_spawn` — `{ id, ownerId, x, y, angle, isSkill }`
- `projectile_hit` — `{ id, targetId }`
- `projectile_expire` — `{ id }` — 出界或超過 `PROJECTILE_MAX_DIST`
- `dash_move` — `{ playerId, from:{x,y}, to:{x,y} }` — dash 技能成功位移
- `shield_on` — `{ playerId, untilMs, at }`
- `heal` — `{ playerId, amount, at }`

**`simulation.js` 的幾個規則細節**：

- `applyInput(state, playerId, input, now, rng)` 回傳**新 state**（clone players / projectiles），並把新產生的 event append 到新 state 的 `events` 陣列尾端。
- **輸入 schema（`input` 物件）**：`{ seq, moveX, moveY, aimAngle, attack, skill }`。
  - `moveX / moveY` 是任意向量，`applyInput` 內部做 `Math.hypot` 正規化；同時按 WD 就斜向 45°。
  - `aimAngle` 是弧度（`Math.atan2(dy, dx)`），直接寫入 `player.facing`。**player 沒移動時 facing 也會每 tick 更新**——滑鼠在動畫面就跟著轉。
- **連續移動**：沒有 `MOVE_COOLDOWN_MS`；`moveStepFor(characterId)` 回傳 `clamp(MOVE_STEP × spd/60, 0.08, 0.30)`，每 tick 都會吃。SPD 越高每 tick 位移越大。
- **戰鬥分兩條路徑**：
  - 預設（`skillKind` 為 `undefined`）或按左鍵普攻：`spawnProjectile(...)` 朝 `facing` 射一顆子彈。子彈在 `resolveTick` 裡每 tick 前進 `PROJECTILE_SPEED`，命中用圓形碰撞 `(p.x-x)² + (p.y-y)² ≤ (PLAYER_RADIUS + PROJECTILE_RADIUS)²`。
  - 近戰 `strike` / `burst` / `dash`：**瞬發判定，不生子彈**，直接在 `applyInput` 內結算傷害並 push event。
  - `shield` / `heal`：只改 self 狀態（`shieldedUntil` / `hp`），不碰敵人。
- `shield` 生效時，**投射物命中與所有近戰技能都走 `applyShieldedDamage`**：傷害 × `SHIELD_DAMAGE_MULT=0.5`。
- `resolveTick` 結尾把 `hp<=0` 的人 flip 成 `alive=false`，並在 `aliveCount<=1` 時設 `phase='ended'`。
- `paused=true` 時 `applyInput` 直接 return（打不出任何動作）——老闆鍵的 server 端實作。

### `packages/server/` — 權威遊戲伺服器

Express + socket.io，`src/index.js` 啟動時掛靜態 `../client/dist` 和 socket server，兩者共用同一個 `:3000` 端口。同時初始化 `records.init(recordsPath)`，路徑可由 `RECORDS_PATH` env 覆寫（預設 `packages/server/data/records.json`）。

四個核心模組：

- **`lobby.js` (`Lobby` 類別)**：管 slot、角色選擇、ready flag、bot 增減。第一位連線者自動變 host，host 離開時把 host 權遞給下一個**真人**（bot 不會被任命為 host）。`canStart()` 要求 ≥ `MIN_PLAYERS` 且所有人都 ready 且都挑了角色。`resetForNewMatch()` 在 Match 結束後清掉所有 bot、把真人 ready 設 false，**但保留 `characterId`**。`join(socketId, name, uuid)` 對同一個 `socketId` 是 idempotent 的——重複呼叫只更新名字與 uuid、不會重複佔 slot。Host 可在 lobby 透過 `addBot(requesterId)` 新增隨機角色的 bot（`id='bot-N'`、`name='Bot-N'`、`uuid=null`、`ready=true`、`isBot=true`），上限 `MAX_PLAYERS=8`。`removeBot(requesterId, botId)` 限 host。`leave()` 後若沒有真人剩下，自動清掉所有 bot（空 lobby 保留 bot 無意義）。

- **`match.js` (`Match` 類別)**：拿 shared 的 `GameState` 跑 `setInterval(TICK_MS)` 的 30 Hz tick loop。每 tick：先為每個活著的 bot 呼叫 `decideBotInput(state, botId, now)` 塞進 input queue → drain input queue 每人跑 `applyInput` → `resolveTick` → 廣播 `snapshot` → 累加 `stats.{dmgDealt, dmgTaken, survivedTicks}` → match 結束時呼叫 `records.recordMatch({startedAt, endedAt, participants})` 持久化戰績、emit `MATCH_END`、觸發 `onEnd` callback 讓 `socketHandlers` 重置 lobby。

- **`records.js`**：in-memory state + JSON 檔持久化（atomic rename + 1s debounce）。資料結構：`{ version: 1, players: { [uuid]: {wins, matches, dmgDealt, ..., byCharacter: {}} }, matches: Match[] }`。Match 只保留最後 `MAX_MATCHES=10` 筆；**至少要有 `MIN_REAL_PLAYERS=2` 個非 bot 且帶 uuid 的參與者才會記錄**（避免一個真人 vs 一堆 bot 灌勝率）。`init(path)` 會嘗試讀既有檔案，格式錯誤或讀失敗就開空檔 + 寫 warning；`_reset()` / `_flush()` 是給測試的後門。

- **`socketHandlers.js`**：把 socket event 綁到 Lobby / Match / Records 方法。`JOIN` 帶 `{name, uuid}`（uuid 由 client `playerIdentity.js` 從 localStorage 讀或生成）。`GET_RECORDS` → `RECORDS` 把完整 snapshot 送給 client（給 MainMenu / MatchHistory 用）。`disconnect` 被視為離開 lobby + 取消暫停（對進行中的 match 就是淘汰）。Match 的 `onEnd` callback 會 null 掉 match ref 並呼叫 `lobby.resetForNewMatch()`。

- **`bot.js`**：純函式 `decideBotInput(state, botId, now)`，回傳跟真人 INPUT 同 shape 的輸入 `{seq, moveX, moveY, aimAngle, attack, skill}`。決策樹：死/沒敵人 → idle；找最近敵人（按 id 排序 tie-break 保持確定性）→ 算歐氏距離 → `dist ≤ PROJECTILE_MAX_DIST`：站住 + aim + `attack=true, skill=true`；`dist > PROJECTILE_MAX_DIST`：朝敵人方向推進、不開火；同點疊在一起：盲射當下 facing。**不讀 `state.projectiles`**——刻意界線，不躲彈不預判。Match tick 中對每個 `isBot && alive` 的 player 呼叫，包 try/catch fallback idle。

**⚠️ Match tick 的 event 處理（容易踩雷）**：

`applyInput` 會把 damage / dash_move / shield_on / heal / projectile_spawn event 累積到 `state.events` 陣列上，而 `resolveTick` 會再 append projectile_hit / projectile_expire / eliminated。因此 `match.js` 在 tick 開頭記錄 `eventsStartIdx = this.state.events.length`，tick 結束時用 `state.events.slice(eventsStartIdx)` 切出這個 tick 所有新事件再廣播。如果忘記這個 slice，damage 數字就永遠到不了 client。

### `packages/client/` — Vite + React 18 純視圖

**無 client-side prediction、無 interpolation**。收到 `snapshot` 就直接 `setState`，讓 React re-render。投射物只有 SVG 的 `transition: cx/cy 33ms linear` 做視覺平滑，本質還是離散 snapshot。輸入以 `TICK_MS` 間隔打包送出。

頂層 `main.jsx` 把 `<App />` 包在 `<ErrorBoundary>` 裡——任何 render 炸掉都會顯示錯誤卡片加重載按鈕，不會留下整片白屏。

路由在 `App.jsx`，**六個畫面**：`menu | lobby | battle | gameover | characters | history`。`App.jsx` 掛了 `ConnectionBanner`（跨畫面的 socket 狀態橫幅）、boss-key overlay，並在 mount 時呼叫 `applyTheme(loadTheme())` 設定 `<html data-theme=…>`。

重要模組：

- **`net/socket.js`**：`getSocket()` singleton，`io({ autoConnect: true })` 不指定 URL——同源連線，所以 dev 透過 Vite proxy、prod 透過 Express 同一個 port、Docker 透過 compose service 網路，同一份 code 都能用。
- **`lib/playerIdentity.js`**：玩家身分層。`getPlayerUuid()` 從 `localStorage.oc.playerUuid` 讀 v4 UUID、沒有就生成並寫入；localStorage 不可用時退回 session 記憶體（戰績會跟瀏覽器生命週期綁在一起）。`getStoredPlayerName()` / `setPlayerName(s)` 管 `oc.playerName`，最長 `PLAYER_NAME_MAX=16` 字元；`getJoinName()` 回傳 trimmed name 或 fallback `Player-xxxx`。
- **`theme/themeVars.js`**：3 組主題 `warm / green / blue`，實際 CSS 變數（`--bg-chrome`、`--ink`、`--line-soft`、`--accent` …）定義在 `packages/client/index.html` 的 inline `<style data-theme>`；切換只是 set `data-theme` attribute，存 `localStorage.hiiicalc.theme`。
- **`hooks/useSocketStatus.js`**：訂閱 `connect / disconnect / connect_error`，回傳 `'connecting' | 'connected' | 'disconnected' | 'error'` 給 `ConnectionBanner`。
- **`hooks/useBossKey.js`**：ESC keydown 切 `hidden`，同時 emit `MSG.PAUSED` 給 server。
- **`screens/MainMenu.jsx`**：三大範本縮圖（連線對戰 / 角色資料庫 / 戰績報表）、名字編輯輸入框（寫回 localStorage）、Player Card 顯示場次 / 勝率 / 常用角色、最近檔案清單。mount 時呼叫 `MSG.GET_RECORDS` 從 server 拉 snapshot，沒拿到之前統計欄位就顯示 `—`。
- **`screens/Lobby.jsx`**：**進場時不能直接 `socket.emit(JOIN)`，要先等 `socket.connected === true` 或 `socket.once('connect', ...)`**，不然 `socket.id` 是 `undefined`。JOIN payload 帶 `{name: getJoinName(), uuid: getPlayerUuid()}`。UI 是左右兩欄：左邊「參賽者名冊」工作表（host 有 `+新增 Bot` 與每列移除鈕）、右邊貓/狗方分區角色格（用 `CharacterSpriteImg` 的 PNG）。
- **`screens/NetworkedBattle.jsx`**：訂閱 `MSG.SNAPSHOT`，每 tick 呼叫 `useInputCapture` 讀輸入並 emit `MSG.INPUT`。收到 snapshot 把 `events` 轉成戰鬥 log 和飄字動畫；`projectile_spawn` 在 `shootingIds` Set 裡短暫（180ms）標記射擊者，damage event 在 `hurtIds` Set 裡短暫（220ms）標記受擊者觸發 hurt flash；`dash_move` / `shield_on` / `heal` 各自產生 log 行 + 飄字（`»»»` / `盾` / `+N`）。
- **`screens/battle/ArenaDisk.jsx`**：**名字雖然叫 Disk，其實是 16:9 矩形場地**（歷史包袱，早期是圓形）。SVG viewBox 等於世界座標範圍 `{-halfW, -halfH, W, H}`，`preserveAspectRatio="xMidYMid meet"` 等比置中；上層有 Excel 格線（每 1 世界單位）+ 中心十字。玩家用 `CharacterSpriteSvg` 畫、底下加高亮環（自己綠、敵人紅）；投射物用 SVG `<circle>` 浮點座標、金色（普攻）或紅色（技能）+ drop-shadow。Effects overlay 是獨立 HTML 層，把世界座標換算成 %。
- **`screens/battle/useInputCapture.js`**：**滑鼠 + WASD 混合**，return 一個 `readInput()` function 每 tick 被呼叫。
  - WASD / 方向鍵 → `moveX`、`moveY` 單位向量（held-key）
  - 滑鼠位置 → `aimAngle`（弧度）。計算時用 `scale = min(rect.width/ARENA_WIDTH, rect.height/ARENA_HEIGHT)` 對應 SVG `xMidYMid meet` 的 letterbox；aim 是相對於自己當前世界座標的角度（需要外部傳 `selfPosRef`，由 NetworkedBattle 每次收 snapshot 更新）。
  - 左鍵 → `attack = leftDown.current`（held）。`mouseup` 掛 window 層（避免滑鼠拖出 arena 放開時卡住）+ `blur` 也視為放開（alt-tab、切老闆鍵）。
  - 右鍵 → `skill = skillPending.current`（**one-shot**，讀完立即 `false`）。掛 `contextmenu preventDefault` 阻右鍵選單。
- **`screens/battle/BattleHUD.jsx` / `BattleLog.jsx`**：HP 條 + 技能 cooldown 計時 / 固定高度的 formula-bar 風戰鬥 log（固定高度是避免對戰中畫面往上移，早期 bug）。
- **`screens/BossKey.jsx`**：ESC 切換全視窗 `季度報表_final_v3.xlsx` 假報表 overlay（z-index 9999），同時 emit `MSG.PAUSED`。**故意設計成「被凍住但仍可被攻擊」**——避免 ESC 變成無敵盾。
- **`screens/CharacterBrowser.jsx`**：獨立頁面，從 `ALL_CHARACTERS` 讀資料；「全部 / 貓 / 犬」分頁、左側清單 + 右側角色詳情（用 `CharacterSpriteImg` 的 PNG + 能力值長條圖）。無 server 互動。
- **`screens/MatchHistory.jsx`**：**已實作**，用 `MSG.GET_RECORDS` 拉全站戰績 snapshot，顯示總覽卡 + 最近對戰列表（按 `endedAt` 排序）+ 個人角色統計。若 server 無資料顯示 `#N/A — 尚無對戰紀錄`。
- **`components/SheetWindow.jsx`**：**所有非戰鬥畫面的統一外殼**。由上而下 7 層：TitleBar / MenuBar / Toolbar / FormulaBar / 內容 / TabBar / StatusBar，邊框全部 `1px solid var(--line-soft)`，**禁用 emoji、border-radius、漸層**。StatusBar 右邊掛 `StatusBarThemeSelect` 切主題。
- **`components/CharacterSprite.jsx`**：匯出 `CharacterSpriteSvg`（戰鬥畫面的 SVG `<image>`，含 pixelBob 待機動畫 + hurt flash + facing 水平翻轉 `cos(facing)<0`）、`CharacterSpriteImg`（HTML `<img>`，給 MainMenu / Lobby / Browser）。用 `import.meta.glob('../assets/characters/*.png', {eager:true})` build-time 收集，檔名（`<id>.png`）對應 character id。沒有 PNG 會走 fallback（彩色方塊 + 名稱首字）。
- **`components/ConnectionBanner.jsx` / `ErrorBoundary.jsx`**：斷線橫幅 + 全域 error boundary。
- **`theme.js`**：`excelColors` 調色盤，主要是 ArenaDisk 戰鬥畫面還在用（`cellBg`、`greenAccent`）；非戰鬥畫面一律走 CSS 變數。
- **動畫 keyframe 寫在 `index.html`**：`pixelBob`（角色待機浮動）、`hurtFlash`、`floatUp`（傷害飄字）、`sheetStripesSlide`（lobby 進度條）等都在 `packages/client/index.html` 的 inline `<style>`。React 元件只用 `animation: 'pixelBob 1.6s ...'` 字串引用——搬動畫時兩邊要一起改。

### `packages/client/src/assets/characters/`

20 張 PNG 貼圖（每隻角色一張，檔名 = character id，例如 `border_collie.png`）。Vite glob import + `imageRendering: 'pixelated'` 渲染。新增角色時除了改 `shared/characters.js`，也要放一張同名 PNG，否則會走 fallback 方塊。

---

## 協定（client ↔ server）

**所有 event 名稱常數定義在 `packages/shared/src/protocol.js` 的 `MSG` 物件**。**絕對不要**在其他檔案寫死 event 字串——一律 `import { MSG } from '@office-colosseum/shared'`。新增 event 時先改 `protocol.js`。

| 方向 | Event (`MSG.*`) | Payload |
|---|---|---|
| C→S | `JOIN` | `{ name, uuid }` — uuid 由 client `playerIdentity.js` 提供 |
| C→S | `PICK` (`pick_character`) | `{ characterId }` |
| C→S | `READY` | `{ ready }` |
| C→S | `START` (`start_match`) | `{}` — 只有 host 能成功觸發 |
| C→S | `INPUT` | `{ seq, moveX, moveY, aimAngle, attack, skill }` — 每 client tick 一筆 |
| C→S | `PAUSED` | `{ paused }` — 老闆鍵進 / 出 |
| C→S | `LEAVE` | `{}` |
| C→S | `ADD_BOT` | `{}` — 僅 host；滿 / 非 host / 進行中時回 ERROR |
| C→S | `REMOVE_BOT` | `{ botId }` — 僅 host；目標必須是 bot 否則 ERROR |
| C→S | `GET_RECORDS` | `{}` — 拉全站戰績 snapshot |
| S→C | `LOBBY_STATE` | `{ players }` — 含 `isHost / isBot / uuid / characterId / ready` |
| S→C | `MATCH_START` | `{ state }` — 完整 initial GameState |
| S→C | `SNAPSHOT` | `{ tick, players, projectiles, events }` — 30 Hz |
| S→C | `MATCH_END` | `{ winnerId, summary }` — summary 是每人的 `{dmgDealt, dmgTaken, survivedTicks}` |
| S→C | `RECORDS` | `{ meta, players, matches }` — records.js 的 `getSnapshot()` |
| S→C | `ERROR` | `{ code, msg }` |

**輸入的混合設計**：
- `moveX / moveY` 是任意向量 held-key（WASD/方向鍵每 tick 重送）；server 端 `Math.hypot` 正規化後乘 SPD 縮放的 `moveStepFor(...)` 每 tick 位移。
- `aimAngle` 是弧度，每 tick 送。**facing 每 tick 覆寫**，即使角色不動也會跟著滑鼠轉——這是普攻方向也是近戰技能扇形中心。
- `attack` 是 held-key bool（左鍵按住），server 靠 `ATTACK_COOLDOWN_MS=250` 節流成 4 shots/sec。
- `skill` 是 **one-shot bool**（右鍵點擊）——`useInputCapture` 讀完立刻 `skillPending=false`，避免一次點擊在 cooldown 結束瞬間再觸發；server 端另外檢查 `skillCdUntil`。
- 所有 INPUT 帶 monotonic `seq`，留給未來做 input replay / 去重的空間。

---

## Docker 設計備忘

- `Dockerfile` 多階段（builder + runtime）。runtime 重新跑一次 `npm ci --omit=dev` 拿乾淨的 prod deps，從 builder 只 `COPY --from=builder /app/packages/client/dist`。Image ~260 MB。
- `Dockerfile.dev` **只裝依賴不 COPY source**——source 在 compose 階段 bind-mount 進來。這讓 dev image 不需要因為改 code 重 build。
- `docker-compose.yml` 的關鍵：每個 `node_modules/` 都用匿名 volume 蓋住（`/app/node_modules`、`/app/packages/*/node_modules`），避免本機 Windows 的 `node_modules/`（無 symlink）覆蓋容器內 `npm ci` 生出的 workspaces symlink。
- `packages/client/vite.config.js` 的 proxy target 是 `process.env.VITE_PROXY_TARGET || 'http://localhost:3000'`。本機跑沒設 env 就 fallback；compose 裡 client 服務吃 `http://server:3000`。

---

## Fly.io 部署

`fly.toml`（app: `office-colosseum`，region: `nrt`）定義了單台 shared-cpu-1x / 256 MB machine，吃 production `Dockerfile`。關鍵設定：

- `auto_stop_machines = 'suspend'` + `min_machines_running = 1`：沒流量時 suspend（不是 stop）冷啟比較快；至少保留一台不關機，避免 lobby 裡的玩家被切斷 socket。
- `max_machines_running = 1`：**刻意不水平擴展**，因為 GameState 與 records.js 都是 in-memory 的單例，多台 machine 之間沒有共用 state。要擴展得先把 lobby/match/records 改成跨 machine 共享（Redis pub/sub 或 shared DB）。
- `internal_port = 3000`：與 Express 同 port，socket.io 走同一條 HTTPS upgrade。
- **戰績持久化**：預設寫 `packages/server/data/records.json`——Fly.io 沒掛 volume 時這個路徑在 suspend 重啟後會消失。要持久化得另外掛 `fly volumes create` 並設 `RECORDS_PATH` env 指向掛載點。

部署指令：`fly deploy`（assume 已經 `fly auth login`）。Dockerfile 與本機 prod image 共用，不需要額外 build artifact。

---

## 慣例與地雷

### 一定要遵守

- **ES modules 全面使用**：每個 package 的 `package.json` 都有 `"type": "module"`。普通 JS 用 `.js`，有 JSX 的 React 檔用 `.jsx`。
- **Client 禁止跑遊戲邏輯**：看到自己想在 client 算傷害、判斷勝負、處理碰撞、或自行推進 dash/shield 狀態時，立刻停下來——那個邏輯屬於 `shared/`，server 和 client 都從那邊 import。重複實作會導致兩端不一致。
- **測試用注入 RNG**：`calculateDamage` 的第四個參數 `rng` 在單元測試一律傳 `() => 某個固定值`，**永遠不要**在測試裡依賴 `Math.random`。
- **`shared/` 純淨**：不准 import `express`、`react`、`socket.io`，不准用 `window`、`fs`、`process.env`。只要這條守住，server 和 client 拿到的規則必然一致。
- **Excel 偽裝是核心賣點**：非戰鬥畫面一律走 `SheetWindow` 外殼 + CSS 變數（`var(--bg-chrome)` / `var(--ink)` / `var(--line-soft)` / `var(--accent)` …）；禁 emoji、禁 border-radius、禁漸層。任何不像試算表的介面會直接破壞整個遊戲的存在意義。

### 容易踩的坑

- **角色欄位名**：`ascii`（陣列，不是 `asciiArt`）、`skill`（不是 `skillName`）、`skillDesc`、`skillKind`。用錯就是 `Cannot read properties of undefined (reading 'split')` 系列錯誤。新增角色若 skill 要走 projectile 以外的路徑，**必須填 `skillKind`**（`strike` / `burst` / `dash` / `shield` / `heal`），否則 fallback 會生一顆大子彈。
- **Socket connect race**：`io({ autoConnect: true })` 回傳的 socket 是同步的，但 `socket.id` 要等 `'connect'` event 才有值。想在 mount 時 emit 必須先 `if (socket.connected) ... else socket.once('connect', ...)`。即便如此，重複 JOIN 已經是 idempotent 的（見 `Lobby.join`），所以 race 的後果最多是 UI 沒更新而不是重複佔 slot。
- **`match.js` 的 event slice**：見上面「Match tick 的 event 處理」段落。
- **`useInputCapture` 的按鍵處理**：`skill`（右鍵）必須在讀取後把 `skillPending.current = false`，`attack`（左鍵）**不要改**——因為 attack 靠 server 端 `ATTACK_COOLDOWN_MS` 節流，使用者體感就是「按住連發」。兩者若搞反，右鍵會變 4 shots/sec 的連發，左鍵會變一次性。
- **左鍵拖出 arena 不放會卡住連打**：`mouseup` 要掛 window 層（不是 arena），另外掛 `window blur` 一併放開。早期只掛 arena mouseup 會卡（曾是 bug `bb8a75c`）。
- **`facing` 改成弧度**：任何 `facing === 'left' ? -1 : 1` 或 `if (facing === 'up')` 這種字串判斷都是舊碼，會炸——`facing` 現在是 number（radians）。需要水平翻轉貼圖時用 `Math.cos(facing) < 0`。
- **Projectile 的 `x/y` 是浮點**：不是格子座標，命中判定用歐氏距離平方 `(p.x-x)² + (p.y-y)² ≤ (PLAYER_RADIUS+PROJECTILE_RADIUS)²`。SVG 直接用浮點 `cx / cy` 對應世界座標（viewBox 已對齊）。
- **Aim 計算要扣掉 letterbox**：SVG 是 `xMidYMid meet`（等比置中），所以 client 把滑鼠座標換算到世界座標時要用 `scale = min(rect.w/W, rect.h/H)` 而不是各軸獨立縮放，否則滑鼠偏離中心時 aim 會歪。
- **動畫 keyframe 寫在 `index.html`**：`pixelBob` / `hurtFlash` / `floatUp` / `sheetStripesSlide` 都在 `packages/client/index.html` 的 inline `<style>`。React 元件只用字串引用——搬動畫時兩邊要一起改。
- **Socket event 字串**：寫死 `'snapshot'` 之類的字串可以跑、但 refactor 時會漏改——一律用 `MSG.SNAPSHOT`。
- **Windows 路徑**：主要開發環境是 Windows，但 shell 是 bash/Git-Bash。寫 path 用正斜線（`/dev/null` 不要寫 `NUL`；forward slashes）。跑 `docker run -v` bind mount 時路徑會被 Git-Bash 當 POSIX 亂 mangle，需要 `MSYS_NO_PATHCONV=1` prefix。
- **區網防火牆**：LAN 主機要手動在 Windows Defender 放行 :3000 inbound，不然同事連不進來。
- **Bot AI 與 simulation schema 耦合**：`packages/server/src/bot.js` 直接讀 `state.players[id].{x, y, alive, facing}`；simulation.js 改 schema 時 bot 會連帶壞。Bot 單元測試會第一個變紅——相信測試，別單獨修 bot.js 讓綠燈回來而不看 schema 是否真的改動。
- **Records 門檻與 UUID**：`records.recordMatch` 會過濾 `!isBot && uuid` 才計入；`uuid=null`（bot 或 legacy client）不會計入個人勝率。MainMenu 那張 Player Card 靠 localStorage UUID 認人——**清空 localStorage = 戰績從此跟這個瀏覽器解綁**（沒有伺服器端的帳號系統）。

---

## 已知 v1 限制（刻意的）

- **無 client-side prediction／interpolation**：區網體感良好，WAN 上會明顯感覺到 lag。要上網路對戰得先加 prediction 層。
- **斷線＝淘汰**：v1 不支援斷線重連，中場斷線直接判死。
- **同格不處理碰撞**：兩個玩家可以重疊在同一位置，視覺上會看到貼圖疊在一起。子彈碰到任一個都會結算傷害。
- **老闆鍵被凍住時仍可被攻擊**：故意的平衡設計，不是 bug，避免 ESC 變無敵盾。
- **戰績只保留最後 10 場**：寫在 `records.js` 的 `MAX_MATCHES` 常數；超過會捨棄最舊的。個人累計 `players[uuid]` 是 running sum，不會跟著捨棄。
- **身分靠 localStorage UUID**：清 cookie / 換瀏覽器 / 私密模式 = 新身分。沒有伺服器帳號系統。
- **Fly.io 單機、沒掛 volume 時戰績會掉**：suspend 重啟後 in-memory 和檔案一起消失（預設 `data/records.json` 寫在容器 layer）。要持久化需掛 fly volume + 設 `RECORDS_PATH`。
