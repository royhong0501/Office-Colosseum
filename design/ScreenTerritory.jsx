/* ============================================================
   畫面 04：數據領地爭奪戰 — Hero
   ============================================================ */

const PALETTES = [
  {
    id: "cf-default",
    name: "條件式格式化預設",
    hint: "淺綠 / 淺紅 / 淺黃",
    teams: [
      { name: "A 隊", base: "#b5d5a6", deep: "#8dba7a", edge: "#6a9358" },
      { name: "B 隊", base: "#e6b5b0", deep: "#d88b8b", edge: "#b05f5f" },
      { name: "C 隊", base: "#f0dca7", deep: "#d8be7a", edge: "#a89250" },
    ],
  },
  {
    id: "data-bars",
    name: "資料橫條圖（藍橘）",
    hint: "Excel 資料橫條感",
    teams: [
      { name: "A 隊", base: "#a9c4e2", deep: "#7a9dc4", edge: "#4f78a3" },
      { name: "B 隊", base: "#f0c8a0", deep: "#dca272", edge: "#a8733f" },
      { name: "C 隊", base: "#bfbac9", deep: "#9691a8", edge: "#6b6679" },
    ],
  },
  {
    id: "heatmap",
    name: "熱區色階",
    hint: "紅 / 橙 / 紫",
    teams: [
      { name: "A 隊", base: "#e0a6a6", deep: "#c87070", edge: "#984040" },
      { name: "B 隊", base: "#e3c39a", deep: "#c49760", edge: "#8c6830" },
      { name: "C 隊", base: "#c9b5d6", deep: "#a387b8", edge: "#70558a" },
    ],
  },
];

function ScreenTerritoryHero() {
  const [palette, setPalette] = React.useState(0);
  React.useEffect(() => {
    const h = (e) => {
      if (e.data?.type === "__palette-sync") setPalette(e.data.i);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  const p = PALETTES[palette];
  const COLS = 22, ROWS = 13;

  // 塗色：每隊畫出幾塊
  const painted = {};
  const paintRect = (c, r, w, h, team, dark=false) => {
    for (let dc=0; dc<w; dc++) for (let dr=0; dr<h; dr++) {
      painted[(c+dc)+","+(r+dr)] = { team, dark };
    }
  };
  // A 隊 — 左上塊 + 已封閉矩形
  paintRect(1, 2, 1, 5, 0);   // 左邊
  paintRect(1, 2, 5, 1, 0);   // 上邊
  paintRect(5, 2, 1, 5, 0);   // 右邊
  paintRect(1, 6, 5, 1, 0);   // 下邊
  paintRect(2, 3, 3, 3, 0, true); // 填滿（閃）

  // B 隊 — 中段走廊
  paintRect(8, 6, 6, 1, 1);
  paintRect(8, 7, 1, 3, 1);
  paintRect(13, 6, 1, 4, 1);
  paintRect(9, 9, 4, 1, 1);

  // C 隊 — 右邊散落
  paintRect(16, 3, 3, 1, 2);
  paintRect(16, 4, 1, 5, 2);
  paintRect(18, 4, 1, 2, 2);
  paintRect(17, 8, 3, 1, 2);

  // 玩家位置
  const players = [
    { c:3, r:4, char:"🐶", team:0, me:true, name:"我" },
    { c:13,r:9, char:"🐱", team:1 },
    { c:18,r:6, char:"🐾", team:2 },
    { c:5, r:9, char:"🐶", team:0 },
  ];

  const cells = [];
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const key = c+","+r;
      const paint = painted[key];
      const player = players.find(pl => pl.c === c && pl.r === r);
      let bg = "transparent";
      let cls = "terr-cell";
      if (paint) {
        const t = p.teams[paint.team];
        bg = paint.dark ? t.deep : t.base;
        if (paint.dark) cls += " flash";
      }
      cells.push(
        <div key={key} className={cls} style={{background: bg}}>
          {player && <span style={{fontSize:16}}>{player.char}</span>}
        </div>
      );
    }
  }

  // 分數統計
  const counts = [0,0,0];
  Object.values(painted).forEach(v => counts[v.team]++);
  const total = counts.reduce((a,b)=>a+b,0) || 1;

  return (
    <SheetWindow
      fileName="條件式格式化_塗色進度.xlsx"
      cellRef="A1"
      formula={<>
        <span className="fn">=FORMATBRUSH</span>(B3:F7) <span style={{color:"#4f8d4f", marginLeft:8}}>→ +15 cells</span>
        <span style={{color:"var(--ink-muted)", marginLeft:12}}>// A 隊完成封閉矩形</span>
      </>}
      activeTab="第 1 回合 · 進行中"
      tabs={["主選單", "領地爭奪", "計分板"]}
      statusLeft={`就緒 — 倒數 01:28 · A ${counts[0]} / B ${counts[1]} / C ${counts[2]}`}
      statusRight="平均 ping: 21 ms  |  觀戰: 5"
    >
      <div className="sw-paper" style={{padding: 0, position:"relative", minHeight: 660}}>
        {/* 計分板 */}
        <div className="terr-scoreboard">
          <span className="ts-label">=COUNTIF(COLOR=TEAM)</span>
          <div className="ts-bar">
            {p.teams.map((t, i) => (
              <i key={i} style={{background: t.deep, width: (counts[i]/total*100) + "%"}} />
            ))}
          </div>
          {p.teams.map((t, i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap:4, fontSize:11}}>
              <span style={{width:12, height:12, background:t.deep, border:"1px solid rgba(0,0,0,0.2)", display:"inline-block"}} />
              <span style={{fontWeight: i===0?600:400}}>{t.name}</span>
              <span style={{fontFamily:"var(--font-mono)", color:"var(--ink-muted)"}}>{counts[i]}</span>
            </div>
          ))}
        </div>

        {/* 主格線 */}
        <div className="br-grid" style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          height: 660,
          border: "none",
        }}>
          {cells}
          {/* 封閉虛線框 — 呼應剛被填滿的矩形 */}
          <div className="capture-outline" style={{
            left: `${1/COLS*100}%`,
            top: `${2/ROWS*100}%`,
            width: `${5/COLS*100}%`,
            height: `${5/ROWS*100}%`,
          }} />
        </div>
      </div>
    </SheetWindow>
  );
}

Object.assign(window, { ScreenTerritoryHero, PALETTES });
