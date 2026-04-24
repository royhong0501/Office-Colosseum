/* ============================================================
   畫面 01：遊戲模式選擇頁
   ============================================================ */

const MODES = [
  {
    id: "battle-royale",
    title: "經典大逃殺",
    subtitle: "file: 資料清理報告.xlsx",
    pitch: "地圖邊緣會隨機翻出 #REF! 報錯毒圈，待在錯誤區會抖動並扣血。用滑鼠左鍵射擊、右鍵舉盾、Shift 向鼠標方向瞬移兩步。最後一人存活。",
    tags: ["#射擊", "#大逃殺", "#8人"],
    meta: {
      "建議人數": "4 – 8",
      "操作": "WASD / 左鍵射擊 / 右鍵舉盾 / Shift 衝刺",
      "核心機制": "報錯毒圈 (#REF! / #VALUE! / #NULL!)",
      "地圖數": "5 款試算表場景",
      "公式": <><span style={{color:"var(--accent-link)"}}>=BATTLE.ROYALE</span>(MAP, 8)</>,
    },
  },
  {
    id: "items",
    title: "道具戰",
    subtitle: "file: 進階儲存格格式工具.xlsx",
    pitch: "HP + MP 雙資源，5 種「儲存格技能」：凍結窗格定身、Ctrl+Z 回血、合併儲存格減速、唯讀炸彈封技、資料驗證傳送。策略 > 反射神經。",
    tags: ["#策略", "#技能", "#4 – 6人"],
    meta: {
      "建議人數": "4 – 6",
      "操作": "WASD 移動 / 1–5 施放技能",
      "核心機制": "5 個儲存格格式技能 · CD + MP 消耗",
      "特殊": "工具列可隨時查看技能說明",
      "公式": <><span style={{color:"var(--accent-link)"}}>=ITEM.WAR</span>(SKILLS, HP, MP)</>,
    },
  },
  {
    id: "territory",
    title: "數據領地爭奪戰",
    subtitle: "file: 條件式格式化_塗色進度.xlsx",
    pitch: "移動過的格子會變成自己的隊色，用自己的顏色圍成封閉矩形時，內部所有儲存格瞬間被「格式刷」填滿。看起來像資料分類，實則是地盤戰。",
    tags: ["#佔領", "#團隊", "#新手友善"],
    meta: {
      "建議人數": "2 – 3 隊 × 2 人",
      "操作": "WASD 移動 = 塗色",
      "核心機制": "封閉矩形連鎖佔領",
      "勝利條件": "時限結束時佔地最多",
      "公式": <><span style={{color:"var(--accent-link)"}}>=TERRITORY</span>(COUNTIF(COLOR=TEAM))</>,
    },
  },
];

/* 縮圖：不同模式各自一個 mini 格線預覽 */
function ThumbBR() {
  const cells = {};
  // 毒圈邊緣
  for (let r=0; r<9; r++) {
    for (let c=0; c<14; c++) {
      if (r===0 || r===8 || c===0 || c===13 || (r===1 && c>10) || (c===1 && r>6)) {
        cells[c+","+r] = { bg:"rgba(204,42,26,0.14)", color:"#cc2a1a", glyph:"#", tri:true };
      }
    }
  }
  // 掩體
  [[4,3],[4,4],[5,3],[5,4],[8,5],[9,5]].forEach(([c,r])=>{
    cells[c+","+r] = { bg:"#a89473" };
  });
  // 角色
  cells["3,6"] = { bg:"#fce2c4", glyph:"🐶" };
  cells["10,3"] = { bg:"#d9e4ff", glyph:"🐱" };
  cells["7,7"] = { bg:"#d9e4ff", glyph:"🐱" };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}
function ThumbItems() {
  const cells = {};
  cells["3,2"] = { bg:"#d4d4d4", glyph:"❄" };
  cells["4,2"] = { bg:"#d4d4d4", glyph:"❄" };
  cells["6,4"] = { bg:"#e4d8b3" };
  cells["7,4"] = { bg:"#e4d8b3" };
  cells["9,5"] = { bg:"#efeadf", glyph:"🔒" };
  cells["11,6"] = { bg:"var(--bg-paper)", glyph:"▼" };
  cells["2,5"] = { bg:"#fce2c4", glyph:"🐶" };
  cells["10,3"] = { bg:"#d9e4ff", glyph:"🐱" };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}
function ThumbTerritory() {
  const cells = {};
  // 紅隊塗色
  [[1,1],[2,1],[3,1],[3,2],[3,3],[2,3],[1,3],[1,2]].forEach(([c,r])=>{
    cells[c+","+r] = { bg:"#d88b8b" };
  });
  // 紅隊圍起來的內部 — 格式刷填滿
  cells["2,2"] = { bg:"#e8a6a6" };
  // 藍隊
  [[8,5],[9,5],[10,5],[8,6],[10,6],[8,7],[9,7],[10,7]].forEach(([c,r])=>{
    cells[c+","+r] = { bg:"#8a9fc0" };
  });
  cells["9,6"] = { bg:"#a7b8d3" };
  // 綠隊
  [[5,7],[6,7],[7,7]].forEach(([c,r])=>{
    cells[c+","+r] = { bg:"#8db08a" };
  });
  // 角色
  cells["2,2"] = { bg:"#e8a6a6", glyph:"🐶" };
  cells["9,6"] = { bg:"#a7b8d3", glyph:"🐱" };
  cells["6,7"] = { bg:"#b0cdae", glyph:"🐾" };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}

const THUMBS = { "battle-royale": <ThumbBR/>, "items": <ThumbItems/>, "territory": <ThumbTerritory/> };

function ScreenModeSelect() {
  const [active, setActive] = React.useState("battle-royale");
  const mode = MODES.find(m => m.id === active);

  return (
    <SheetWindow
      fileName="選擇範本.xlsx — [唯讀]"
      cellRef="A1"
      formula={<><span className="fn">=CHOOSE.MODE</span>(<span style={{color:"#8a3d2c"}}>"{mode.title}"</span>)</>}
      activeTab="選擇模式"
      tabs={["主選單", "連線大廳", "選擇模式"]}
      statusLeft={"就緒  —  選擇一個範本開始 · 當前：" + mode.title}
      statusRight="點擊範本縮圖即時切換  |  線上: 42"
    >
      <div className="sw-paper" style={{padding: "22px 26px", display:"flex", flexDirection:"column", gap:16}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 4}}>
          <div>
            <div style={{fontSize:18, fontWeight:600}}>選擇範本 / 遊戲模式</div>
            <div style={{fontSize:11.5, color:"var(--ink-muted)", fontFamily:"var(--font-mono)", marginTop:2}}>
              SHEET-0471 · Q2_成本分析_協作 · 3/4 人準備中
            </div>
          </div>
          <div style={{fontSize:11.5, color:"var(--ink-muted)", fontFamily:"var(--font-mono)"}}>
            Ctrl + 1 / 2 / 3 快速切換
          </div>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 340px", gap: 16, alignItems:"start"}}>
          {/* 左側三張範本卡 */}
          <div className="mode-templates">
            {MODES.map((m, i) => (
              <div key={m.id}
                   className={"mode-card" + (active === m.id ? " active" : "")}
                   onClick={() => setActive(m.id)}>
                <div className="mc-thumb">{THUMBS[m.id]}</div>
                <div className="mc-body">
                  <div className="mc-title">
                    <span style={{color:"var(--ink-muted)", fontFamily:"var(--font-mono)", fontSize:11, marginRight:6}}>
                      0{i+1}
                    </span>
                    {m.title}
                  </div>
                  <div className="mc-subtitle">{m.subtitle}</div>
                  <div className="mc-tags">
                    {m.tags.map(t => <span key={t} className="mc-tag">{t}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 右側詳情 */}
          <div className="mode-detail">
            <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-muted)", marginBottom:4}}>
              TEMPLATE · DETAIL
            </div>
            <h4>{mode.title}</h4>
            <p className="md-pitch">{mode.pitch}</p>
            <div className="md-kv">
              {Object.entries(mode.meta).map(([k, v]) => (
                <React.Fragment key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{marginTop:16, display:"flex", gap:8}}>
              <div className="btn-cell primary" style={{flex:1, textAlign:"center"}}>使用此範本</div>
              <div className="btn-cell">查看詳情</div>
            </div>
          </div>
        </div>
      </div>
    </SheetWindow>
  );
}

Object.assign(window, { ScreenModeSelect, ThumbBR, ThumbItems, ThumbTerritory });
