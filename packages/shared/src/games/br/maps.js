// 經典大逃殺 5 張地圖。資料來源：design/ScreenBattleRoyale.jsx:20-66
//
// 掩體用矩形列表表達：[col, row, width, height]。
// spawns 自動從四角 + 中點生成（maps.js 不自帶 spawns，比較容易維護）。

import { ARENA_COLS, ARENA_ROWS } from './constants.js';

export const MAPS = [
  {
    id: 'annual-budget',
    name: '年度預算報表',
    lore: '格子 + 紅字虧損區做毒圈。節慶感毒圈。',
    pitch:
      '老闆最愛的 Q4 數字一字排開 — 你踩到的每一格都可能是虧損。合併儲存格當掩體、紅字虧損區當毒圈。適合新手練槍。',
    tags: ['#新手友善', '#散點掩體', '#中型'],
    meta: { 建議人數: '4 – 8', 掩體密度: '中', 毒圈節奏: '標準（每 20s）' },
    covers: [[4, 3, 2, 2], [8, 4, 3, 1], [11, 6, 2, 2], [3, 7, 2, 1], [14, 5, 1, 3], [17, 3, 1, 2]],
  },
  {
    id: 'gantt',
    name: '甘特圖工程進度',
    lore: '長條狀掩體。東西向進攻走廊狹長。',
    pitch: 'PM 的惡夢 — 延宕的任務變成一條條長掩體，東西向走廊極窄。遠距離對槍與走位戰。',
    tags: ['#走廊戰', '#長掩體', '#狙擊友善'],
    meta: { 建議人數: '4 – 6', 掩體密度: '高（橫向）', 毒圈節奏: '快（每 15s）' },
    covers: [[2, 2, 5, 1], [9, 3, 6, 1], [5, 5, 4, 1], [13, 5, 4, 1], [3, 7, 7, 1], [12, 7, 5, 1]],
  },
  {
    id: 'pivot',
    name: '樞紐分析表',
    lore: '巨大合併儲存格當掩體，視野被切斷。',
    pitch: '大面積合併儲存格切碎視野，處處是死角。衝刺與繞背玩家的天堂。',
    tags: ['#死角', '#衝刺友善', '#大型'],
    meta: { 建議人數: '6 – 8', 掩體密度: '巨型區塊', 毒圈節奏: '慢（每 25s）' },
    covers: [[2, 2, 4, 3], [10, 2, 5, 2], [6, 6, 3, 2], [14, 5, 4, 3]],
  },
  {
    id: 'candlestick',
    name: '股價 K 線',
    lore: '柱狀物當牆，地圖中央縱向 K 線切割。',
    pitch: '縱向 K 線柱把地圖切成紅綠兩陣，多數對槍發生在柱間。節奏快。',
    tags: ['#縱向切割', '#快節奏', '#小型'],
    meta: { 建議人數: '4 – 6', 掩體密度: '中（縱向）', 毒圈節奏: '極快（每 12s）' },
    covers: [[4, 2, 1, 5], [7, 1, 1, 6], [10, 3, 1, 4], [13, 1, 1, 5], [16, 4, 1, 4]],
  },
  {
    id: 'heatmap',
    name: '銷售熱區',
    lore: '條件式格式化色塊 + 散落掩體。',
    pitch: '小掩體群密集分布，近距離肉搏為主。適合舉盾衝臉流派。',
    tags: ['#近戰', '#肉搏', '#8人推薦'],
    meta: { 建議人數: '6 – 8', 掩體密度: '密集小型', 毒圈節奏: '標準' },
    covers: [[3, 2, 2, 2], [7, 3, 2, 2], [12, 2, 2, 2], [15, 5, 2, 2], [5, 6, 2, 2], [10, 6, 2, 2]],
  },
];

/**
 * 展開 covers 矩形 → Set<"c,r"> 供 simulation 做 O(1) 查詢。
 */
export function expandCovers(covers) {
  const s = new Set();
  for (const [c, r, w, h] of covers) {
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) {
        s.add(`${c + dc},${r + dr}`);
      }
    }
  }
  return s;
}

/**
 * 自動生成 spawns：優先挑離 cover 最遠、且互不重疊的 8 個位置。
 * 簡化版：四角 + 四邊中點 + 中心，跳過 cover 上的點。
 */
export function autoSpawns(map) {
  const coversSet = expandCovers(map.covers);
  const candidates = [
    [0, 0],
    [ARENA_COLS - 1, 0],
    [0, ARENA_ROWS - 1],
    [ARENA_COLS - 1, ARENA_ROWS - 1],
    [Math.floor(ARENA_COLS / 2), 0],
    [Math.floor(ARENA_COLS / 2), ARENA_ROWS - 1],
    [0, Math.floor(ARENA_ROWS / 2)],
    [ARENA_COLS - 1, Math.floor(ARENA_ROWS / 2)],
  ];
  return candidates.filter(([c, r]) => !coversSet.has(`${c},${r}`));
}

export function pickMap(idx) {
  if (idx == null) return MAPS[Math.floor(Math.random() * MAPS.length)];
  if (typeof idx === 'string') return MAPS.find((m) => m.id === idx) ?? MAPS[0];
  return MAPS[idx % MAPS.length];
}

export function getMapById(id) {
  return MAPS.find((m) => m.id === id);
}
