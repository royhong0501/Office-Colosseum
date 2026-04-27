# 戰鬥內快捷表情（Emote）設計文件

- **編號**：B3
- **狀態**：Spec — 待實作
- **建立日期**：2026-04-27
- **作者**：roy.hong + Claude

---

## 1. 目標與背景

在三款戰鬥（`battle-royale` / `items` / `territory`）中，提供玩家發送即時表情訊號的能力。

### 動機

- 既有的 chat dock 雖能在大廳 / 戰鬥中打字，但戰鬥節奏不允許玩家分心打字。
- 需要一個**單手左指、不中斷右手 aim**的社交頻寬。
- Emote 是多人對戰社群的核心黏著機制（TF2 / Overwatch / 玩家彼此互嗆都是樂趣來源）。

### 非目標

本版只做戰鬥中的表情訊號。下列功能**刻意不做**（見 §8 YAGNI）：自訂 emote、按角色變化、音效 / 動畫、bot 也會 emote、persisted history、戰績統計。

---

## 2. 內容風格 — 顏文字（Kaomoji）

選用顏文字作為表情媒介，理由：

1. **與專案核心賣點「試算表偽裝」一致**：顏文字是 1990s–2000s 辦公電腦時代的產物，純 ASCII / Unicode BMP 字符即可表達，跟 Excel 早期使用者文化在「年代感」上完美對齊。
2. **零 asset 成本**：純文字，瀏覽器預設字體即可 render。
3. **跨平台 render 一致**：emoji 在不同 OS / 字體會變形，顏文字幾乎不會。
4. **比 emoji 表現力更廣**：例如翻桌 `(╯°□°)╯︵ ┻━┻` 這種梗 emoji 表達不出來。
5. **截圖傳播力**：對戰結束後的截圖 + emote = 社群迷因素材。

### 6 個 Emote Slot（按 1–6 順序，從最日常正向 → 升級到嗆辣梗）

| Slot | 鍵 | 顏文字 | 情緒 / 用途 |
|------|----|--------|-------------|
| 1 | `1` | `(´∀｀)` | 笑 / 友善招呼 |
| 2 | `2` | `＼(^o^)／` | 拍手 / GG / 慶祝 |
| 3 | `3` | `(╥﹏╥)` | 哭 / 慘 / 求救 |
| 4 | `4` | `(°ロ°)` | 驚 / 沒想到 |
| 5 | `5` | `ಠ_ಠ` | 嘲諷 / 鄙視 / 「你看看你」 |
| 6 | `6` | `(╯°□°)╯︵ ┻━┻` | 翻桌 / 暴怒 / 核彈級 |

設計考量：

- 每個顏文字寬度都能塞進頭頂氣泡（最寬 `(╯°□°)╯︵ ┻━┻` 約 11 字寬，氣泡盒須做彈性寬度）。
- 全部使用 BMP（Basic Multilingual Plane）+ 常見 CJK 字符，瀏覽器預設字體都能 render，不需 web font。
- 涵蓋 6 大情緒（喜怒哀樂 + 嘲諷 + 翻桌），不重複。
- Slot 6 是專案招牌動作，翻桌的視覺衝擊跟試算表破壞感最強，預期是社群截圖王。

---

## 3. 觸發機制：Hold T + 數字 1–6

### 設計理由

| 替代方案 | 否決理由 |
|----------|---------|
| 數字鍵 1–9 直接觸發 | Items 遊戲 1–5 已綁技能，衝突嚴重；剩 6–9 只剩 4 slot 不夠 |
| 按 R 開圓形 wheel + 滑鼠選 | 中斷 aim、戰鬥節奏不友善 |
| 走聊天 `/flip` command | 戰鬥中沒時間打字 |

### 設計

- 玩家按住 `T`（KeyT）→ 畫面下方中央浮一條 6 格 bar 顯示 emote。
- 在按住期間按下 `1`–`6` 任一個 → 對應 slot emote 發出。
- 放開 `T` → bar 收起。
- `T` 鍵不衝突：BR / Items / Territory 三款都未使用 T。

### Hold T 期間的 EmoteBar UI

```
┌─────────────────────────────────────────────────────────┐
│ [1](´∀｀) [2]＼(^o^)／ [3](╥﹏╥) [4](°ロ°) [5]ಠ_ಠ [6]翻桌 │
└─────────────────────────────────────────────────────────┘
```

- 半透明白底 + 細黑線框（沿用試算表 chrome 風格）。
- 每格顯示 `[數字鍵]` + 顏文字 + 情緒 label（小字）。
- 處於 cooldown 中的 slot 整條 bar 灰階 + 顯示倒數秒數。

---

## 4. 顯示位置與持續時間

### Emote Bubble 顯示

- 玩家發出 emote → 自身角色頭頂出現顯示氣泡。
- 氣泡由 SVG 繪製（嵌入 Arena 的 viewBox 內），自然跟隨玩家移動。
- 氣泡內含：
  - 白底 + 黑邊矩形（無圓角，符合儲存格風）。
  - 顏文字文字（等寬字體）。
  - 朝下小三角 tail，指向角色。
- 動畫：`floatUp` keyframe（沿用 `index.html` inline style 既有 keyframe），2.5s 上飄 + fade out。
- `animation-fill-mode: forwards` 自動清掉。

### 持續時間 — 2.5s

- 比一般傷害飄字（~1s）長，讓人來得及看。
- 不會永久擋畫面。
- 若在 2.5s 內同玩家再發 emote（已被 3s cooldown 擋下），無此情境。

### 不顯示在 chat 頻道

故意設計 — 戰鬥中視覺已經很滿（毒圈、子彈、傷害飄字、護盾），再讓 emote 進聊天會 noise pollution。

---

## 5. 同步機制：INPUT 帶 emote 欄位 → SNAPSHOT events

完全 reuse 既有 INPUT/SNAPSHOT pipeline，**不開新 socket event**。

### Client → Server：INPUT 多帶一欄

每款遊戲的 INPUT schema 加：

```js
{ ...既有, emote: 1|2|3|4|5|6|null }
```

- one-shot：client 在 `consume()` 後清掉，避免下個 tick 重發。
- 三款 sim 各自的 `sanitizeInput` 加白名單。

### Server tick：shared helper

新建 `packages/shared/src/emotes.js`：

```js
export const EMOTE_CD_MS = 3000

export const EMOTES = [
  { slot: 1, key: '1', kaomoji: '(´∀｀)',         label: '笑' },
  { slot: 2, key: '2', kaomoji: '＼(^o^)／',      label: '拍手' },
  { slot: 3, key: '3', kaomoji: '(╥﹏╥)',         label: '哭' },
  { slot: 4, key: '4', kaomoji: '(°ロ°)',         label: '驚' },
  { slot: 5, key: '5', kaomoji: 'ಠ_ಠ',           label: '嘲諷' },
  { slot: 6, key: '6', kaomoji: '(╯°□°)╯︵ ┻━┻', label: '翻桌' },
]

export function applyEmoteInput(player, input, state, now) {
  if (input.emote == null) return
  if (!Number.isInteger(input.emote)) return
  if (input.emote < 1 || input.emote > EMOTES.length) return
  if (player.paused) return
  if (now < (player.emoteCdUntil || 0)) return
  player.emoteCdUntil = now + EMOTE_CD_MS
  state.events.push({
    kind: 'emote',
    playerId: player.id,
    slot: input.emote,
    atMs: now,
  })
}
```

由 `packages/shared/src/index.js` re-export `{ EMOTES, EMOTE_CD_MS, applyEmoteInput }`。

### 三款 sim 的 applyInput 末段呼叫共用 helper

```js
// packages/shared/src/games/{br,items,territory}/simulation.js
import { applyEmoteInput } from '../../emotes.js'

export function applyInput(state, playerId, input, now) {
  // ... 既有邏輯
  applyEmoteInput(player, input, state, now)
}
```

### 三款 createInitialState 替每位 player 加新欄位

```js
emoteCdUntil: 0
```

### Server → Client：SNAPSHOT events

`state.events` 內新增事件型別：

```js
{ kind: 'emote', playerId, slot, atMs }
```

由 `match.js` 既有的 events slice 機制（`eventsStartIdx → state.events.slice(eventsStartIdx)`）自然帶到 client，**觀戰者 / SpectatorBattle 也會自動收到**。

### 不動的部分

- ❌ 不動 `protocol.js` 的 `MSG` 物件（不新增 event 名稱）
- ❌ 不動 `chatService` / `chatHandlers`
- ❌ 不動 DB schema（emote 不持久化）
- ❌ 不動 socket auth / rate limit（既有 INPUT 90 滑窗已經涵蓋）

---

## 6. Client 實作

### 新檔 1：`packages/client/src/screens/battle/useEmoteInput.js`

三款共用的 input hook：

- 監聽全域 keyboard
  - `KeyT` keydown → `emoteOpen = true`（一次性，忽略 key-repeat）
  - `KeyT` keyup → `emoteOpen = false`
  - `window blur` → `emoteOpen = false`（避免 ALT-tab 卡住）
- 當 `emoteOpen === true`，攔截 `Digit1`–`Digit6` keydown：
  - 寫入 `pendingRef.current = slot`
  - **`preventDefault()` + `stopPropagation()`** — 關鍵，避免 Items 的 1–5 同時觸發技能
- input/textarea 有 focus 時整組 disabled（chat composer 不誤觸）
- 回傳 `{ emoteOpen, consume() }`，battle screen 每 tick 讀+清

### 新檔 2：`packages/client/src/components/EmoteBar.jsx`

純展示元件，props `{ open, cooldownUntil }`：

- `open === false` → render `null`
- `open === true` → render `position: fixed` 螢幕下方中央的 6 格 bar
- 每格：`[數字鍵]` + 顏文字 + 情緒 label（小字）
- `Date.now() < cooldownUntil` → 整條 bar 灰階 + 顯示倒數
- 樣式延續試算表偽裝：白底 + 細黑線框 + 等寬字體（同 SheetWindow chrome）

### 新檔 3：`packages/client/src/components/EmoteBubble.jsx`

SVG element，渲染在 Arena 的 player 上方，props `{ x, y, slot, startedAtMs }`：

- 用 `<g transform="translate(x, y - 0.7)">` 定位（世界座標單位）
- 內含 `<rect>` 背景（白底 + 黑邊 + 無圓角）+ `<text>` 顏文字 + 朝下小三角 tail
- CSS animation 用既有 `floatUp` keyframe，跑 2.5s
- `animation-fill-mode: forwards` 動畫到尾自動結束

### 新檔 4：`packages/client/src/screens/battle/useEmoteFeed.js`

`useEmoteFeed()` hook：

- 在 `useEffect` 內 `socket.on(MSG.SNAPSHOT, handler)`，每次 snapshot 進來：
  - `snapshot.events?.filter(e => e.kind === 'emote')` 拿到本 tick 新 emote
  - 寫入內部 `Map<playerId, { slot, startedAt, expiresAt: startedAt + 2500 }>`
  - 同 player 後發的覆蓋前發的
- 用 `requestAnimationFrame` loop 每幀過期清理（`now > expiresAt` 移除），觸發 React state 更新
- `unmount` 時 `socket.off(MSG.SNAPSHOT, handler)` + cancel rAF
- 回傳 `activeEmotes` 物件
- 三款 BattleXxx + SpectatorBattle 共用

### 三款 useInput hook 微調

- **Items**（唯一需動的）：`useInputItems({ emoteOpen })`，當 `emoteOpen === true` 時跳過 1–5 的技能映射
- **BR / Territory**：1–6 鍵未使用，**不需改邏輯**；為了 API 一致仍接 `{ emoteOpen }` prop

### 三款 BattleXxx.jsx 整合

```jsx
const { emoteOpen, consume: consumeEmote } = useEmoteInput()
const input = useInputXxx({ emoteOpen })
const activeEmotes = useEmoteFeed()
const [selfCooldownUntil, setSelfCooldownUntil] = useState(0)

// tick 送 INPUT
const emoteSlot = consumeEmote()
if (emoteSlot != null && Date.now() >= selfCooldownUntil) {
  setSelfCooldownUntil(Date.now() + EMOTE_CD_MS)
}
socket.emit(MSG.INPUT, { ...input, emote: emoteSlot })

// 渲染
<ArenaXxx ... activeEmotes={activeEmotes} />
<EmoteBar open={emoteOpen} cooldownUntil={selfCooldownUntil} />
```

**Cooldown 視覺回饋採 client 自記**（`selfCooldownUntil`）：

- 純 UX 用途，server 仍是判定權威
- 不需把 `emoteCdUntil` 進 snapshot（避免每 tick 多帶資料）
- client 時鐘漂移誤差 < 100ms，不影響使用者感知

### 三款 ArenaXxx.jsx 動態層

每個 Arena 在「畫 players」之後加一層：

```jsx
{Object.entries(activeEmotes).map(([pid, e]) => {
  const player = state.players[pid]
  if (!player) return null
  return (
    <EmoteBubble
      key={`${pid}-${e.startedAt}`}
      x={player.x}
      y={player.y}
      slot={e.slot}
      startedAtMs={e.startedAt}
    />
  )
})}
```

bubble 自然跟隨 player 移動（每 frame re-render）。

### 觀戰 / SpectatorBattle

零額外工作 — 既有 SpectatorBattle 也吃同一個 SNAPSHOT，把 `useEmoteFeed` + 渲染 `EmoteBubble` 的邏輯接上即可。

---

## 7. 邊界情況 + 測試

### 邊界 / 錯誤處理

| 情境 | 行為 |
|------|------|
| 玩家不按 T 直接按 1–6 | 1–6 不被 emote 攔截，正常走遊戲輸入（Items 觸發技能） |
| 按住 T 但放開沒選 | bar 顯示後消失，無 emote 發出 |
| ALT-tab / window blur 時 T 還按著 | `window.blur` 監聽器強制 `emoteOpen = false`，避免 stuck |
| 同 tick 收到同玩家 2 個 emote | shared helper cooldown 過濾，第二個 noop |
| 老闆鍵 paused | server 端 `applyEmoteInput` 拒收 |
| 玩家死了 / 凍結 / silenced | server 允許 emote（刻意設計） |
| 玩家中途斷線 | 對應 player 從 snapshot 移除 → bubble 自動消失 |
| 8 人同時 emote | 8 個 bubble 同時畫，無互相壓制 |
| 網路 drop INPUT | emote 一次性、丟了就丟了，3s 後可再發；不重傳 |
| chat composer focus 中按 T+1 | useEmoteInput hook 偵測 input/textarea focus → 整組 disabled |

### 單元測試

`packages/shared/test/emotes.test.js`（新檔）：

- ✓ 合法 slot 1–6 + 無 cooldown → push event + 設 cooldown
- ✓ cooldown 期間再按 → noop
- ✓ slot = 0 / 7 / -1 / 'foo' → noop
- ✓ slot = null → noop（一般沒按 emote 的 tick）
- ✓ player.paused === true → noop
- ✓ player.alive === false → 仍會發（刻意允許）

三款 sim 的 sanitizeInput 既有測試各加 case：

- ✓ raw.emote = 3 → 保留為 3
- ✓ raw.emote = 9 → null
- ✓ raw.emote = 'evil' → null
- ✓ raw.emote = 1.5 → null（非整數）
- ✓ raw.emote 不存在 → null

### Smoke test

擴充 `packages/server/smoke.js`：兩個 client 加同房 → match start → A 送 `INPUT { emote: 6 }` → 等下個 SNAPSHOT → assert events 內含 `{ kind: 'emote', playerId: A, slot: 6 }` → 觀察 client B 也收到同個 SNAPSHOT。

### Manual QA checklist

- [ ] BR / Items / Territory 三款都能正常 emote
- [ ] Items 按 T+3 不會誤發 readonly trap 技能（衝突隔離）
- [ ] Hold T 時下方 bar 出現、放開消失
- [ ] CD 中 bar 變灰
- [ ] 觀戰者看得到玩家 emote
- [ ] Bot 不會自己 emote
- [ ] 老闆鍵期間發 emote 失敗（client 端按了沒反應、server 拒）
- [ ] 翻桌（slot 6）的 11 字寬氣泡在三款 viewBox 都顯示正常

---

## 8. 範圍邊界（YAGNI — 刻意不做）

下列項目本版**不做**，避免 scope creep：

- ❌ 每個玩家自訂 emote pack — 只共用 6 個
- ❌ 每個角色獨立 emote — 角色是純皮膚
- ❌ 動畫 / 音效 emote — 純文字 + float-up
- ❌ Bot 也會 emote — 故意保留 emote 為「人性訊號」
- ❌ 持久化到 DB / chat history — 只活在當下 snapshot
- ❌ 戰績卡記錄 emote 統計 — 等未來 B2 戰績卡再說
- ❌ Mute 特定玩家的 emote — 朋友局不需要
- ❌ 連鎖反應 emote — over-engineering
- ❌ Lobby / GameOver 畫面也能 emote — 只在戰鬥中（簡化 input layer）
- ❌ Emote 排行榜 / 成就

---

## 9. 變更影響清單

### 新增檔案

- `packages/shared/src/emotes.js`
- `packages/shared/test/emotes.test.js`
- `packages/client/src/components/EmoteBar.jsx`
- `packages/client/src/components/EmoteBubble.jsx`
- `packages/client/src/screens/battle/useEmoteInput.js`
- `packages/client/src/screens/battle/useEmoteFeed.js`

### 修改檔案

- `packages/shared/src/index.js`（re-export emotes）
- `packages/shared/src/games/br/simulation.js`（applyInput / createInitialState / sanitizeInput）
- `packages/shared/src/games/items/simulation.js`（同上）
- `packages/shared/src/games/territory/simulation.js`（同上）
- `packages/client/src/screens/battle/br/BattleRoyale.jsx`
- `packages/client/src/screens/battle/br/ArenaBR.jsx`
- `packages/client/src/screens/battle/br/useInputBR.js`（接 emoteOpen prop，邏輯不變）
- `packages/client/src/screens/battle/items/ItemsBattle.jsx`
- `packages/client/src/screens/battle/items/ArenaItems.jsx`
- `packages/client/src/screens/battle/items/useInputItems.js`（emoteOpen 期間 skip 1–5 → skill 映射）
- `packages/client/src/screens/battle/territory/TerritoryBattle.jsx`
- `packages/client/src/screens/battle/territory/ArenaTerritory.jsx`
- `packages/client/src/screens/battle/territory/useInputTerritory.js`（接 emoteOpen prop，邏輯不變）
- `packages/client/src/screens/SpectatorBattle.jsx`
- 三款既有 sanitizeInput 測試檔加 emote case
- `packages/server/smoke.js`（加 emote 場景驗證）

### 不動的部分

- `packages/shared/src/protocol.js`（MSG 不增）
- `packages/server/src/socketHandlers.js`（INPUT 既有 pipeline 通用）
- `packages/server/src/match.js`（events 既有機制通用）
- `packages/server/src/services/chatService.js`（與 chat 完全隔離）
- `packages/server/prisma/schema.prisma`（不持久化）
- 任何 server bot 邏輯（bot 不 emote）

---

## 10. 預估規模

- **shared 層**：~1 hr（新檔 + 三款 sim 各加 3 處呼叫 + tests）
- **client 共用元件**：~2 hr（EmoteBar / EmoteBubble / useEmoteInput / useEmoteFeed）
- **三款 battle 整合**：~2 hr
- **觀戰整合**：~30 min
- **smoke + manual QA**：~1 hr

**合計 ≈ 6–7 hr**，符合「小、隔離、user-facing」的初始定位。
