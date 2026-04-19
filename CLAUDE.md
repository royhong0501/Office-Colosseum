# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概觀

**Office Colosseum**——辦公室偽裝的區域網路多人對戰遊戲。外表看起來像 Excel 試算表（主選單、Lobby、HUD、老闆鍵覆蓋層都完整模仿 Excel chrome），實際是 2–8 人大逃殺。純鍵盤操作（WASD 移動 / J 普攻 / K 技能 / ESC 老闆鍵）。

設計假設：區網遊玩，延遲極低，所以採取「server 權威 + 無 client-side prediction」的最簡架構。

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
npm test                                                  # 所有 workspace 跑一遍
npm test --workspace @office-colosseum/shared             # 只跑 shared 的 node:test 單元測試
npm run smoke --workspace @office-colosseum/server        # 2-client 登入 lobby 的整合 smoke test
node --test packages/shared/test/simulation.test.js       # 單一檔案
```

`shared` 用原生 `node:test` + `node:assert/strict`，無任何測試 framework。

---

## 架構總覽

npm workspaces monorepo，**單向相依**：`client, server → shared`，`shared` 不依賴其他兩者。

```
packages/
  shared/   純 ES module — 常數、20 隻角色、傷害計算、權威模擬
  server/   Node + Express + socket.io — 擁有 GameState，30 Hz 廣播
  client/   Vite + React 18 + socket.io-client — 訂閱 snapshot 渲染
```

核心原則：**server 是權威，client 是啞視圖**。所有遊戲判定都在 server 跑，client 只負責渲染 server 送來的 snapshot 以及把鍵盤輸入打包丟回去。

### `packages/shared/` — 遊戲邏輯的唯一真實來源

純 ES module，**絕對不能**用到 `window`、`document`、`fs`、`process` 等任何平台 API。原因：server 會當成 node_modules import，client 會被 Vite bundle，兩邊都要能吃。

| 檔案 | 職責 |
|---|---|
| `constants.js` | 所有可調參數：`ARENA_COLS=16 ARENA_ROWS=10 MAX_PLAYERS=8 MIN_PLAYERS=2 TICK_RATE=30 TICK_MS=1000/30 MOVE_COOLDOWN_MS=150 SKILL_COOLDOWN_MS=5000 ATTACK_RANGE=2` |
| `characters.js` | 20 隻角色（10 貓 + 10 狗） |
| `math.js` | `manhattan(a,b)`、`clamp(v,lo,hi)`、`calculateDamage(attacker, defender, isSkill, rng)` |
| `spawns.js` | `getSpawnPositions(n)` 回傳最多 8 個不重複的出生點（四角 + 四邊中點） |
| `simulation.js` | `createInitialState / applyInput / resolveTick / aliveCount / getWinner`（下面詳述） |
| `protocol.js` | `MSG` 常數（client↔server 共用的 event 名稱） |

**角色資料 schema**（`characters.js`；client/server 共用的唯一真實來源）：

```js
{
  id: 'border_collie',          // snake_case，server 拿它當 key
  name: '邊境牧羊犬',             // 中文顯示名
  nameEn: 'Border Collie',      // 英文顯示名
  type: 'cat' | 'dog',          // 兩個陣營
  ascii: ['row1', 'row2', ...], // string[]（不是單一字串，渲染時 .join('\n')）
  stats: { hp, atk, def, spd, spc },
  skill: '牧羊凝視',             // 技能名（字串）
  skillDesc: '專注眼神鎖定...',   // 技能描述
  color: '#3A3A3A',             // CharacterBrowser 長條圖/邊框主色
}
```

⚠️ 欄位名常踩雷：是 **`ascii`（陣列）、`skill`、`skillDesc`**，不是 `asciiArt` / `skillName` / `description`。UI 碼亂用會爆 `Cannot read properties of undefined`。

**傷害公式**（寫死在 `math.js`）：

```
base     = isSkill ? atk.spc : atk.atk
variance = 0.85 + rng() × 0.3
raw      = max(1, floor(base × (1 − def/(def+80)) × variance))
final    = isSkill ? floor(raw × 1.5) : raw
```

`rng` 是**注入參數**，單元測試可以固定成 `() => 0.5` 來驗證確定性結果。production 會傳 `Math.random`。

**`GameState` 形狀**：

```js
{
  phase: 'lobby' | 'playing' | 'ended',
  tick: number,
  players: {
    [id]: {
      id, characterId,
      x, y,                 // 格子座標（0..15, 0..9）
      hp, maxHp,
      alive, paused,        // paused = 老闆鍵中，仍可被攻擊
      skillCdUntil,         // absolute ms timestamp，下次能使用技能的時間
      lastMoveAt,           // absolute ms timestamp，配合 MOVE_COOLDOWN_MS 用
      facing,               // 'left' | 'right'
    }
  },
  events: []  // 累積到目前為止的所有事件（damage / eliminated）
}
```

**`simulation.js` 的幾個規則細節**：

- `applyInput` 會 clone players 再改，保持 immutability；**同時把新產生的 damage event push 到 `state.events`**（不是只從 return 值拿）。
- 攻擊／技能會自動鎖定「最近的還活著的敵人」，只要曼哈頓距離 ≤ `ATTACK_RANGE`（2 格）就命中。client 不需要選目標。
- `resolveTick` 結尾把 `hp<=0` 的人 flip 成 `alive=false`，並在 `aliveCount<=1` 時設 `phase='ended'`。
- `paused=true` 時 `applyInput` 直接 return（打不出任何動作）——老闆鍵的 server 端實作。

### `packages/server/` — 權威遊戲伺服器

Express + socket.io，`src/index.js` 啟動時掛靜態 `../client/dist` 和 socket server，兩者共用同一個 `:3000` 端口。

三個核心類別／模組：

- **`lobby.js` (`Lobby` 類別)**：管 slot、角色選擇、ready flag。第一位連線者自動變 host，host 離開時自動把 host 權遞給下一個人（`leave` 裡的 host promotion 邏輯）。`canStart()` 要求 ≥ `MIN_PLAYERS` 且所有人都 ready 且都挑了角色。`resetForNewMatch()` 在 Match 結束後清掉所有人的 `ready=false`，**但保留 `characterId`**（讓玩家不用重選角色）。
- **`match.js` (`Match` 類別)**：拿 shared 的 `GameState` 跑 `setInterval(TICK_MS)` 的 30 Hz tick loop。每個 tick：drain input queue → 對每個 player 跑 `applyInput` → `resolveTick` → 廣播 `snapshot` → 若 ended 就 `match_end` → 觸發 `onEnd` callback 讓 `socketHandlers` 重置 lobby。同時維護每人的 `stats: {dmgDealt, dmgTaken, survivedTicks}` 給結算畫面用。
- **`socketHandlers.js`**：把 socket event 綁到 Lobby / Match 方法。`disconnect` 被視為離開 lobby + 取消暫停（對進行中的 match 就是淘汰）。Match 的 `onEnd` callback 會 null 掉 match ref 並呼叫 `lobby.resetForNewMatch()`。

**⚠️ Match tick 的 event 處理（容易踩雷）**：

`applyInput` 會把 damage event 累積到 `state.events` 陣列上，而 `resolveTick` 只回傳**那一 tick 新增的 eliminated event**。因此 `match.js:24` 在 tick 開頭記錄 `eventsStartIdx = this.state.events.length`，tick 結束時用 `state.events.slice(eventsStartIdx)` 切出這個 tick 所有新事件再廣播。如果忘記這個 slice，damage 數字就永遠到不了 client。

### `packages/client/` — Vite + React 18 純視圖

**無 client-side prediction、無 interpolation**。收到 `snapshot` 就直接 `setState`，讓 React re-render。輸入以 `TICK_MS` 間隔打包送出。

頂層 `main.jsx` 把 `<App />` 包在 `<ErrorBoundary>` 裡——任何 render 炸掉都會顯示 `#REF! — 發生錯誤` 卡片加重載按鈕，不會留下整片白屏。

路由在 `App.jsx`，**六個畫面**：`menu | lobby | battle | gameover | characters | history`。`MainMenu` 三顆按鈕分別跳 `lobby / characters / history`。`App.jsx` 同時掛了 `ConnectionBanner`（跨畫面的 socket 狀態橫幅）和 boss-key overlay。

重要模組：

- **`net/socket.js`**：`getSocket()` singleton，`io({ autoConnect: true })` 不指定 URL——同源連線，所以 dev 透過 Vite proxy、prod 透過 Express 同一個 port、Docker 透過 compose service 網路，同一份 code 都能用。
- **`hooks/useSocketStatus.js`**：訂閱 `connect / disconnect / connect_error`，回傳 `'connecting' | 'connected' | 'disconnected' | 'error'` 給 `ConnectionBanner` 顯示。
- **`screens/Lobby.jsx`**：**進場時不能直接 `socket.emit(JOIN)`，要先等 `socket.connected === true` 或 `socket.once('connect', ...)`**，不然 `socket.id` 是 `undefined`，後面 `sid.slice(0,4)` 會炸。挑角色時會檢查 `characterId` 欄位，渲染技能字串用 `picked.skill`（不是 `picked.skillName`）。
- **`screens/NetworkedBattle.jsx`**：訂閱 `MSG.SNAPSHOT`，每 tick 呼叫 `useInputCapture` 讀當前按鍵 state 並 emit `MSG.INPUT`。把 `events` 裡的 damage / eliminated 轉成戰鬥 log 和飄字動畫。
- **`screens/CharacterBrowser.jsx`**：獨立頁面，從 `ALL_CHARACTERS` 讀資料；有「全部 / 貓 / 犬」分頁、左側清單 + 右側 ASCII + 能力值長條圖（長條以 `color` 為底色）。無 server 互動。
- **`screens/MatchHistory.jsx`**：戰績報表佔位頁——目前專案**沒保存歷史對戰紀錄**，此頁永遠顯示 `#N/A — 尚無對戰紀錄`。要做的話要在 server 加持久化層。
- **`screens/battle/useInputCapture.js`**：`keysDown` Set 推導出 `dir`（held-key：WASD 或方向鍵）；`attack`/`skill`（J/K）是**一次性**的——讀完就從 Set 裡刪掉，避免一次長按變成每 tick 攻擊。
- **`screens/BossKey.jsx` + `hooks/useBossKey.js`**：ESC 切換全視窗 `季度報表_final_v3.xlsx` 假報表 overlay（z-index 9999），同時 emit `MSG.PAUSED`，讓 server 和其他 client 知道自己被凍住。**故意設計成「被凍住但仍可被攻擊」**——避免 ESC 變成無敵盾。
- **`components/ConnectionBanner.jsx`**：fixed top banner，斷線／錯誤時跳紅色橫幅。
- **`components/ErrorBoundary.jsx`**：class component 包住整個 App，避免單一 render 錯誤白屏。
- **`components/ExcelChrome.jsx` 家族**：無狀態的 Excel chrome（menu bar、toolbar、sheet tabs、status bar）+ `Cell / CellGrid / RadarChart / AsciiCharacter`。`theme.js` 匯出 `excelColors` 調色盤，任何 UI 改動都要用這組顏色才維持得住偽裝。

---

## 協定（client ↔ server）

**所有 event 名稱常數定義在 `packages/shared/src/protocol.js` 的 `MSG` 物件**。**絕對不要**在其他檔案寫死 event 字串——一律 `import { MSG } from '@office-colosseum/shared'`。新增 event 時先改 `protocol.js`。

| 方向 | Event (`MSG.*`) | Payload |
|---|---|---|
| C→S | `JOIN` | `{ name }` |
| C→S | `PICK` (`pick_character`) | `{ characterId }` |
| C→S | `READY` | `{ ready }` |
| C→S | `START` (`start_match`) | `{}` — 只有 host 能成功觸發 |
| C→S | `INPUT` | `{ seq, dir, attack, skill }` — 每 client tick 一筆 |
| C→S | `PAUSED` | `{ paused }` — 老闆鍵進／出 |
| C→S | `LEAVE` | `{}` |
| S→C | `LOBBY_STATE` | `{ players }` |
| S→C | `MATCH_START` | `{ state }` — 完整 initial GameState |
| S→C | `SNAPSHOT` | `{ tick, players, events }` — 30 Hz |
| S→C | `MATCH_END` | `{ winnerId, summary }` |
| S→C | `ERROR` | `{ code, msg }` |

**輸入的混合設計**：`dir` 是 held-key 狀態（`'up'/'down'/'left'/'right'/null`），每 tick 重送；`attack`/`skill` 是 bool 一次性事件，配合 monotonic `seq` 讓 server 能去重。

**Server 強制 `MOVE_COOLDOWN_MS=150`**：就算 client 以 100 Hz 連按，player 還是 6.67 格/秒。這條規則確保調高 `TICK_RATE` 不會讓角色瞬移。

---

## Docker 設計備忘

- `Dockerfile` 多階段（builder + runtime）。runtime 重新跑一次 `npm ci --omit=dev` 拿乾淨的 prod deps，從 builder 只 `COPY --from=builder /app/packages/client/dist`。Image ~260 MB。
- `Dockerfile.dev` **只裝依賴不 COPY source**——source 在 compose 階段 bind-mount 進來。這讓 dev image 不需要因為改 code 重 build。
- `docker-compose.yml` 的關鍵：每個 `node_modules/` 都用匿名 volume 蓋住（`/app/node_modules`、`/app/packages/*/node_modules`），避免本機 Windows 的 `node_modules/`（無 symlink）覆蓋容器內 `npm ci` 生出的 workspaces symlink。
- `packages/client/vite.config.js` 的 proxy target 是 `process.env.VITE_PROXY_TARGET || 'http://localhost:3000'`。本機跑沒設 env 就 fallback；compose 裡 client 服務吃 `http://server:3000`。

---

## 慣例與地雷

### 一定要遵守

- **ES modules 全面使用**：每個 package 的 `package.json` 都有 `"type": "module"`。普通 JS 用 `.js`，有 JSX 的 React 檔用 `.jsx`。
- **Client 禁止跑遊戲邏輯**：看到自己想在 client 算傷害、判斷勝負、處理碰撞時，立刻停下來——那個邏輯屬於 `shared/`，server 和 client 都從那邊 import。重複實作會導致兩端不一致。
- **測試用注入 RNG**：`calculateDamage` 的第四個參數 `rng` 在單元測試一律傳 `() => 某個固定值`，**永遠不要**在測試裡依賴 `Math.random`。
- **`shared/` 純淨**：不准 import `express`、`react`、`socket.io`，不准用 `window`、`fs`、`process.env`。只要這條守住，server 和 client 拿到的規則必然一致。
- **Excel 偽裝是核心賣點**：新的 UI 一律走 `ExcelChrome` 系列元件，用 `excelColors` 調色盤。任何不像試算表的介面（彩色按鈕、圓角、漸層）會直接破壞整個遊戲的存在意義。

### 容易踩的坑

- **角色欄位名**：`ascii`（陣列，不是 `asciiArt`）、`skill`（不是 `skillName`）、`skillDesc`。用錯就是 `Cannot read properties of undefined (reading 'split')` 系列錯誤。
- **Socket connect race**：`io({ autoConnect: true })` 回傳的 socket 是同步的，但 `socket.id` 要等 `'connect'` event 才有值。想在 mount 時 emit 必須先 `if (socket.connected) ... else socket.once('connect', ...)`。
- **`match.js` 的 event slice**：見上面「Match tick 的 event 處理」段落。
- **`useInputCapture` 的一次性按鍵**：`attack`/`skill` 必須在讀取後從 `keysDown` Set 刪掉，不然玩家按 J 不放會每 tick 打一下（server 其實擋不住，因為普攻沒冷卻）。
- **Socket event 字串**：寫死 `'snapshot'` 之類的字串可以跑、但 refactor 時會漏改——一律用 `MSG.SNAPSHOT`。
- **Windows 路徑**：主要開發環境是 Windows，但 shell 是 bash/Git-Bash。寫 path 用正斜線（`/dev/null` 不要寫 `NUL`；forward slashes）。跑 `docker run -v` bind mount 時路徑會被 Git-Bash 當 POSIX 亂 mangle，需要 `MSYS_NO_PATHCONV=1` prefix。
- **區網防火牆**：LAN 主機要手動在 Windows Defender 放行 :3000 inbound，不然同事連不進來。

---

## 已知 v1 限制（刻意的）

- **無 client-side prediction／interpolation**：區網體感良好，WAN 上會明顯感覺到 lag。要上網路對戰得先加 prediction 層。
- **斷線＝淘汰**：v1 不支援斷線重連，中場斷線直接判死。
- **同格不處理碰撞**：兩個玩家可以重疊在同一格，視覺上會看到 ASCII 疊在一起。
- **老闆鍵被凍住時仍可被攻擊**：故意的平衡設計，不是 bug，避免 ESC 變無敵盾。
- **戰績報表未實作**：`MatchHistory.jsx` 只是佔位頁，server 也沒有任何 match history 持久化——要做要加 DB/檔案層。
