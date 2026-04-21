# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 輸出語言

**與使用者對話、解釋、說明、commit message、註解、PR 描述一律使用繁體中文**。使用者是繁中母語者，除非對方明確切換成英文或要求英文輸出，不然所有 user-facing 文字都用繁中。程式碼識別字（變數名、function 名、檔名、event 名）維持英文，這是慣例也是避免 encoding 問題。

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
| `constants.js` | 所有可調參數：`ARENA_COLS=16 ARENA_ROWS=10 MAX_PLAYERS=8 MIN_PLAYERS=2 TICK_RATE=30 TICK_MS=1000/30 MOVE_COOLDOWN_MS=150 SKILL_COOLDOWN_MS=5000 ATTACK_COOLDOWN_MS=250 PROJECTILE_SPEED=0.4 PROJECTILE_MAX_DIST=12` |
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
      x, y,                 // 格子座標（整數，0..15, 0..9）
      hp, maxHp,
      alive, paused,        // paused = 老闆鍵中，仍可被攻擊
      skillCdUntil,         // absolute ms timestamp，下次能使用技能的時間
      lastMoveAt,           // absolute ms timestamp，配合 MOVE_COOLDOWN_MS 用
      lastAttackAt,         // absolute ms timestamp，配合 ATTACK_COOLDOWN_MS 用
      facing,               // 'up' | 'down' | 'left' | 'right'
    }
  },
  projectiles: [            // 飛行中的子彈／技能投射物
    {
      id, ownerId, isSkill,
      x, y,                 // 浮點座標（格子小數位置）
      vx, vy,               // 每 tick 位移（PROJECTILE_SPEED 乘上方向向量）
      facing, traveled, spawnedAt,
    }
  ],
  nextProjectileId: number, // monotonic，用來配對 spawn/expire/hit event
  events: []                // 累積事件：damage / eliminated / projectile_spawn / projectile_hit / projectile_expire
}
```

**`simulation.js` 的幾個規則細節**：

- `applyInput` 會 clone players 再改，保持 immutability；**同時把新產生的 damage / projectile_spawn event push 到 `state.events`**（不是只從 return 值拿）。
- **戰鬥是 projectile-based 而不是自動鎖定**：按 J 在 `facing` 方向生一顆普攻子彈，按 K 生一顆技能子彈（視覺較大、傷害走 `spc` × 1.5）。子彈在 `resolveTick` 裡每 tick 以 `PROJECTILE_SPEED` 前進，碰到敵人格子（`Math.round(x/y)` 對齊）就結算傷害；出界或超過 `PROJECTILE_MAX_DIST` 則 expire。client 需要自己對準方向。
- **任何方向鍵都會更新 `facing`，就算移動被邊界擋住**：站在左牆按 A 不會移動，但 `facing` 會變 `'left'`，下一發普攻就往左打。
- `applyInput` 裡普攻吃 `ATTACK_COOLDOWN_MS=250` 節流（4 shots/sec），技能吃 `SKILL_COOLDOWN_MS=5000`。
- `resolveTick` 結尾把 `hp<=0` 的人 flip 成 `alive=false`，並在 `aliveCount<=1` 時設 `phase='ended'`。
- `paused=true` 時 `applyInput` 直接 return（打不出任何動作）——老闆鍵的 server 端實作。

### `packages/server/` — 權威遊戲伺服器

Express + socket.io，`src/index.js` 啟動時掛靜態 `../client/dist` 和 socket server，兩者共用同一個 `:3000` 端口。

三個核心類別／模組：

- **`lobby.js` (`Lobby` 類別)**：管 slot、角色選擇、ready flag。第一位連線者自動變 host，host 離開時自動把 host 權遞給下一個人（`leave` 裡的 host promotion 邏輯）。`canStart()` 要求 ≥ `MIN_PLAYERS` 且所有人都 ready 且都挑了角色。`resetForNewMatch()` 在 Match 結束後清掉所有人的 `ready=false`，**但保留 `characterId`**（讓玩家不用重選角色）。`join()` 對同一個 `socketId` 是 idempotent 的——重複呼叫只會 re-broadcast 現有狀態，不會重複佔 slot，所以 client 重連時多 emit 一次 JOIN 是安全的。 Host 可在 lobby 透過 `addBot(requesterId)` 新增隨機角色的 bot（`id = 'bot-N'`、`name = 'Bot-N'`、`ready: true`、`isBot: true`），上限 `MAX_PLAYERS=8`。`removeBot(requesterId, botId)` 移除。`resetForNewMatch()` 會清掉所有 bot 並重置 `nextBotSeq`。`leave()` 後若沒有真人剩下，自動清空所有 bot（空 lobby 保留 bot 無意義）。
- **`match.js` (`Match` 類別)**：拿 shared 的 `GameState` 跑 `setInterval(TICK_MS)` 的 30 Hz tick loop。每個 tick：drain input queue → 對每個 player 跑 `applyInput` → `resolveTick` → 廣播 `snapshot` → 若 ended 就 `match_end` → 觸發 `onEnd` callback 讓 `socketHandlers` 重置 lobby。同時維護每人的 `stats: {dmgDealt, dmgTaken, survivedTicks}` 給結算畫面用。
- **`socketHandlers.js`**：把 socket event 綁到 Lobby / Match 方法。`disconnect` 被視為離開 lobby + 取消暫停（對進行中的 match 就是淘汰）。Match 的 `onEnd` callback 會 null 掉 match ref 並呼叫 `lobby.resetForNewMatch()`。
- **`bot.js`**：純函式 `decideBotInput(state, botId, now)`，回傳跟真人 INPUT 同 shape 的輸入。決策樹：死/沒敵人 → idle；未對齊 → 縮較小軸；對齊且在 `PROJECTILE_MAX_DIST` 內 → 面向 target + attack + skill；對齊但超距 → 面向推進不開火；同格疊在一起 → 盲射。**不讀 `state.projectiles`**——刻意界線，不躲彈不預判。Match tick 中對每個 `isBot && alive` 的 player 呼叫，包 try/catch fallback idle。

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
- **`screens/NetworkedBattle.jsx`**：訂閱 `MSG.SNAPSHOT`，每 tick 呼叫 `useInputCapture` 讀當前按鍵 state 並 emit `MSG.INPUT`。把 `events` 裡的 damage / eliminated 轉成戰鬥 log 和飄字動畫；`projectile_spawn` 會在 `shootingIds` Set 裡短暫（180ms）標記射擊者讓 `PixelCharacter` 播射擊動畫，damage event 會在 `hurtIds` Set 裡短暫（220ms）標記受擊者觸發 hurt flash。
- **`screens/battle/ArenaGrid.jsx`**：靜態視圖。每格固定 28×28px，用 `PixelCharacter` 畫玩家，並覆上一層 SVG `<circle>` 畫 `projectiles`（座標是浮點，位於 `z-index: 30` 的 overlay 上）。普攻子彈金色、技能子彈紅色，都帶 drop-shadow。
- **`screens/CharacterBrowser.jsx`**：獨立頁面，從 `ALL_CHARACTERS` 讀資料；有「全部 / 貓 / 犬」分頁、左側清單 + 右側 ASCII + 能力值長條圖（長條以 `color` 為底色）。無 server 互動。**注意：CharacterBrowser 仍用 `AsciiCharacter`，只有戰鬥畫面換成 `PixelCharacter`**。
- **`screens/MatchHistory.jsx`**：戰績報表佔位頁——目前專案**沒保存歷史對戰紀錄**，此頁永遠顯示 `#N/A — 尚無對戰紀錄`。要做的話要在 server 加持久化層。
- **`screens/battle/useInputCapture.js`**：`keysDown` Set 推導出 `dir`（held-key：WASD 或方向鍵）；`attack`（J）是 **held-key**，讀完不刪，靠 server 的 `ATTACK_COOLDOWN_MS` 節流；`skill`（K）是**一次性**的——讀完從 Set 裡刪掉，避免一次長按在 cooldown 結束那瞬間立刻再觸發。
- **`screens/BossKey.jsx` + `hooks/useBossKey.js`**：ESC 切換全視窗 `季度報表_final_v3.xlsx` 假報表 overlay（z-index 9999），同時 emit `MSG.PAUSED`，讓 server 和其他 client 知道自己被凍住。**故意設計成「被凍住但仍可被攻擊」**——避免 ESC 變成無敵盾。
- **`components/ConnectionBanner.jsx`**：fixed top banner，斷線／錯誤時跳紅色橫幅。
- **`components/ErrorBoundary.jsx`**：class component 包住整個 App，避免單一 render 錯誤白屏。
- **`components/PixelCharacter.jsx`**：戰鬥畫面用的 SVG pixel-art 角色，16 格寬、內建 `VARIANTS` map 為每隻角色決定耳型／體型／花紋／眼色／槍口方向。4 個動畫 keyframe（`pixelBob` 待機、`pixelShoot` 射擊反衝、`hurtFlash` 受擊閃光、`muzzleFlash` 槍口閃光）寫在 `packages/client/index.html` 的 `<style>` 裡——移動 keyframe 時要一起帶走，不然動畫會啞。
- **`components/AsciiCharacter.jsx`**：舊的 ASCII 渲染元件，目前只剩 `CharacterBrowser` 在用。戰鬥畫面不再用它。
- **`components/ExcelChrome.jsx` 家族**：無狀態的 Excel chrome（menu bar、toolbar、sheet tabs、status bar）+ `Cell / CellGrid / RadarChart`。`theme.js` 匯出 `excelColors` 調色盤，任何 UI 改動都要用這組顏色才維持得住偽裝。

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
| C→S | `ADD_BOT` | `{}` — 僅 host；滿/非 host/進行中時回 ERROR |
| C→S | `REMOVE_BOT` | `{ botId }` — 僅 host；目標必須是 bot 否則 ERROR |
| S→C | `LOBBY_STATE` | `{ players }` |
| S→C | `MATCH_START` | `{ state }` — 完整 initial GameState |
| S→C | `SNAPSHOT` | `{ tick, players, projectiles, events }` — 30 Hz |
| S→C | `MATCH_END` | `{ winnerId, summary }` |
| S→C | `ERROR` | `{ code, msg }` |

**輸入的混合設計**：
- `dir` 是 held-key 狀態（`'up'/'down'/'left'/'right'/null`），每 tick 重送；方向鍵同時驅動「移動」（受 `MOVE_COOLDOWN_MS` 節流）與「面向」（無節流，每 tick 立刻更新）。
- `attack` 是 held-key bool——按住 J 就會每 tick 送 `true`，server 靠 `ATTACK_COOLDOWN_MS=250` 節流成 4 shots/sec。
- `skill` 是 one-shot bool——`useInputCapture` 讀取後會從 Set 刪掉 `k`，避免 cooldown 結束瞬間再次觸發；server 端另外檢查 `skillCdUntil`。
- 所有 INPUT 帶 monotonic `seq`，留給未來做 input replay / 去重的空間。

**Server 強制 `MOVE_COOLDOWN_MS=150`**：就算 client 以 100 Hz 連按，player 還是 6.67 格/秒。這條規則確保調高 `TICK_RATE` 不會讓角色瞬移。

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
- `max_machines_running = 1`：**刻意不水平擴展**，因為 GameState 是 in-memory 的單例，多台 machine 之間沒有共用 state。要擴展得先把 lobby/match 改成跨 machine 共享（Redis pub/sub 或類似機制）。
- `internal_port = 3000`：與 Express 同 port，socket.io 走同一條 HTTPS upgrade。

部署指令：`fly deploy`（assume 已經 `fly auth login`）。Dockerfile 與本機 prod image 共用，不需要額外 build artifact。

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
- **Socket connect race**：`io({ autoConnect: true })` 回傳的 socket 是同步的，但 `socket.id` 要等 `'connect'` event 才有值。想在 mount 時 emit 必須先 `if (socket.connected) ... else socket.once('connect', ...)`。即便如此，重複 JOIN 已經是 idempotent 的（見 `Lobby.join`），所以 race 的後果最多是 UI 沒更新而不是重複佔 slot。
- **`match.js` 的 event slice**：見上面「Match tick 的 event 處理」段落。
- **`useInputCapture` 的按鍵處理**：`skill`（K）必須在讀取後從 `keysDown` Set 刪掉，`attack`（J）**不要刪**——因為 attack 靠 server 端 `ATTACK_COOLDOWN_MS` 節流，使用者體感就是「按住連發」。兩者若搞反，J 會變一次性（玩家按住不放只打一下），K 會變連發（cooldown 一結束立刻再觸發）。
- **Projectile 的 `x/y` 是浮點**：子彈的 `x/y` 不是整數格子，命中判定用 `Math.round(x/y)` 對齊到格子。要做視覺效果時記得 SVG 用浮點座標（`cx={proj.x + 0.5}`）而不是格子 offset。
- **`facing` 改成 4-way**：任何 `facing === 'left' ? -1 : 1` 這種 2-way 判斷都是舊碼，會讓 `'up'` / `'down'` 落到預設分支。`PixelCharacter.FACING_TRANSFORM` 有完整的 4 向 mapping 可以抄。
- **動畫 keyframe 寫在 `index.html`**：`pixelBob` / `pixelShoot` / `hurtFlash` / `muzzleFlash` / `floatUp` 都在 `packages/client/index.html` 的 inline `<style>`。React 元件只用 `animation: 'pixelBob 1.6s ...'` 字串引用——搬動畫時兩邊要一起改。
- **Socket event 字串**：寫死 `'snapshot'` 之類的字串可以跑、但 refactor 時會漏改——一律用 `MSG.SNAPSHOT`。
- **Windows 路徑**：主要開發環境是 Windows，但 shell 是 bash/Git-Bash。寫 path 用正斜線（`/dev/null` 不要寫 `NUL`；forward slashes）。跑 `docker run -v` bind mount 時路徑會被 Git-Bash 當 POSIX 亂 mangle，需要 `MSYS_NO_PATHCONV=1` prefix。
- **區網防火牆**：LAN 主機要手動在 Windows Defender 放行 :3000 inbound，不然同事連不進來。
- **Bot AI 與 simulation schema 耦合**：`packages/server/src/bot.js` 直接讀 `state.players[id].{x,y,alive}` 結構；simulation.js 改 schema 時 bot 會連帶壞。24 個 bot 單元測試會第一個變紅——相信測試，別單獨修 bot.js 讓綠燈回來而不看 schema 是否真的改動。

---

## 已知 v1 限制（刻意的）

- **無 client-side prediction／interpolation**：區網體感良好，WAN 上會明顯感覺到 lag。要上網路對戰得先加 prediction 層。
- **斷線＝淘汰**：v1 不支援斷線重連，中場斷線直接判死。
- **同格不處理碰撞**：兩個玩家可以重疊在同一格，視覺上會看到 pixel sprite 疊在一起。子彈碰到任一個都會結算傷害。
- **老闆鍵被凍住時仍可被攻擊**：故意的平衡設計，不是 bug，避免 ESC 變無敵盾。
- **戰績報表未實作**：`MatchHistory.jsx` 只是佔位頁，server 也沒有任何 match history 持久化——要做要加 DB/檔案層。
