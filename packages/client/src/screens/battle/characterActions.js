// 角色動作設定：對照設計稿的三層狀態機（IDLE 無限 / KEY / BURST 單次）。
// 每個動作定義 { loop, dur, formula, fx[] }。fx 座標以 CharacterActor 的 base box
// （200×180、sprite 96 置底置中、頭部中心約 x100 y114）為基準；size='sm' 由容器整體縮放。
//
// 只含「隨角色走」的 FX（pop/bubble/spark/sweat/smoke/boom/dizzy/gloom/sniff/paw/flag/shadow）；
// 棋盤耦合效果（真棋子彈入、卡牌翻面、瀑布）由各遊戲 Arena 另行處理。

const sparks5 = [[70, 40], [112, 32], [50, 52], [122, 96], [44, 88]];
const sparks3 = [[66, 44], [112, 50], [90, 36]];

function spark(list) {
  return list.map(([x, y], i) => ({ t: 'spark', cls: i % 2 ? 'gold' : '', x, y, delay: 0.03 * i }));
}

export const ACTIONS = {
  // 中性待機
  idle: { loop: true, dur: 3.0, formula: '', fx: [] },

  // ---------------- 五子棋 ----------------
  think: {
    loop: true, dur: 3.2, formula: '=IF(BESTMOVE) // 計算最佳落點',
    fx: [{ t: 'bubble', text: '？', x: 128, y: 52 }],
  },
  stamp: {
    loop: false, dur: 0.75, formula: '=PLACE(cell,"●") // 蓋章式重壓',
    fx: [{ t: 'pop', text: '叩!', x: 118, y: 46 }],
  },
  wait: {
    loop: true, dur: 3.4, formula: '=WAIT() // 對手回合',
    fx: [],   // 只呼吸張望，不冒泡泡（空泡泡會變成浮空破框）
  },
  // 勝利：結束後持續歡呼（loop）
  win: {
    loop: true, dur: 1.6, formula: '=WIN(COUNT=5) // 五連達成',
    fx: [...spark(sparks5), { t: 'pop', text: 'WIN!', x: 74, y: 26 }, { t: 'shadow' }],
  },
  // 落敗：結束後持續垂頭喪氣（loop；沿用 stuck 的 droop/gloom 視覺，見 CSS .act-lose）
  lose: {
    loop: true, dur: 2.4, formula: '',
    fx: [{ t: 'gloom', x: 84, y: 54 }, { t: 'pop', cls: 'blue', text: '…', x: 98, y: 52 }],
  },
  tense: {
    loop: false, dur: 1.8, formula: '=ALERT("敵方4連") // 危機',
    fx: [{ t: 'sweat', x: 132, y: 104 }, { t: 'pop', text: '!', x: 108, y: 44 }],
  },

  // ---------------- 踩地雷 ----------------
  reveal: {
    loop: false, dur: 0.6, formula: '=REVEAL(cell) // 安全',
    fx: [{ t: 'paw', x: 150, y: 120 }, { t: 'pop', cls: 'green', text: '♪', x: 118, y: 40 }],
  },
  flag: {
    loop: false, dur: 0.95, formula: '=FLAG(cell) // 標記地雷',
    fx: [{ t: 'flag', x: 152, y: 78 }],
  },
  sniff: {
    loop: true, dur: 3.0, formula: '=INSPECT(cell) // 判讀提示',
    fx: [{ t: 'sniff', x: 150, y: 122 }, { t: 'bubble', text: '？', x: 132, y: 52 }],
  },
  mine: {
    loop: false, dur: 2.4, formula: '=REVEAL(cell)→#BOOM! // 誤觸',
    fx: [{ t: 'boom', x: 72, y: 70 }, { t: 'smoke', x: 96, y: 58 },
    { t: 'dizzy', x: 70, y: 52 }],
  },
  sweep: {
    loop: false, dur: 2.2, formula: '=CLEAR(ALL) // 通關',
    fx: [...spark(sparks3), { t: 'pop', cls: 'green', text: 'CLEAR!', x: 64, y: 24 }, { t: 'shadow' }],
  },

  // ---------------- 接龍 ----------------
  // 發牌 / 翻牌：不要貓爪，改成像落子那樣跳一下（見 CSS .act-draw .sprite 覆寫成 found-hop）
  draw: {
    loop: false, dur: 0.6, formula: '=DRAW() // 翻一張',
    fx: [],
  },
  move: {
    loop: false, dur: 0.6, formula: '=MOVE(a→b) // 疊放', fx: [],
  },
  found: {
    loop: false, dur: 0.95, formula: '=STACK(suit) // 進基礎堆',
    fx: [{ t: 'pop', cls: 'green', text: '♪', x: 108, y: 40 }, { t: 'shadow' }],
  },
  stuck: {
    loop: false, dur: 2.0, formula: '=CHECK()→NO_MOVE // 無解',
    fx: [{ t: 'gloom', x: 84, y: 54 }, { t: 'pop', cls: 'blue', text: '…', x: 98, y: 52 }],
  },
  cascade: {
    loop: false, dur: 2.6, formula: '=SOLVED() // 全部完成',
    fx: [...spark(sparks3), { t: 'pop', text: '通關!', x: 60, y: 22 }, { t: 'shadow' }],
  },
};

export function actionFormula(name) {
  return ACTIONS[name]?.formula ?? '';
}
