// 畫面 01：遊戲模式選擇頁（改寫自 design/ScreenModeSelect.jsx）
// 原設計假設 React 是 global、tabs 是 string 陣列；這裡改成 import + SheetWindow 的 {id,label} 格式。

import { useState, Fragment } from 'react';
import SheetWindow from '../components/SheetWindow.jsx';

/* ------------------------------------------------------------
   3 種遊戲模式資料
   ------------------------------------------------------------ */
const MODES = [
  {
    id: 'battle-royale',
    title: '經典大逃殺',
    subtitle: 'file: 資料清理報告.xlsx',
    pitch:
      '地圖邊緣會隨機翻出 #REF! 報錯毒圈，待在錯誤區會抖動並扣血。用滑鼠左鍵射擊、右鍵舉盾、Shift 向鼠標方向瞬移兩步。最後一人存活。',
    tags: ['#射擊', '#大逃殺', '#8人'],
    meta: {
      建議人數: '4 – 8',
      操作: 'WASD / 左鍵射擊 / 右鍵舉盾 / Shift 衝刺',
      核心機制: '報錯毒圈 (#REF! / #VALUE! / #NULL!)',
      地圖數: '5 款試算表場景',
      公式: (
        <>
          <span className="fn">=BATTLE.ROYALE</span>(MAP, 8)
        </>
      ),
    },
    available: true,
  },
  {
    id: 'items',
    title: '道具戰',
    subtitle: 'file: 進階儲存格格式工具.xlsx',
    pitch:
      'HP + MP 雙資源，5 種「儲存格技能」：凍結窗格定身、Ctrl+Z 回血、合併儲存格減速、唯讀炸彈封技、資料驗證傳送。策略 > 反射神經。',
    tags: ['#策略', '#技能', '#4 – 6人'],
    meta: {
      建議人數: '4 – 6',
      操作: 'WASD / LMB 射擊 / 1–5 施放技能',
      核心機制: '5 個儲存格格式技能 · CD + MP 消耗',
      回合: '3 分鐘倒數 · 最後一人存活',
      公式: (
        <>
          <span className="fn">=ITEM.WAR</span>(SKILLS, HP, MP)
        </>
      ),
    },
    available: true,
  },
  {
    id: 'territory',
    title: '數據領地爭奪戰',
    subtitle: 'file: 條件式格式化_塗色進度.xlsx',
    pitch:
      '移動過的格子會變成自己的隊色，用自己的顏色圍成封閉矩形時，內部所有儲存格瞬間被「格式刷」填滿。看起來像資料分類，實則是地盤戰。',
    tags: ['#佔領', '#團隊', '#新手友善'],
    meta: {
      建議人數: '4 – 6（2–3 隊）',
      操作: 'WASD 移動 = 塗色',
      核心機制: '封閉區連鎖佔領（flood fill）',
      勝利條件: '時限結束時佔地最多',
      公式: (
        <>
          <span className="fn">=TERRITORY</span>(COUNTIF(COLOR=TEAM))
        </>
      ),
    },
    available: true,
  },
];

/* ------------------------------------------------------------
   通用 MiniMap 元件（縮圖共用）
   ------------------------------------------------------------ */
function MiniMap({ cols, rows, cells }) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const cell = cells[key] ?? {};
      grid.push(
        <div
          key={key}
          style={{
            background: cell.bg || 'transparent',
            color: cell.color,
            position: 'relative',
          }}
        >
          {cell.glyph && <span>{cell.glyph}</span>}
          {cell.tri && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 0,
                height: 0,
                borderTop: '4px solid var(--accent-danger)',
                borderLeft: '4px solid transparent',
              }}
            />
          )}
        </div>,
      );
    }
  }
  return (
    <div
      className="mini-map"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {grid}
    </div>
  );
}

/* ------------------------------------------------------------
   各模式專屬縮圖
   ------------------------------------------------------------ */
function ThumbBR() {
  const cells = {};
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 14; c++) {
      if (
        r === 0 ||
        r === 8 ||
        c === 0 ||
        c === 13 ||
        (r === 1 && c > 10) ||
        (c === 1 && r > 6)
      ) {
        cells[`${c},${r}`] = {
          bg: 'rgba(204,42,26,0.14)',
          color: '#cc2a1a',
          glyph: '#',
          tri: true,
        };
      }
    }
  }
  [[4, 3], [4, 4], [5, 3], [5, 4], [8, 5], [9, 5]].forEach(([c, r]) => {
    cells[`${c},${r}`] = { bg: 'var(--accent)' };
  });
  cells['3,6'] = { bg: '#fce2c4', glyph: '🐶' };
  cells['10,3'] = { bg: '#d9e4ff', glyph: '🐱' };
  cells['7,7'] = { bg: '#d9e4ff', glyph: '🐱' };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}

function ThumbItems() {
  const cells = {};
  cells['3,2'] = { bg: '#d4d4d4', glyph: '❄' };
  cells['4,2'] = { bg: '#d4d4d4', glyph: '❄' };
  cells['6,4'] = { bg: '#e4d8b3' };
  cells['7,4'] = { bg: '#e4d8b3' };
  cells['9,5'] = { bg: '#efeadf', glyph: '🔒' };
  cells['11,6'] = { bg: 'var(--bg-paper)', glyph: '▼' };
  cells['2,5'] = { bg: '#fce2c4', glyph: '🐶' };
  cells['10,3'] = { bg: '#d9e4ff', glyph: '🐱' };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}

function ThumbTerritory() {
  const cells = {};
  [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]].forEach(([c, r]) => {
    cells[`${c},${r}`] = { bg: '#d88b8b' };
  });
  cells['2,2'] = { bg: '#e8a6a6', glyph: '🐶' };
  [[8, 5], [9, 5], [10, 5], [8, 6], [10, 6], [8, 7], [9, 7], [10, 7]].forEach(([c, r]) => {
    cells[`${c},${r}`] = { bg: '#8a9fc0' };
  });
  cells['9,6'] = { bg: '#a7b8d3', glyph: '🐱' };
  [[5, 7], [6, 7], [7, 7]].forEach(([c, r]) => {
    cells[`${c},${r}`] = { bg: '#8db08a' };
  });
  cells['6,7'] = { bg: '#b0cdae', glyph: '🐾' };
  return <MiniMap cols={14} rows={9} cells={cells} />;
}

const THUMBS = {
  'battle-royale': <ThumbBR />,
  items: <ThumbItems />,
  territory: <ThumbTerritory />,
};

/* ------------------------------------------------------------
   主元件
   ------------------------------------------------------------ */
export default function ModeSelect({ onModeSelected, onBack }) {
  const [active, setActive] = useState('battle-royale');
  const mode = MODES.find((m) => m.id === active);

  const handleUseTemplate = () => {
    if (!mode.available) return;
    onModeSelected?.(mode.id);
  };

  return (
    <SheetWindow
      fileName="選擇範本.xlsx — [唯讀]"
      cellRef="A1"
      formula={
        <>
          <span className="fn">=CHOOSE.MODE</span>(
          <span style={{ color: 'var(--accent-danger)' }}>&quot;{mode.title}&quot;</span>)
        </>
      }
      tabs={[
        { id: 'main', label: '主選單' },
        { id: 'mode', label: '選擇模式' },
      ]}
      activeTab="mode"
      onTabSelect={(id) => {
        if (id === 'main') onBack?.();
      }}
      statusLeft={`就緒 — 選擇一個範本開始 · 當前：${mode.title}`}
      statusRight="點擊範本縮圖即時切換"
      fullscreen
    >
      <div
        className="sw-paper"
        style={{ padding: '22px 26px', gap: 16, overflow: 'auto' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>選擇範本 / 遊戲模式</div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--ink-muted)',
                fontFamily: 'var(--font-mono)',
                marginTop: 2,
              }}
            >
              SHEET-0471 · Q2_成本分析_協作 · 3/4 人準備中
            </div>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--ink-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Ctrl + 1 / 2 / 3 快速切換
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 16,
            alignItems: 'start',
            maxWidth: 1080,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '100%',
          }}
        >
          {/* 左側三張範本卡 */}
          <div className="mode-templates">
            {MODES.map((m, i) => {
              const disabled = !m.available;
              return (
                <div
                  key={m.id}
                  className={`mode-card${active === m.id ? ' active' : ''}${
                    disabled ? ' disabled' : ''
                  }`}
                  onClick={() => setActive(m.id)}
                >
                  <div className="mc-thumb">
                    {THUMBS[m.id]}
                    <span
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        padding: '1px 5px',
                        background: 'var(--bg-paper)',
                        border: '1px solid var(--line-soft)',
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-muted)',
                        letterSpacing: 1,
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="mc-body">
                    <div className="mc-title">
                      {m.title}
                      {disabled && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: 1,
                            padding: '1px 5px',
                            background: 'var(--ink-muted)',
                            color: 'var(--bg-paper)',
                          }}
                        >
                          SOON
                        </span>
                      )}
                    </div>
                    <div className="mc-subtitle">{m.subtitle}</div>
                    <div className="mc-tags">
                      {m.tags.map((t) => (
                        <span key={t} className="mc-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 右側詳情 */}
          <div className="mode-detail">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--ink-muted)',
              }}
            >
              TEMPLATE · DETAIL
            </div>
            <h4>{mode.title}</h4>
            <p className="md-pitch">{mode.pitch}</p>
            <div className="md-kv">
              {Object.entries(mode.meta).map(([k, v]) => (
                <Fragment key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </Fragment>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <div
                className={`btn-cell primary${mode.available ? '' : ' disabled'}`}
                style={{ flex: 1, textAlign: 'center' }}
                onClick={handleUseTemplate}
              >
                {mode.available ? '使用此範本' : '尚未開放'}
              </div>
              <div className="btn-cell" onClick={onBack}>
                回主選單
              </div>
            </div>
          </div>
        </div>
      </div>
    </SheetWindow>
  );
}
