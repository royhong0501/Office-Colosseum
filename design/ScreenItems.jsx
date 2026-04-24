/* ============================================================
   畫面 03：道具戰 — 對戰畫面
   ============================================================ */

const SKILLS = [
  {
    id: "freeze",
    name: "凍結窗格",
    emoji: "❄",
    fn: "=FREEZE(cell)",
    cost: "MP 20 · CD 8s",
    short: "經過後施放，格子顯示灰底；下一個踩到的敵人原地定身 2 秒。",
    demo: "freeze",
  },
  {
    id: "undo",
    name: "Ctrl + Z · 撤銷",
    emoji: "↶",
    fn: "=UNDO()",
    cost: "MP 35 · CD 12s",
    short: "立即恢復自身 2 秒前的生命值，並解除移動減緩、定身等負面狀態。",
    demo: "undo",
  },
  {
    id: "merge",
    name: "合併儲存格",
    emoji: "⊞",
    fn: "=MERGE(range)",
    cost: "MP 15 · CD 6s",
    short: "施放後格子合併，下位踏入的玩家移動速度減緩 50%。",
    demo: "merge",
  },
  {
    id: "readonly",
    name: "唯讀模式炸彈",
    emoji: "🔒",
    fn: "=READONLY()",
    cost: "MP 25 · CD 10s",
    short: "經過後格子上鎖；下一位玩家踩到後 5 秒內無法施放任何技能，只能移動。",
    demo: "readonly",
  },
  {
    id: "validate",
    name: "資料驗證",
    emoji: "▼",
    fn: "=VALIDATE()",
    cost: "MP 30 · CD 14s",
    short: "下拉選單箭頭放置在地板；下一位踏入玩家會被傳送到地圖隨機座標。",
    demo: "validate",
  },
];

// 小示範格（5 × 3）展示不同技能的儲存格樣式
function SkillDemoGrid({ skillId }) {
  const cells = [];
  for (let r=0; r<3; r++) {
    for (let c=0; c<5; c++) {
      let cls = "it-cell";
      let content = null;
      // 角色：藍方在 (0,1)，紅方在 (4,1) — 中央格子由技能決定
      if (r === 1 && c === 0) content = <span style={{fontSize:16}}>🐶</span>;
      if (r === 1 && c === 4) content = <span style={{fontSize:16}}>🐱</span>;
      // 中央 3 格 (1,1)(2,1)(3,1) 顯示技能效果
      const isSkillCell = r === 1 && c >= 1 && c <= 3;
      if (isSkillCell) {
        if (skillId === "freeze") cls += " freeze";
        else if (skillId === "merge") cls += " merged";
        else if (skillId === "readonly") cls += " readonly";
        else if (skillId === "validate") cls += " dropdown";
        else if (skillId === "undo" && c === 0 && r === 1) cls += " undo-glow";
      }
      if (skillId === "undo" && r === 1 && c === 0) cls += " undo-glow";
      cells.push(
        <div key={r+"-"+c} className={cls}>{content || <span>{String.fromCharCode(65+c)}{r+1}</span>}</div>
      );
    }
  }
  return <div className="sd-grid">{cells}</div>;
}

function ScreenItems() {
  const [tutorialOpen, setTutorialOpen] = React.useState(true);
  const COLS = 18, ROWS = 9;

  // 場上已施放的技能 (c, r, type)
  const casts = {
    "5,3": "freeze", "5,4": "freeze",
    "8,4": "merged", "9,4": "merged",
    "12,5": "readonly",
    "14,6": "dropdown",
    "3,6": "undo-glow",
  };

  const players = [
    { c:3, r:6, char:"🐶", hp:72, mp:58, me:true },
    { c:14,r:3, char:"🐱", hp:45, mp:80 },
  ];

  const cells = [];
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const key = c + "," + r;
      const cast = casts[key];
      const player = players.find(p => p.c === c && p.r === r);
      let cls = "br-cell it-cell";
      if (cast) cls += " " + cast;
      if (player) cls += " actor";
      cells.push(
        <div key={key} className={cls}>
          {player && (
            <>
              <div className={"actor-hp " + (player.hp < 30 ? "crit" : player.hp < 60 ? "hurt" : "")}>
                <i style={{width: player.hp + "%"}} />
              </div>
              <div className="actor-mp"><i style={{width: player.mp + "%"}} /></div>
              <span style={{fontSize:18, lineHeight:1}}>{player.char}</span>
            </>
          )}
        </div>
      );
    }
  }

  return (
    <SheetWindow
      fileName="進階儲存格格式工具.xlsx"
      cellRef="D5"
      formula={<>
        <span className="fn">=CAST</span>(<span style={{color:"#8a3d2c"}}>"Ctrl+Z"</span>)
        <span style={{color:"var(--ink-muted)", marginLeft:12}}>// HP+22, 負面狀態已清除</span>
      </>}
      activeTab="道具戰 · 第 3 回合"
      tabs={["主選單", "道具戰", "技能清單", "規則"]}
      statusLeft="就緒 — 技能 3/5 就緒 · MP 58/100"
      statusRight="平均 ping: 24 ms  |  回合倒數 02:14"
    >
      <div className="sw-paper" style={{padding: 0, position:"relative"}}>
        {/* 教學彈窗 */}
        {tutorialOpen && (
          <div className="tutorial-modal">
            <div className="tm-titlebar">
              <span>進階儲存格格式工具 · 快速入門</span>
              <span className="x" onClick={() => setTutorialOpen(false)}>✕</span>
            </div>
            <div className="tm-body">
              <div className="tm-kicker">歡迎首次使用 · 以下 5 個技能可在工具列 ƒx 隨時查看</div>
              <h3>5 種儲存格技能</h3>
              <div className="tm-list">
                {SKILLS.map(s => (
                  <div key={s.id} className="tm-item">
                    <span className="emoji">{s.emoji}</span>
                    <div className="n">{s.name}</div>
                    <div className="fn">{s.fn}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11, color:"var(--ink-muted)", marginBottom:10, lineHeight:1.6}}>
                快捷鍵：<code>1 – 5</code> 施放對應技能 · <code>Tab</code> 切換目標 · <code>Esc</code> 關閉此視窗
              </div>
              <div className="tm-footer">
                <div className="btn-cell" onClick={() => setTutorialOpen(false)}>稍後查看</div>
                <div className="btn-cell primary" onClick={() => setTutorialOpen(false)}>開始對戰</div>
              </div>
            </div>
          </div>
        )}

        {/* 主格線地圖 */}
        <div className="br-grid" style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          height: 660,
        }}>
          {cells}
        </div>

        {/* 底部技能熱鍵條 */}
        <div style={{
          position:"absolute", bottom: 12, left: "50%", transform:"translateX(-50%)",
          display:"flex", gap: 6, padding: 6,
          background: "var(--bg-paper)", border: "1px solid var(--line)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
          zIndex: 5,
        }}>
          {SKILLS.map((s, i) => (
            <div key={s.id} style={{
              width: 52, height: 52,
              border: "1px solid var(--line)",
              background: "var(--bg-input)",
              display:"grid", placeItems:"center",
              position:"relative",
              opacity: i === 1 ? 0.4 : 1,
            }}>
              <span style={{fontSize:22}}>{s.emoji}</span>
              <span style={{
                position:"absolute", top:2, left:3,
                fontSize:9, fontFamily:"var(--font-mono)",
                color:"var(--ink-muted)",
              }}>{i+1}</span>
              {i === 1 && (
                <span style={{
                  position:"absolute", bottom:2, right:3,
                  fontSize:9, fontFamily:"var(--font-mono)",
                  color:"#cc2a1a",
                }}>6s</span>
              )}
            </div>
          ))}
        </div>

        {!tutorialOpen && (
          <div style={{
            position:"absolute", top:12, right:12,
            background:"var(--bg-paper)", border:"1px solid var(--line)",
            padding:"6px 10px", fontSize:11, fontFamily:"var(--font-mono)",
            color:"var(--ink-muted)", cursor:"pointer",
          }} onClick={() => setTutorialOpen(true)}>
            ƒx · 再次查看技能說明
          </div>
        )}
      </div>
    </SheetWindow>
  );
}

Object.assign(window, { ScreenItems, SKILLS, SkillDemoGrid });
