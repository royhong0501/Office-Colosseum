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

### 前置（DB + Redis）

從這版開始 server 需要 **Postgres**（帳號 / 戰績）與 **Redis**（rate limit / JWT blocklist / presence / leaderboard cache）。最簡單的方式是用 docker compose 一條起：

```bash
cp .env.example .env       # 編輯 JWT_SECRET / ADMIN_INITIAL_PASSWORD 後再執行下列
docker compose up -d postgres redis
npm run db:migrate --workspace @office-colosseum/server   # prisma migrate dev
npm run db:seed    --workspace @office-colosseum/server   # 建第一個 ADMIN
```

`prisma migrate dev` 在 schema 改變時都要重跑（會自動產生 migration）。`db:seed` 只在 `User` 表為空時建 admin，之後跑是 no-op。

### 本機開發（兩個終端機）

```bash
npm install

# Terminal 1 — server 用 node --watch 熱重載，監聽 :3000
# 需要先 export 或在 .env 把 DATABASE_URL/REDIS_URL/JWT_SECRET/ADMIN_INITIAL_* 設好
npm run dev:server

# Terminal 2 — Vite dev server 在 :5173，會把 /socket.io 代理到 :3000
npm run dev:client
```

開啟 `http://localhost:5173`，第一次進站會看到 Login 頁；用 ADMIN 帳密登入後可在主選單進「使用者管理」建一般玩家帳號。

### Docker / 正式出 build

```bash
npm run build      # vite build → packages/client/dist/
npm start          # Express 從 dist/ 出靜態檔 + socket.io，監聽 :3000
docker compose -f docker-compose.prod.yml up -d  # 含 postgres + redis + app 一起起
```

`docker-compose.prod.yml` 的 `app` service 啟動時會自動跑 `prisma migrate deploy` + `db:seed`。

### 雲端部署（fly.io + Supabase Postgres + Upstash Redis）

實際 prod 環境是 **fly.io**（東京 `nrt`，single machine、no-traffic 自動 suspend）。DB 走 **Supabase Free tier**、Redis 走 **Upstash Free tier**。所有敏感參數透過 `fly secrets set` 注入，**不寫進 fly.toml**。

#### 一次性設定

**1. Supabase Postgres**

- 在 supabase.com 建 project（region 選 `ap-northeast-1` Tokyo 與 fly app 同區）
- Project settings → Database → **Connection string → Session pooler**（不是 Direct、也不是 Transaction Pooler）
- 套出來的 URL 格式：
  ```
  postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require
  ```
- **重要**：Free plan 的 Direct Connection（`db.<ref>.supabase.co:5432`）是 IPv6-only，fly machine 連不到。一定走 Session Pooler（port 5432，不是 Transaction Pooler 的 6543——後者不支援 prepared statement，會讓 prisma migrate 爛掉）。
- 密碼若含 `?` `*` `,` `@` 等特殊字元，需 URL encode（`?` → `%3F`、`*` → `%2A`、`,` → `%2C`、`@` → `%40`）；建議直接重設成 alphanumeric+`_` 省事。

**2. Upstash Redis**

- 在 upstash.com 建 Redis database：Type 選 **Regional**（不是 Global，少一層 latency）、Region 也選 Tokyo
- Database 頁面 → **Connect to your database** → 抓 `rediss://` 開頭的那條（TLS）
  ```
  rediss://default:<password>@<endpoint>.upstash.io:6379
  ```
- ioredis 看到 `rediss://` 自動走 TLS，不需要額外 config

**3. fly.io app**

```bash
fly launch --no-deploy        # 第一次：吃 fly.toml、不要 fly 自動建 DB
fly secrets set \
  DATABASE_URL='postgresql://postgres.xxxxx:xxxxx@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  REDIS_URL='rediss://default:xxxxx@xxxxx.upstash.io:6379' \
  JWT_SECRET='至少 16 字的隨機字串' \
  ADMIN_INITIAL_USERNAME='admin' \
  ADMIN_INITIAL_PASSWORD='你要的初始密碼'
fly deploy
```

PowerShell 設 secret 用單引號避免 `$` `&` 被 shell 吃掉；若 URL 內含 `=`，注意 fly 只認**第一個** `=` 為 KEY/VALUE 分隔（後面的 `=` 都是 value 內容）。

#### 後續更新

```bash
fly deploy           # 重新 build + 推 image
fly logs             # 即時看 server log
fly status           # machine 健康狀態 / 區域 / VM size
fly ssh console      # 進 container 抓 env、跑 prisma 工具
fly secrets list     # 列目前 secrets（值不顯示）
fly secrets unset KEY   # 移除某個 secret
```

`fly secrets set` 只有在 app 已 deploy 過、有 running machine 時才會自動 redeploy。若是第一次設或 machine 全停，要手動 `fly deploy`。

#### Migrate / Seed 流程

`Dockerfile` 的 `CMD` 已經串好：
```sh
prisma migrate deploy && db:seed || true; node packages/server/src/index.js
```

意即每次 deploy 都會嘗試 `migrate deploy`+`seed`，失敗（DB 暫時不可達、表已 seeded）也不擋 server 起，因為 `node ...` 在 `;` 後面**不論前面結果都會跑**。

如果遇到 schema 改但 fly machine 上 migrate 失敗：

```bash
# 本機跑 migrate deploy 對著 prod DB（一次性）
$env:DATABASE_URL='postgresql://...prod URL...'   # PowerShell；bash 用 export
npx --workspace @office-colosseum/server prisma migrate deploy
```

**Prisma `dotenv` 是非覆寫**：如果 `.env` 也有 DATABASE_URL（指向本機 docker postgres），`$env:` 會被它覆蓋。所以要嘛先 unset env file、要嘛改用 `npx prisma migrate deploy --schema=...` 並把 env 直接 inline 給該指令。

#### fly.toml 重點

- `min_machines_running = 1` + `auto_stop_machines = 'suspend'`：閒置 suspend、新請求 wake-up（cold start ~3–5s）。Free tier 友善
- `[[http_service.checks]] grace_period = '60s'`：給 prisma migrate 時間，前 60 秒 health check fail 不算紅
- `kill_timeout = '15s'` + `kill_signal = 'SIGTERM'`：socket.io 玩家斷線、match 結算寫 DB 要時間
- `memory = '512mb'`：256mb 起 Node + Prisma 容易 OOM

### 測試

```bash
npm test                                                   # 所有 workspace 跑一遍（不需 DB/Redis；lobby/sim 等純單元測試）
npm test --workspace @office-colosseum/shared              # shared 單元測試
npm test --workspace @office-colosseum/server              # server（含 brBot、lobby、rooms）
# smoke 需先把 docker compose up 起來、env 都設好；admin 帳號登入後建測試使用者再連 socket
npm run smoke --workspace @office-colosseum/server
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
screen: auth → menu → modeSelect → [mapSelect] → lobby → battle → gameover
                                  (BR only)
        menu → characters / history / admin（獨立頁；admin 只 ADMIN role 可見）
```

- 沒有 token / token 過期 / 帳號被停用 → App 強制回 `auth`。
- `NetworkedBattle.jsx` 是戰鬥層 dispatcher，依 `gameType` 路由到 `battle/<id>/BattleXxx.jsx`。
- 全部非戰鬥畫面（Login / Lobby / ModeSelect / MapSelect / MainMenu / GameOver / CharacterBrowser / MatchHistory / AdminPanel）都走同一個 `SheetWindow` 外殼。

### 帳號 / DB / Redis 流向

```
client ──HTTP /auth/login──► server ──bcrypt verify + JWT sign──► Redis trackJti
client ──HTTP /admin/users──► server (requireAdmin)             ──► Postgres (User table via Prisma)
client ──websocket(auth.token)──► server io.use(verifyAndLoad) ──► Postgres User check + Redis blocklist
                                                                ──► socket.data.user 注入後才放行
match end ──► matchService.recordMatch ──► Postgres (Match + MatchParticipant)
                                       ──► Redis cache:leaderboard:* DEL
GET_RECORDS ──► matchService.getSnapshot ──► Postgres
```

- 身分一律以 `socket.data.user` 為準；client 不再傳 `name/uuid`。
- 戰績完全在 Postgres；舊 `records.json` 啟動時自動 archive 為 `.archived-{ts}` 不再讀取。
- Redis 是「短壽狀態」：rate limit window、JWT blocklist、線上玩家 hash、leaderboard cache。停掉 Redis 不會掉資料，只是登入 brute-force 防禦失效、token 無法即時 revoke、線上人數失效。

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
| `constants.js` | `ARENA_COLS=28, ARENA_ROWS=14`, `MAX_HP=100`, `MOVE_SPEED=5.2`（cells/s, 舉盾時 `MOVE_SPEED_SHIELD=3.1`）、`SHOOT_CD_MS=280`, `BULLET_DMG=14`, `BULLET_SPEED=16`, `BULLET_MAX_DIST=14`、舉盾：`SHIELD_MAX_HP=100, SHIELD_ARC_DEG=90`（前 ±45°）、`SHIELD_BREAK_LOCK_MS=5000`（破盾鎖死 5s 後一次回滿）、`SHIELD_REDUCTION` deprecated（弧內 100% 擋、弧外 0%）；`DASH_CELLS=2, DASH_CD_MS=6000, DASH_INVULN_MS=200`, `POISON_DPS=5, POISON_SEVERE_MULT=2, POISON_START_MS=30000, POISON_WAVE_INTERVAL_MS=15000` |
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
      shielding,                    // held bool（input.shield + canShield 過濾後）
      shieldHp, shieldMaxHp,        // 弧形盾耐久（預設 100）
      shieldBrokenUntil,            // > now 表 5s 鎖死期；0 表沒鎖死
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
- `shield`：right-click held bool。server 端會檢查 `shieldHp > 0 && now >= shieldBrokenUntil` 才真的把 `player.shielding` 設為 true（破盾鎖死期間吃下去也不舉）。**舉盾與射擊互斥**：`p.shielding === true` 時 `input.attack` 不發子彈。
- 舉盾命中減傷只發生在「子彈來向相對 `p.facing` 的弧度差 ≤ `SHIELD_ARC_HALF_RAD`」時，弧內 100% 擋下並扣 `min(shieldHp, BULLET_DMG)` 盾耐久；扣到 0 觸發 `shield_break` + 5s 鎖死後一次回滿（`shield_recovered`）。「最後一擊」（盾血 < BULLET_DMG）仍能完整擋下，不穿透到 HP。
- `dash`：shift-press one-shot bool，server 檢查 `dashCdUntil` 決定是否生效；client 讀完要自行清掉 one-shot flag

### BR Event types（server → client SNAPSHOT payload）

- `damage` — `{ sourceId, targetId, amount, kind: 'bullet'|'poison', at: {x,y} }`
- `eliminated` — `{ playerId }`
- `projectile_spawn` — `{ id, ownerId, x, y, angle }`
- `projectile_hit` — `{ id, targetId|null, at }`（targetId=null 代表撞 cover）
- `projectile_expire` — `{ id }`
- `dash_move` — `{ playerId, from:{x,y}, to:{x,y} }`
- `shield_on` — `{ playerId, at }` / `shield_off` — `{ playerId }`（按鍵 on/off；不一定真的有盾，被破時 server 會強制 off）
- `shield_block` — `{ shooterId, defenderId, at:{x,y}, shieldHp }`（弧內擋下子彈，client 飄 BLOCK）
- `shield_break` — `{ playerId, at:{x,y} }`（盾耐久歸零，client 紅閃 SHIELD BROKEN!）
- `shield_recovered` — `{ playerId }`（5s 到，盾自動回滿）
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

Express + socket.io，`src/index.js` 掛靜態 `../client/dist`、auth/admin routes、socket server，共用 `:3000`。啟動時：

1. 偵測舊 `records.json` 存在就 archive 改名為 `records.json.archived-{ts}`（不再讀進來，新戰績全寫 Postgres）。
2. `getPrisma().$connect()` 暖機 DB 連線。
3. 掛 `/auth`、`/admin` Express routes（順序：parsers → auth → admin → static → SPA fallback）。SPA fallback regex 排除 `/auth`、`/admin`、`/health`、`/socket.io` 路徑。

### 核心模組

- **`db/prisma.js` / `db/redis.js`**：lazy singleton clients。`getPrisma()` / `getRedis()`。測試環境若無 DB / Redis，呼叫端應自行 mock 或 skip。
- **`auth/jwt.js`**：`signToken(user)` / `verifyToken(token)` / `buildJti()`。payload `{sub, jti, role, username, displayName, exp}`，預設 24h；`JWT_SECRET` 必須 ≥ 16 字。
- **`auth/middleware.js`**：`verifyAndLoad(token)`（共用底層）+ Express `requireAuth` / `requireAdmin`。token 從 `Authorization: Bearer` 或 `Cookie: oc_token=` 取。
- **`auth/routes.js`**：`POST /auth/login`（過 IP+username 兩條 rate limit）、`POST /auth/logout`（jti 寫 blocklist）、`GET /auth/me`、`PATCH /auth/me`（改 displayName）。
- **`admin/routes.js`**：`POST/GET /admin/users`、`PATCH /admin/users/:id`（停用→自動 revoke 該 user 所有 active jti）、`POST /admin/users/:id/reset-password`（同上）、`GET /admin/presence`。全程 `requireAdmin`。
- **`services/matchService.js`**：取代舊 `records.js`。`recordMatch(...)` 寫 `Match` + N 個 `MatchParticipant`（transaction），寫完 `invalidateLeaderboard()`；`getSnapshot()` 給 client `GET_RECORDS` 用，回最近 N 場 + top 200 聚合。
- **`services/blocklist.js`**：`trackJti(userId, jti, ttl)` 加進 `user:<id>:jtis` set；`blockJti(jti, ttl)` 寫 `blk:jti:<jti>`；`isBlocked(jti)` 查；`revokeAllForUser(userId)` 把該使用者的所有 jti 批量寫進 blocklist（停用 / 改密碼時用）。
- **`services/rateLimiter.js`**：`consume({ key, limit, windowSec })` sliding-window；超過 throw `RateLimitError(retryAfterSec)`。
- **`services/presenceService.js`**：`hsetOnline(userId, socketId)` / `hdelOnline(userId)` / `listOnline()`。
- **`services/leaderboardCache.js`**：`get(gameType, fetcher)` Redis 30s TTL；`invalidateLeaderboard()` DEL `cache:leaderboard:*`。
- **`services/chatService.js`**：聊天訊息 CRUD。`sendMessage / getPublicHistory / getDmHistory / markDmRead / getUnreadCounts`。寫入前驗 channel/長度/recipient + 走 `rateLimiter.consume('chat:<userId>')`。throws `ChatValidationError(code)` 或 `RateLimitError`。
- **`chatHandlers.js`**：socket 層聊天事件。`registerChatHandlers(io, socket)` 在 connection 內呼叫；socket 自動 `join('chat:public')` 與 `join('chat:user:<userId>')`，maintains 一個 process 內 `Map<userId, {displayName, sockets:Set}>` 用於 `CHAT_PRESENCE` 廣播。connection 完成後自動推一次 `CHAT_UNREAD`。
- **`lobby.js`**（`Lobby` 類別）：共用 lobby。Player 形狀 `{ id: socketId, userId, displayName, characterId, ready, isHost, isBot }`。`join(socketId, user)` 接 `{ id, displayName }`。切 gameType 把所有真人 ready 歸 false。
- **`match.js`**（`Match` 通用 dispatcher）：建構子 `new Match(io, players, gameType, config, onEnd)`。tick loop 呼叫 `sim.*` 與 `bot.decideBotInput`。`end()` async 呼叫 `matchService.recordMatch(...)`，失敗 swallow（`.catch(console.warn)`）。
- **`games/index.js`**：`GAMES` registry（gameType → `{ sim, bot }`），`loadGame(gameType)`。
- **`games/brBot.js` / `itemsBot.js` / `territoryBot.js`**：各遊戲的 `decideBotInput(state, botId, now)`。策略未變（BR：腳下毒圈→逃中心 / 視線內 ≤ BULLET_MAX_DIST→射 / HP<40→舉盾 dash；Items：低 HP→undo / 視線內→射 + 繞切線 / 距離 3–7→放 trap；Territory：朝最近未佔領+偏邊緣的格走）。
- **`socketHandlers.js`**：開頭 `io.use(authMiddleware)` 在 handshake 驗 JWT、查 blocklist、查 user.disabled，把 `socket.data.user` 寫進去；`MSG.JOIN` 不再吃 client 的 name/uuid，全部從 socket.data 取。connection 時 `hsetOnline`，disconnect 時 `hdelOnline`。
- **`prisma/schema.prisma`**：`User` (cuid + username unique + bcrypt passwordHash + role enum + disabled + createdById self-relation + lastLoginAt)、`Match`、`MatchParticipant`（userId 可為 null = bot）、`ChatMessage` (channel enum PUBLIC/DM + senderId + recipientId? + content varchar(500) + readAt?，PUBLIC 時 recipientId/readAt 永遠 null)。`prisma migrate dev --name <name>` 動 schema；`prisma migrate deploy` 給 prod；`db:seed` 在表空時建 `ADMIN_INITIAL_USERNAME/PASSWORD`。

### 未使用但保留（第二階段多房間預留）

`room.js` / `rooms.js` / `test/rooms.test.js` 未被 `socketHandlers.js` 引用，但保留測試與程式碼結構，之後做多房間時重新接回。

---

## `packages/client/` — Vite + React 18

**無 client-side prediction、無 interpolation**——收到 snapshot 直接 `setState` 觸發 re-render。

### Screen 流程（`App.jsx`）

```
auth → menu → modeSelect → [mapSelect (BR only)] → lobby → battle → gameover
       menu → characters (CharacterBrowser)
       menu → history (MatchHistory)
       menu → admin (AdminPanel，僅 ADMIN role)
```

`App.jsx` 啟動先 `refreshMe()` 校正 token；若 token 不存在或被 revoke 就回 `auth`。`window` 監聽 `oc:auth-cleared` 事件強制踢回 Login。

### 重要元件

- **`lib/auth.js`** — token / 使用者快取（`oc.token` / `oc.user` in localStorage）+ `login` / `logout` / `fetchAuthed` / `refreshMe` / `updateDisplayName` / `getCurrentUser` / `isAdmin`
- **`net/socket.js`** — `getSocket()` singleton（`autoConnect: false`，handshake 帶 `auth: { token }`）+ `reconnectSocket()` / `disconnectSocket()`。`connect_error: 'unauthorized:*'` 會清 token 並 dispatch `oc:auth-cleared`
- **`screens/Login.jsx`** — username + password 表單，POST `/auth/login`；錯誤碼處理（401 invalid_credentials / 423 rate_limited）
- **`screens/AdminPanel.jsx`** — 列表 / 新增 / 停用 / 重設密碼。停用會踢掉該帳號所有現有 token
- **`components/SheetWindow.jsx`** — 7 層試算表外殼（TitleBar / MenuBar / Toolbar / FormulaBar / 內容 / TabBar / StatusBar）。`formula` 可接 JSX、`tabs` 接 `[{id,label}]`
- **`components/CharacterSprite.jsx`** — `CharacterSpriteSvg`（戰鬥畫面用，世界座標 1×1 unit，含 pixelBob + hurt flash + facing 水平翻轉）和 `CharacterSpriteImg`（HTML 版）
- **`components/ChatPanel.jsx`** — 280px 寬右側聊天側欄；標題 `=CHAT()`、tabs（`大廳` + 動態 DM tabs，含未讀紅點）、線上玩家清單、訊息列表、Composer。收起後變 32px 窄條只剩 vertical `=CHAT()` + 紅點。`open` / `onToggle` props 由 App 控制；localStorage `oc.chat.open` 持久化。
- **`hooks/useChatStore.js`** — 聊天狀態 useReducer hook：訂閱 `CHAT_MSG/CHAT_HISTORY_RES/CHAT_UNREAD/CHAT_PRESENCE`，維護 `publicMessages` / `dmThreads` / `online`，曝出 `send/openDm/closeDm/markRead`。被 ChatPanel 使用。
- **`screens/MainMenu.jsx`** — 歡迎頁 + Player Card（勝率 / 場次）+ 最近檔案 + 三張 template 卡進不同子頁
- **`screens/ModeSelect.jsx`** — 畫面 01，三款遊戲模式選擇（BR 可玩、Items/Territory 顯示 SOON）。`onModeSelected(id)` 呼叫 App router
- **`screens/battle/br/MapSelect.jsx`** — 畫面 02，Excel「插入圖表」對話框風格；左側 5 張 map 縮圖 + 右側大預覽 + 確定 / 取消
- **`screens/Lobby.jsx`** — 入 lobby 先 JOIN 再 SET_GAME_TYPE（host only，非 host 會被 server 拒絕但無副作用）。頁首顯示 mode+map 名稱。玩家列每筆非 bot 非自己的 row 有「DM」按鈕，按下 dispatch `oc:open-dm` CustomEvent → ChatPanel 自動開對應分頁。
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
- **`screens/battle/br/ArenaBR.jsx`** — SVG viewBox `0 0 28 14`（依 `ARENA_COLS / ARENA_ROWS` 動態組），靜態層（grid + covers）+ 動態層（poison cells + players + bullets）。滑鼠 aim 透過 `arenaRef` + `xMidYMid meet` letterbox 對齊
- **`screens/battle/br/useInputBR.js`** — WASD + 方向鍵 + 左鍵 held + 右鍵 held（shield）+ Shift one-shot（dash）
- **`screens/battle/br/BattleHudBR.jsx`** — HP bar / dash CD / shield 耐久條（破盾期間顯示 BROKEN + 5s 倒數）/ 毒圈下一波倒數 / 全員名單 / 操作提示
- **`styles/game-ui.css`** — 模式卡 / 按鈕 / md-kv 等共用類別（由 main.jsx import）
- **`index.html` 的 inline `<style>`** — 主題 CSS 變數（warm/green/blue）+ 關鍵 keyframes（`pixelBob`、`floatUp`、`hurtFlash`、`shieldBreath`、`sheetStripesSlide`）

### `packages/client/src/assets/characters/`

20 張 PNG 貼圖。新增 / 換皮膚要同時更新 `shared/characters.js` 與 PNG 檔名。

---

## 協定（client ↔ server）

**所有 event 名稱常數定義在 `packages/shared/src/protocol.js` 的 `MSG` 物件**。

| 方向 | Event (`MSG.*`) | Payload | 備註 |
|---|---|---|---|
| C→S | `JOIN` | `{}` | 身分由 socket handshake 帶的 JWT 決定（`socket.data.user`）；client 不再傳 name/uuid |
| C→S | `PICK` | `{ characterId }` | |
| C→S | `READY` | `{ ready }` | |
| C→S | `SET_GAME_TYPE` | `{ gameType, config }` | host only；切換遊戲時重置所有 ready |
| C→S | `START` | `{}` | 只有 host 能成功觸發；Match 依 lobby.gameType 建立 |
| C→S | `INPUT` | 依 gameType 不同 | BR：`{seq, moveX, moveY, aimAngle, attack, shield, dash}` |
| C→S | `PAUSED` | `{ paused }` | 老闆鍵進 / 出 |
| C→S | `LEAVE` | `{}` | |
| C→S | `ADD_BOT` / `REMOVE_BOT` | `{}` / `{ botId }` | 僅 host |
| C→S | `GET_RECORDS` | `{}` | 拉全站戰績 snapshot |
| S→C | `LOBBY_STATE` | `{ players, gameType, config }` | players[i] 形狀 `{ id: socketId, userId, displayName, characterId, ready, isHost, isBot }` |
| S→C | `MATCH_START` | `{ gameType, config, state }` | BR 的 state 已把 Set 轉成 array（`poison.infected` 等） |
| S→C | `SNAPSHOT` | 依 gameType 不同 | BR：`{tick, phase, players, bullets, poison, events}` |
| S→C | `MATCH_END` | `{ winnerId, summary }` | summary 是每人的 `{dmgDealt, dmgTaken, survivedTicks}` |
| S→C | `RECORDS` | `{ meta, players, matches }` | players 是 array（`{id, username, displayName, matches, wins, dmgDealt, dmgTaken, survivedTicks}`），不再是 keyed by uuid 的 map；matches 由 matchService 即時從 DB 拉，沒有 10 場上限 |
| S→C | `ERROR` | `{ code, msg }` | |
| C→S | `CHAT_SEND` | `{ channel: 'public'\|'dm', recipientId?, content }` | 公開頻道全站共用；DM 寫入 + 投遞收件人個人 room |
| S→C | `CHAT_MSG` | `{ id, channel, senderId, senderName, recipientId, content, createdAt, readAt }` | 公開廣播或單點 DM；送方自己也會收到 echo |
| C→S | `CHAT_HISTORY_REQ` | `{ peerId?, before?, limit? }` | 不帶 peerId = 公開歷史；帶 peerId = 兩人雙向 DM 歷史 |
| S→C | `CHAT_HISTORY_RES` | `{ peerId, messages, hasMore }` | 訊息按 createdAt 由舊到新 |
| C→S | `CHAT_READ` | `{ peerId }` | 標記與 peerId 之間所有 DM `readAt = now` |
| S→C | `CHAT_PRESENCE` | `{ online: [{userId, displayName}, ...] }` | 加入 / 離開 chat:public room 時自動廣播 |
| S→C | `CHAT_UNREAD` | `{ byPeer: { [userId]: count } }` | connection 後自動推一次 |

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

- **Socket 改成 `autoConnect: false`**：因為 handshake 要帶 JWT，必須等 token 就緒才能 connect。Lobby/MainMenu mount 時若 `!socket.connected` 要先 `socket.connect()` 再 `socket.once('connect', ...)`。Login 完 `reconnectSocket()`、Logout 時 `disconnectSocket()`。
- **token 失效時 socket 會 connect_error 'unauthorized:*'**：`net/socket.js` 已捕捉這個 prefix 並 dispatch `oc:auth-cleared`；`App.jsx` 全域監聽該事件強制踢回 Login。寫新流程時不要硬吃這個錯。
- **`records.players` 不再是 keyed map**：matchService.getSnapshot 回的是 array。要找特定使用者用 `players.find(p => p.id === userId)` 而非 `players[uuid]`。同樣 `byCharacter` 聚合不存在了，要 client 從 `matches[].participants` 自己算（範例見 `MatchHistory.jsx` 的 `buildByCharacter`）。
- **參與者 (`participants[i]`) 欄位是 `userId / displayName`，不是 `uuid / name`**：matchService.getSnapshot 與 lobby Player 都改了。socketHandlers / match.js / 任何 client 渲染戰績的程式都要對齊。
- **BR 座標 corner-origin**：viewBox `0 0 28 14`，x ∈ [0, 28], y ∈ [0, 14]（commit c30b726 把場地從 20×9 擴大到 28×14）。跟舊版 center-origin 不同。
- **BR covers 是矩形列表 `[c,r,w,h]`**：`simulation` 內用 `expandCovers` 轉成 `Set<"c,r">`。畫 mini-map 的時候**直接用矩形**（別展開成 cells，會多很多 DOM）。
- **BR bullets 是 float 座標**：命中用 `(p.x-x)² + (p.y-y)² ≤ (PLAYER_RADIUS+PROJECTILE_RADIUS)²`。SVG 直接用 `cx/cy` 對應世界座標。
- **BR aim 計算要扣 letterbox**：SVG 是 `xMidYMid meet`，所以 client 把滑鼠座標換算世界座標時要用 `scale = min(rect.w/COLS, rect.h/ROWS)`，非獨立縮放。`useInputBR` 已處理。
- **BR snapshot 裡 poison 是 array，server state 裡是 Set**：`buildSnapshotPayload` 負責轉換。client 讀 `poison.infected` 當 array 用、`severe` 做 O(1) 查詢前要轉成 `new Set(poison.severe)`。
- **`facing` 是 radians**：任何 `facing === 'left' ? -1 : 1` 這種字串判斷都是舊碼。需要水平翻轉貼圖時用 `Math.cos(facing) < 0`。
- **BR 弧形盾方向判定**：子彈是否在弧內 = `|wrapPi(atan2(b.y - hit.y, b.x - hit.x) - hit.facing)| ≤ SHIELD_ARC_HALF_RAD`。`hit.facing` 與 LMB 射擊方向同（每 tick 由 `aimAngle` 覆寫）。要新增類似機制（例如「弧形 melee」）時直接 reuse 這個公式。
- **`SET_GAME_TYPE` host only**：非 host client 也可以 emit（我們的 Lobby.jsx 就會 emit），server 會回 `not_host` ERROR；client 忽略即可。這是**故意設計**成冪等的——永遠是 host 的版本會生效，LOBBY_STATE 會把正確 gameType 送給其他人。
- **`left 鍵拖出 arena 不放會卡住連打`**：`mouseup` 要掛 window 層（不是 arena），另外掛 `window blur` 一併放開。`useInputBR` 已處理。
- **BR events slice**：`match.js` 在 tick 開頭記錄 `eventsStartIdx = this.state.events.length`，tick 結尾用 `state.events.slice(eventsStartIdx)` 切出當 tick 事件再廣播。忘記 slice 的話事件永遠到不了 client。
- **Windows 路徑**：主要開發環境是 Windows，shell 是 bash/Git-Bash。寫 path 用正斜線（`/dev/null` 不要寫 `NUL`）。
- **smoke.js 需從 `packages/server/` 執行**（`npm run smoke --workspace @office-colosseum/server`），因為它 `spawn('src/index.js', ...)` 是相對路徑。

### 部署相關地雷

- **Supabase Free Direct Connection 是 IPv6-only**：fly machine 沒 IPv6 路由，連 `db.<ref>.supabase.co:5432` 一定 P1001 unreachable。**必須用 Session Pooler**：URL host 是 `aws-0-<region>.pooler.supabase.com`、port `5432`、username 是 `postgres.<project-ref>`（注意有點分隔，不是純 `postgres`）。Transaction Pooler（6543）也別用，prisma migrate 不支援。
- **Prisma + Alpine 必須兩處都改**：
  1. `schema.prisma` generator 加 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`（node:22-alpine 是 OpenSSL 3.x，預設只打 1.1 的 binary）
  2. `Dockerfile` builder + runtime 兩 stage 都要 `RUN apk add --no-cache openssl`（不裝的話 prisma engine 會 fallback 到舊 binary 然後 `libssl.so.1.1: not found`）
  漏任何一個，prod 啟動會 502 / `[db] prisma migrate deploy failed`。
- **fly secret URL 含特殊字元要 URL encode**：密碼裡的 `?` 會被當成 query string 分隔、`*` `,` `@` 會破壞 URL parser，產生 P1013 invalid port 之類詭異錯誤。最簡單：Supabase 後台直接重設成 alphanumeric+`_`。
- **fly secrets set 解析是「第一個 `=` 為分隔」**：`KEY=URL?with=querystring` 沒問題（都進 value）。但**不要重複前綴**：曾經發生 `DATABASE_URL=DATABASE_URL=postgresql://...` 雙前綴造成 P1012 URL must start with postgresql://。檢查方式：`fly ssh console -C 'sh -lc "echo $DATABASE_URL"'`。
- **PowerShell 設 fly secret 用單引號**：`fly secrets set "DATABASE_URL=$url"` 才會做變數展開；改用單引號或裸 `'DATABASE_URL=postgresql://...'` 防止 `$` `&` `*` 被 shell 吃。
- **Prisma `dotenv` 是非覆寫**：本機跑 `npx prisma migrate deploy` 想對著 prod DB 時，若 `.env` 有 DATABASE_URL，`$env:DATABASE_URL` 會被它**覆蓋而不是覆寫**——你會誤連到 localhost。臨時測試請改名 `.env` 或 unset。
- **Redeploy log 看到 P1000 / connect 失敗，但 runtime 已成功登入是正常的**：Dockerfile CMD 用 `;` 串 `migrate || true; node ...`——migrate 失敗（雙 deploy 期間舊 machine 還沒下、DB 暫時 throttle 等）並不會擋 node server 起。看到「`[db] prisma connected`」就代表已正常服務。
- **`fly secrets set` 不一定觸發 redeploy**：app 還沒 deploy 過、或 machine 全停時不會自動拉新版。後接 `fly deploy` 才保險。

---

## 已知 v1 限制（刻意的）

- **無 client-side prediction／interpolation**：區網體感良好，WAN 上會明顯感覺到 lag。
- **斷線＝淘汰**：v1 不支援斷線重連，中場斷線直接判死。
- **同格不處理碰撞**：兩個玩家可以重疊在同一位置。
- **老闆鍵被凍住時仍可被攻擊**：故意的平衡設計。
- **戰績全部存 Postgres**：沒有 10 場上限；查詢層 `matchService.getSnapshot()` 預設拿最近 20 場。
- **身分靠 admin 發放的帳號**：玩家進站需登入；token 24h 過期。Admin 停用帳號 / 改密碼後該使用者所有 active token 即時失效（透過 Redis blocklist）。Redis 掛掉時 blocklist 失效但不影響登入流程。
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
