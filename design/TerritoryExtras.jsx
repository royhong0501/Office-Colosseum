/* ============================================================
   畫面 04 補充：分解圖 / 圖例 / 隊色提案 / Tweaks 用 Palette
   ============================================================ */

/* ——— 分解圖：3 步呈現「圍起封閉矩形 → 格式刷填滿」 ——— */
function TerritoryBreakdown() {
  // 共用配色：A 隊淺綠
  const base = "#b5d5a6", deep = "#8dba7a";

  // step 1：角色開始塗色邊緣
  const s1 = [[1,1],[2,1]];
  // step 2：完成封閉矩形（外框）
  const s2 = [[1,1],[2,1],[3,1],[3,2],[3,3],[2,3],[1,3],[1,2]];
  // step 3：內部格式刷填滿
  const s3 = [...s2];
  const s3Inner = [[2,2]];

  const Mini = ({ outline, inner }) => (
    <div className="bd-mini">
      {Array.from({length: 25}).map((_, i) => {
        const c = i % 5, r = Math.floor(i/5);
        const hit = outline.find(([oc,or]) => oc===c && or===r);
        const isInner = inner?.find(([oc,or]) => oc===c && or===r);
        return (
          <div key={i} style={{
            background: hit ? deep : (isInner ? base : "transparent"),
            position: "relative",
          }}>
            {hit && c === 1 && r === 1 && <span style={{fontSize:9, position:"absolute", inset:0, display:"grid", placeItems:"center"}}>🐶</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bd-steps">
      <div className="bd-step">
        <Mini outline={s1} />
        <div className="caption">
          <b>01</b> 走過 = 塗色。<br/>角色移動的格子轉為自身隊色。
        </div>
      </div>
      <div className="bd-step">
        <Mini outline={s2} />
        <div className="caption">
          <b>02</b> 圍起封閉矩形。<br/>外框 8 格為同一隊色。
        </div>
      </div>
      <div className="bd-step">
        <Mini outline={s2} inner={s3Inner} />
        <div className="caption">
          <b>03</b> 格式刷連鎖填滿。<br/>內部格子瞬間填滿 +1 combo。
        </div>
      </div>
    </div>
  );
}

/* ——— 圖例 ——— */
function TerritoryLegend() {
  return (
    <div>
      {[
        { sw:"#b5d5a6", name:"A 隊已佔領", fn:"$A$1:$COUNTIF(=A)" },
        { sw:"#8dba7a", name:"A 隊 · 格式刷填滿區", fn:"=FORMATBRUSH 成果" },
        { sw:"#e6b5b0", name:"B 隊已佔領", fn:"$A$1:$COUNTIF(=B)" },
        { sw:"#f0dca7", name:"C 隊已佔領", fn:"$A$1:$COUNTIF(=C)" },
        { sw:"rgba(204,42,26,0.14)", name:"爭奪中（邊界）", fn:"規則 · 雙色重疊" },
        { sw:"transparent", name:"未佔領", fn:"空白儲存格" },
      ].map(l => (
        <div key={l.name} className="legend-rule">
          <div className="swatch" style={{background: l.sw}} />
          <span>{l.name}</span>
          <span className="fn">{l.fn}</span>
        </div>
      ))}
      <div style={{marginTop: 10, fontSize: 10.5, color: "var(--ink-muted)", fontFamily: "var(--font-mono)", lineHeight: 1.5}}>
        // 偽裝 lore：右鍵 → 格式 → 條件式格式化 → 規則管理員
      </div>
    </div>
  );
}

/* ——— 隊色提案 · 點擊切換 hero 配色 ——— */
function TerritoryPalettes() {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const h = (e) => {
      if (e.data?.type === "__palette-sync") setIdx(e.data.i);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  const pick = (i) => {
    setIdx(i);
    window.postMessage({ type: "__palette-sync", i }, "*");
  };
  return (
    <div className="palette-options">
      {PALETTES.map((p, i) => (
        <div key={p.id}
             className={"palette-row" + (i === idx ? " active" : "")}
             onClick={() => pick(i)}>
          <div className="pr-swatches">
            {p.teams.map((t, ti) => <span key={ti} style={{background: t.deep}} />)}
          </div>
          <div style={{flex:1}}>
            <div className="pr-label">{p.name}</div>
            <div className="pr-hint">{p.hint}</div>
          </div>
        </div>
      ))}
      <div style={{marginTop:6, fontSize:10.5, color:"var(--ink-muted)", fontFamily:"var(--font-mono)", lineHeight:1.5}}>
        // 點擊即時切換上方 Hero 的隊色
      </div>
    </div>
  );
}

/* ——— Tweaks panel 內的小 palette 切換 ——— */
function PaletteTweak() {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const h = (e) => {
      if (e.data?.type === "__palette-sync") setIdx(e.data.i);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  const pick = (i) => {
    setIdx(i);
    window.postMessage({ type: "__palette-sync", i }, "*");
  };
  return (
    <>
      {PALETTES.map((p, i) => (
        <div key={p.id}
             className={"pt-row" + (i === idx ? " active" : "")}
             onClick={() => pick(i)}>
          <div className="pt-sw">
            {p.teams.map((t, ti) => <span key={ti} style={{background: t.deep}} />)}
          </div>
          <span>{p.name}</span>
        </div>
      ))}
    </>
  );
}

Object.assign(window, { TerritoryBreakdown, TerritoryLegend, TerritoryPalettes, PaletteTweak });
