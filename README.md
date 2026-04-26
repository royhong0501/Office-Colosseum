# Office Colosseum

辦公室偽裝的區域網路多人對戰遊戲。外表看起來像 Excel 試算表，實際是 2-8 人大逃殺。

## 架構

npm workspaces monorepo，三個 package：

- `packages/shared` — 純 ES module：常數、20 隻貓狗角色、傷害計算、權威模擬 (server-authoritative 遊戲邏輯)
- `packages/server` — Node + Express + socket.io，擁有 GameState，30 Hz tick 廣播 snapshot
- `packages/client` — Vite + React 18 + socket.io-client，訂閱 snapshot 渲染，捕捉鍵盤輸入

## 使用 Docker

### 開發模式

```bash
docker compose up --build
```

打開 `http://localhost:5173`。改 `packages/` 下任何原始碼會觸發 server 熱重啟 / client HMR。

### 正式模式（LAN host 部署）

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

打開 `http://localhost:3000`。同事連 `http://<你的區網 IP>:3000`（Windows 仍需放行 :3000 inbound）。

或純 Docker：

```bash
docker build -t office-colosseum .
docker run --rm -p 3000:3000 office-colosseum
```

---

## 快速開始（不用 Docker）

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

## 部署到 fly.io

正式環境跑在 **fly.io**（東京 `nrt`），DB 走 **Supabase Free**、Redis 走 **Upstash Free**。所有敏感參數透過 `fly secrets set` 注入，不寫進 `fly.toml`。

### 一次性設定

**1. Supabase Postgres**

到 [supabase.com](https://supabase.com) 建 project（region 選 `ap-northeast-1` 與 fly app 同區）。

Project settings → Database → **Connection string → Session pooler**（**不要** Direct，Free plan 是 IPv6-only fly 連不到；也不要 Transaction Pooler 6543，prisma migrate 不支援）。URL 格式：

```
postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```

如果密碼含 `?` `*` `,` `@` 等特殊字元，要 URL encode（`?` → `%3F`、`*` → `%2A`、`,` → `%2C`、`@` → `%40`）；建議直接重設成 alphanumeric+`_` 省事。

**2. Upstash Redis**

到 [upstash.com](https://upstash.com) 建 Redis：Type 選 **Regional** + Tokyo region。Database 頁面抓 `rediss://` 那條（TLS）：

```
rediss://default:<password>@<endpoint>.upstash.io:6379
```

**3. fly app + secrets**

```bash
fly launch --no-deploy        # 第一次：吃 fly.toml、不要 fly 自動建 DB
fly secrets set \
  DATABASE_URL='postgresql://postgres.xxx:xxx@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  REDIS_URL='rediss://default:xxx@xxx.upstash.io:6379' \
  JWT_SECRET='至少 16 字的隨機字串' \
  ADMIN_INITIAL_USERNAME='admin' \
  ADMIN_INITIAL_PASSWORD='你要的初始密碼'
fly deploy
```

PowerShell 設 secret 用單引號避免 `$` `&` 被 shell 吃掉。

### 後續更新

```bash
fly deploy           # 重新 build + 推 image
fly logs             # 即時看 server log
fly status           # machine 健康狀態
fly ssh console      # 進 container 抓 env、跑 prisma 工具
fly secrets list     # 列目前 secrets（值不顯示）
fly secrets unset KEY   # 移除某個 secret
```

`fly secrets set` 只有在 app 已 deploy 過、有 running machine 時才會自動 redeploy；第一次設或 machine 全停要手動 `fly deploy`。

### Migrate / Seed

`Dockerfile` 的 `CMD` 已串好：每次 deploy 都會跑 `prisma migrate deploy && db:seed || true; node packages/server/src/index.js`，意即 migrate / seed 失敗也不會擋 server 起。

如果要手動對著 prod DB 跑 migrate（schema 變更）：

```bash
$env:DATABASE_URL = 'postgresql://...prod URL...'    # PowerShell
# bash: export DATABASE_URL='postgresql://...'
npx --workspace @office-colosseum/server prisma migrate deploy
```

⚠ Prisma 的 `dotenv` 是**非覆寫**：若 `.env` 也有 DATABASE_URL（指向本機 docker postgres），它會蓋掉你 `$env:` 設的 prod URL。先把 `.env` 改名或 unset 才安全。

### 常見坑

- **502 Bad Gateway / `libssl.so.1.1: not found`** — Prisma + Alpine OpenSSL 不對齊。`schema.prisma` 必須有 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`，且 `Dockerfile` 兩個 stage 都要 `RUN apk add --no-cache openssl`。
- **P1001 Can't reach database** — 用了 Supabase Direct Connection（IPv6-only），改用 Session Pooler。
- **P1000 Authentication failed for `postgres`** — 連 pooler 時 username 要寫 `postgres.<project-ref>`（含點），不是純 `postgres`。
- **P1013 invalid port** / **P1012 URL must start with postgresql://** — 密碼含特殊字元未 encode、或 fly secret 不小心被前綴成 `DATABASE_URL=DATABASE_URL=...`。SSH 進 container `echo $DATABASE_URL` 確認。
- **Redeploy log 有 migrate 錯誤但網站正常** — 正常。Dockerfile CMD 用 `; node ...` 串接，migrate 失敗會被 `|| true` 吞掉、node server 仍會起。

詳細排錯與規範見 `CLAUDE.md` 的「雲端部署」與「部署相關地雷」段落。

---

## 已知限制

- 沒有 client-side prediction — 低延遲區網下體感良好，WAN 上會有明顯 lag
- 斷線不能重連（中場斷 = 淘汰）
- 多人同時踩同一格沒做碰撞
- 老闆鍵期間角色被定在原地、仍可被攻擊（這是故意的，避免變成無敵盾）
