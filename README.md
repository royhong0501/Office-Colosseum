# Office Colosseum

辦公室偽裝的區域網路多人對戰遊戲。外表看起來像 Excel 試算表，實際是 2-8 人大逃殺。

## 架構

npm workspaces monorepo，三個 package：

- `packages/shared` — 純 ES module：常數、20 隻貓狗角色、傷害計算、權威模擬 (server-authoritative 遊戲邏輯)
- `packages/server` — Node + Express + socket.io，擁有 GameState，30 Hz tick 廣播 snapshot
- `packages/client` — Vite + React 18 + socket.io-client，訂閱 snapshot 渲染，捕捉鍵盤輸入

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 建置 client

```bash
npm run build
```

這會產生 `packages/client/dist/`，server 會從那邊出靜態檔。

### 3. 啟動 server

```bash
npm start
```

Server 監聽 `0.0.0.0:3000`。自己電腦打開 `http://localhost:3000`。

### 4. 請同事加入

把你電腦在區網的 IP 找出來（Windows：`ipconfig`，Mac：`ifconfig`），請同事在瀏覽器打開：

```
http://<你的區網 IP>:3000
```

Windows 可能要在防火牆允許 port 3000 的 inbound traffic。

## 開發模式

兩個終端機：

```bash
# Terminal 1 — server with hot reload
npm run dev:server

# Terminal 2 — vite dev server
npm run dev:client
```

然後打開 `http://localhost:5173`。Vite 會把 `/socket.io/*` 代理到 `localhost:3000`，所以 client 以為自己連的是同一台。

## 操作

- **WASD / 方向鍵** — 移動（每 150 ms 一格）
- **J** — 普通攻擊（需要敵人在曼哈頓距離 ≤ 2 格內）
- **K** — 技能攻擊（傷害 × 1.5，5 秒冷卻）
- **ESC** — 老闆鍵（切到假季度報表，此時角色會在伺服器上進入 `paused` 狀態）

## 遊戲規則

- 2–8 人大逃殺（生存模式）
- 地圖 16×10 格
- HP = 0 立即淘汰，不復活
- 最後一人存活獲勝
- 斷線中場 = 淘汰

## 測試

```bash
# Shared package unit tests
npm test --workspace @office-colosseum/shared

# Server smoke test
npm run smoke --workspace @office-colosseum/server
```

## 專案檔案結構

```
packages/
  shared/
    src/
      constants.js       # ARENA_COLS, TICK_RATE, MAX_PLAYERS, ...
      characters.js      # 20 chars (10 cats + 10 dogs)
      math.js            # manhattan, calculateDamage, clamp
      spawns.js          # getSpawnPositions(n) for up to 8
      simulation.js      # createInitialState, applyInput, resolveTick
      protocol.js        # MSG constants
    test/                # node:test unit tests
  server/
    src/
      index.js           # Express + socket.io boot
      lobby.js           # Lobby class (pick/ready/host)
      match.js           # 30 Hz tick loop + snapshot broadcast
      socketHandlers.js  # MSG event wiring
    test/smoke.js        # 2-client lobby smoke test
  client/
    src/
      main.jsx           # Vite entry
      App.jsx            # Menu / Lobby / Battle / GameOver routing
      theme.js           # excelColors palette
      net/socket.js      # getSocket() singleton
      hooks/useBossKey.js
      components/        # Cell, CellGrid, RadarChart, AsciiCharacter, ExcelChrome
      screens/
        MainMenu.jsx
        Lobby.jsx
        NetworkedBattle.jsx
        GameOver.jsx
        BossKey.jsx          # fake quarterly report overlay
        battle/
          ArenaGrid.jsx      # 16×10 grid render
          BattleHUD.jsx      # HP bars + skill cooldowns
          BattleLog.jsx      # formula-bar battle log
          useInputCapture.js # keysDown → server input
```

## 協定 (Client ↔ Server)

| 方向 | Event | Payload |
|---|---|---|
| C→S | `join` | `{ name }` |
| C→S | `pick_character` | `{ characterId }` |
| C→S | `ready` | `{ ready }` |
| C→S | `start_match` | `{}` (host only) |
| C→S | `input` | `{ seq, dir, attack, skill }` (每 tick) |
| C→S | `paused` | `{ paused }` (老闆鍵) |
| C→S | `leave` | `{}` |
| S→C | `lobby_state` | `{ players }` |
| S→C | `match_start` | `{ state }` |
| S→C | `snapshot` | `{ tick, players, events }` |
| S→C | `match_end` | `{ winnerId, summary }` |

## 已知限制

- 沒有 client-side prediction — 低延遲區網下體感良好，WAN 上會有明顯 lag
- 斷線不能重連（中場斷 = 淘汰）
- 多人同時踩同一格沒做碰撞
- 老闆鍵期間角色被定在原地、仍可被攻擊（這是故意的，避免變成無敵盾）
