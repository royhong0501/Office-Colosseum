/* ============================================================
   畫面 02：經典大逃殺 — 地圖範本選擇
   對外身分：Excel 插入範本 / 插入圖表 對話框
   提供兩種方案：A = 卡片列、B = 插入圖表對話框
   ============================================================ */

function mapKey(c, r) { return c + "," + r; }

// 把 cover rects 展開成 cell 座標（給 MiniMapForMap 用）
function coverCells(rects) {
  const s = {};
  rects.forEach(([c, r, w, h]) => {
    for (let dc=0; dc<w; dc++) for (let dr=0; dr<h; dr++) {
      s[mapKey(c+dc, r+dr)] = true;
    }
  });
  return s;
}

const MAPS = [
  {
    name: "年度預算報表",
    lore: "格子 + 紅字虧損區做毒圈。節慶感毒圈。",
    pitch: "老闆最愛的 Q4 數字一字排開 — 你踩到的每一格都可能是虧損。合併儲存格當掩體、紅字虧損區當毒圈。適合新手練槍。",
    tags: ["#新手友善", "#散點掩體", "#中型"],
    meta: { "建議人數": "4 – 8", "掩體密度": "中", "毒圈節奏": "標準（每 20s）" },
    covers: [[4,3,2,2],[8,4,3,1],[11,6,2,2],[3,7,2,1],[14,5,1,3],[17,3,1,2]],
    coverType: "cover",
  },
  {
    name: "甘特圖工程進度",
    lore: "長條狀掩體。東西向進攻走廊狹長。",
    pitch: "PM 的惡夢 — 延宕的任務變成一條條長掩體，東西向走廊極窄。遠距離對槍與走位戰。",
    tags: ["#走廊戰", "#長掩體", "#狙擊友善"],
    meta: { "建議人數": "4 – 6", "掩體密度": "高（橫向）", "毒圈節奏": "快（每 15s）" },
    covers: [[2,2,5,1],[9,3,6,1],[5,5,4,1],[13,5,4,1],[3,7,7,1],[12,7,5,1]],
    coverType: "cover-lt",
  },
  {
    name: "樞紐分析表",
    lore: "巨大合併儲存格當掩體，視野被切斷。",
    pitch: "大面積合併儲存格切碎視野，處處是死角。衝刺與繞背玩家的天堂。",
    tags: ["#死角", "#衝刺友善", "#大型"],
    meta: { "建議人數": "6 – 8", "掩體密度": "巨型區塊", "毒圈節奏": "慢（每 25s）" },
    covers: [[2,2,4,3],[10,2,5,2],[6,6,3,2],[14,5,4,3]],
    coverType: "cover",
  },
  {
    name: "股價 K 線",
    lore: "柱狀物當牆，地圖中央縱向 K 線切割。",
    pitch: "縱向 K 線柱把地圖切成紅綠兩陣，多數對槍發生在柱間。節奏快。",
    tags: ["#縱向切割", "#快節奏", "#小型"],
    meta: { "建議人數": "4 – 6", "掩體密度": "中（縱向）", "毒圈節奏": "極快（每 12s）" },
    covers: [[4,2,1,5],[7,1,1,6],[10,3,1,4],[13,1,1,5],[16,4,1,4]],
    coverType: "cover",
  },
  {
    name: "銷售熱區",
    lore: "條件式格式化色塊 + 散落掩體。",
    pitch: "小掩體群密集分布，近距離肉搏為主。適合舉盾衝臉流派。",
    tags: ["#近戰", "#肉搏", "#8人推薦"],
    meta: { "建議人數": "6 – 8", "掩體密度": "密集小型", "毒圈節奏": "標準" },
    covers: [[3,2,2,2],[7,3,2,2],[12,2,2,2],[15,5,2,2],[5,6,2,2],[10,6,2,2]],
    coverType: "cover-lt",
  },
];

/* ─────────────────────────────────────────────
   方案 A：範本卡列（與畫面 01 模式選擇一致）
   ───────────────────────────────────────────── */
function ScreenBattleRoyale_A() {
  const [mapIdx, setMapIdx] = React.useState(0);
  const map = MAPS[mapIdx];

  return (
    <SheetWindow
      fileName={"資料清理報告_SHEET-0471.xlsx"}
      cellRef="A1"
      formula={<>
        <span className="fn">=CHOOSE.MAP</span>(
        <span style={{color:"#8a3d2c"}}>"{map.name}"</span>)
        <span style={{color:"var(--ink-muted)", marginLeft: 12}}>// 從 5 張範本中挑一張</span>
      </>}
      activeTab="大逃殺"
      tabs={["主選單", "大逃殺"]}
      statusLeft={`就緒 — 當前選擇：${map.name}`}
      statusRight="方案 A · 範本卡列"
    >
      <div className="sw-paper" style={{padding: "28px 32px", background: "var(--bg-paper-alt)"}}>
        <div style={{marginBottom: 18}}>
          <div style={{fontSize: 16, fontWeight: 600}}>選擇地圖範本 · =CHOOSE.MAP()</div>
          <div style={{fontSize: 12, color: "var(--ink-muted)", fontFamily: "var(--font-mono)", marginTop: 3}}>
            所有範本 · 5 張 · 點擊卡片即選擇
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14}}>
          {MAPS.map((m, i) => (
            <div key={m.name}
                 className={"mode-card" + (i === mapIdx ? " active" : "")}
                 onClick={() => setMapIdx(i)}>
              <div className="mc-thumb" style={{aspectRatio: "4 / 3"}}>
                {MiniMapForMap(i)}
              </div>
              <div className="mc-body">
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-muted)"}}>
                  MAP 0{i+1}
                </div>
                <div className="mc-title">{m.name}</div>
                <div className="mc-tags">
                  {m.tags.slice(0,2).map(t => <span key={t} className="mc-tag">{t}</span>)}
                </div>
                <div style={{fontSize: 10.5, color: "var(--ink-muted)", lineHeight: 1.5, marginTop: 6}}>
                  {m.meta["建議人數"]} · {m.meta["毒圈節奏"]}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end"}}>
          <div className="btn-cell">取消</div>
          <div className="btn-cell primary">使用地圖「{map.name}」</div>
        </div>
      </div>
    </SheetWindow>
  );
}

/* ─────────────────────────────────────────────
   方案 B：Excel「插入圖表」對話框樣式
   左列縮圖、右側大預覽 + 說明 + 確定/取消
   浮在試算表底圖上
   ───────────────────────────────────────────── */
function ScreenBattleRoyale_B() {
  const [mapIdx, setMapIdx] = React.useState(0);
  const [tab, setTab] = React.useState("all"); // recommended | all
  const map = MAPS[mapIdx];

  return (
    <SheetWindow
      fileName={"資料清理報告_SHEET-0471.xlsx"}
      cellRef="A1"
      formula={<>
        <span className="fn">=INSERT.MAP</span>()
        <span style={{color:"var(--ink-muted)", marginLeft: 12}}>// 插入地圖對話框</span>
      </>}
      activeTab="大逃殺"
      tabs={["主選單", "大逃殺"]}
      statusLeft="就緒 — 插入地圖對話框"
      statusRight="方案 B · 插入圖表對話框"
    >
      {/* 底層試算表（模擬對話框後的空白工作表） */}
      <div className="sw-paper" style={{padding: 0, position: "relative", minHeight: 560, background: "var(--bg-paper)"}}>
        {/* 欄名 row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "40px repeat(22, 1fr)",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-chrome)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ink-muted)",
        }}>
          <div style={{padding: "3px 0", textAlign: "center", borderRight: "1px solid var(--line)"}}></div>
          {"ABCDEFGHIJKLMNOPQRSTUV".split("").map(c => (
            <div key={c} style={{padding: "3px 0", textAlign: "center", borderRight: "1px solid var(--line-soft)"}}>{c}</div>
          ))}
        </div>
        {/* 空白列 */}
        {Array.from({length: 22}).map((_, r) => (
          <div key={r} style={{
            display: "grid",
            gridTemplateColumns: "40px repeat(22, 1fr)",
            borderBottom: "1px solid var(--line-soft)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-muted)",
            height: 22,
          }}>
            <div style={{padding: "3px 0", textAlign: "center", borderRight: "1px solid var(--line)", background: "var(--bg-chrome)"}}>{r+1}</div>
            {Array.from({length: 22}).map((_, c) => (
              <div key={c} style={{borderRight: "1px solid var(--line-soft)"}}></div>
            ))}
          </div>
        ))}

        {/* 對話框 overlay */}
        <div style={{
          position: "absolute",
          top: 34,
          left: "50%",
          transform: "translateX(-50%)",
          width: 640,
          background: "var(--bg-paper)",
          border: "1px solid var(--line)",
          boxShadow: "0 6px 22px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.14)",
          fontSize: 12,
        }}>
          {/* 標題列 */}
          <div style={{
            padding: "7px 10px",
            background: "var(--bg-chrome)",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
          }}>
            <span>插入地圖</span>
            <div style={{display: "flex", gap: 14, alignItems: "center", color: "var(--ink-muted)"}}>
              <span style={{fontSize: 12}}>?</span>
              <span style={{fontSize: 12}}>×</span>
            </div>
          </div>

          {/* tabs */}
          <div style={{
            padding: "8px 12px 0",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            gap: 0,
            fontSize: 11.5,
          }}>
            {[["recommended","建議的地圖"],["all","所有地圖"]].map(([k, label]) => (
              <div key={k}
                   onClick={() => setTab(k)}
                   style={{
                     padding: "6px 14px",
                     borderTop: tab === k ? "1px solid var(--line)" : "1px solid transparent",
                     borderLeft: tab === k ? "1px solid var(--line)" : "1px solid transparent",
                     borderRight: tab === k ? "1px solid var(--line)" : "1px solid transparent",
                     borderBottom: tab === k ? "1px solid var(--bg-paper)" : "none",
                     background: tab === k ? "var(--bg-paper)" : "transparent",
                     marginBottom: -1,
                     fontWeight: tab === k ? 600 : 400,
                     cursor: "pointer",
                   }}>
                {label}
              </div>
            ))}
          </div>

          {/* body */}
          <div style={{display: "grid", gridTemplateColumns: "180px 1fr", minHeight: 340}}>
            {/* 左側縮圖列 */}
            <div style={{
              borderRight: "1px solid var(--line)",
              background: "var(--bg-paper)",
              padding: "8px 10px",
              maxHeight: 380,
              overflowY: "auto",
            }}>
              {MAPS.map((m, i) => (
                <div key={m.name}
                     onClick={() => setMapIdx(i)}
                     style={{
                       marginBottom: 8,
                       padding: 4,
                       border: i === mapIdx ? "2px solid #2a4d8f" : "1px solid var(--line-soft)",
                       background: "var(--bg-paper)",
                       cursor: "pointer",
                     }}>
                  <div style={{aspectRatio: "4 / 3", background: "var(--bg-input)", position: "relative", overflow: "hidden"}}>
                    {MiniMapForMap(i)}
                  </div>
                  <div style={{
                    fontSize: 9.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-muted)",
                    marginTop: 3,
                    textAlign: "center",
                    lineHeight: 1.3,
                  }}>
                    {m.name}
                  </div>
                </div>
              ))}
            </div>

            {/* 右側大預覽 */}
            <div style={{padding: "14px 18px", display: "flex", flexDirection: "column"}}>
              <div style={{fontSize: 14, fontWeight: 600, marginBottom: 8}}>
                {map.name}
              </div>
              <div style={{
                flex: "0 0 auto",
                aspectRatio: "16 / 9",
                background: "var(--bg-paper)",
                border: "1px solid var(--line-soft)",
                position: "relative",
                overflow: "hidden",
                marginBottom: 10,
              }}>
                {MiniMapForMap(mapIdx)}
              </div>
              <div style={{fontSize: 11.5, lineHeight: 1.6, color: "var(--ink)", marginBottom: 6}}>
                {map.pitch}
              </div>
              <div style={{fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--ink-muted)", lineHeight: 1.7}}>
                建議人數：{map.meta["建議人數"]} · 掩體：{map.meta["掩體密度"]} · 毒圈：{map.meta["毒圈節奏"]}
              </div>
            </div>
          </div>

          {/* 底部按鈕 */}
          <div style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--line)",
            background: "var(--bg-paper-alt)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}>
            <div className="btn-cell primary" style={{minWidth: 60, textAlign: "center"}}>確定</div>
            <div className="btn-cell" style={{minWidth: 60, textAlign: "center"}}>取消</div>
          </div>
        </div>
      </div>
    </SheetWindow>
  );
}

Object.assign(window, { ScreenBattleRoyale_A, ScreenBattleRoyale_B, MAPS });
