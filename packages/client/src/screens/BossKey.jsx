import { excelColors } from '../theme.js';

// --- Data -----------------------------------------------------------------
const HEADERS = ['項目', 'Q1', 'Q2', 'Q3', 'Q4', '總計', 'YoY%', '去年', '預算', '差異', '備註', '狀態', '負責人', '更新日'];
const COL_WIDTHS = [88, 62, 62, 62, 62, 68, 46, 62, 62, 58, 80, 50, 54, 68];

const ROWS = [
  { label: '營收',     q: [12345, 11890, 13210, 14320], prev: [11200, 10800, 11900, 13100], budget: [12000, 12000, 13000, 14000], note: '季節性成長', status: '正常', owner: '王大明' },
  { label: '成本',     q: [ 7890,  7540,  8100,  8760], prev: [ 7100,  6900,  7500,  8200], budget: [ 7500,  7500,  8000,  8500], note: '原料漲價',   status: '警示', owner: '李小華' },
  { label: '毛利',     q: [ 4455,  4350,  5110,  5560], prev: [ 4100,  3900,  4400,  4900], budget: [ 4500,  4500,  5000,  5500], note: '',           status: '正常', owner: '王大明' },
  { label: '營業費用', q: [ 1820,  1760,  1950,  2100], prev: [ 1700,  1680,  1800,  1950], budget: [ 1800,  1800,  1900,  2000], note: '差旅費增加', status: '警示', owner: '張美玲' },
  { label: '研發',     q: [  890,   920,   980,  1050], prev: [  800,   850,   900,   980], budget: [  900,   900,  1000,  1050], note: 'AI投資',     status: '正常', owner: '陳建國' },
  { label: '行銷',     q: [  560,   480,   620,   780], prev: [  520,   450,   580,   720], budget: [  600,   500,   650,   800], note: '品牌活動',   status: '正常', owner: '林淑芬' },
  { label: '管銷',     q: [  370,   360,   350,   270], prev: [  380,   380,   370,   250], budget: [  380,   380,   360,   280], note: '',           status: '良好', owner: '趙志偉' },
  { label: '折舊',     q: [  210,   210,   215,   220], prev: [  200,   200,   205,   210], budget: [  210,   210,   215,   220], note: '設備老化',   status: '正常', owner: '吳秋月' },
  { label: '利息',     q: [   88,    84,    91,    97], prev: [   90,    86,    92,    95], budget: [   90,    90,    90,    90], note: '',           status: '正常', owner: '趙志偉' },
  { label: '稅前淨利', q: [ 2635,  2590,  2863,  3460], prev: [ 2411,  2284,  2461,  2960], budget: [ 2700,  2620,  2875,  3360], note: '',           status: '良好', owner: '王大明' },
  { label: '所得稅',   q: [  527,   518,   572,   692], prev: [  482,   457,   492,   592], budget: [  540,   524,   575,   672], note: '稅率20%',   status: '正常', owner: '林淑芬' },
  { label: '稅後淨利', q: [ 2108,  2072,  2291,  2768], prev: [ 1929,  1827,  1969,  2368], budget: [ 2160,  2096,  2300,  2688], note: '超越預算',   status: '良好', owner: '王大明' },
];

function calcRow(r) {
  const total = r.q.reduce((a, b) => a + b, 0);
  const prevTotal = r.prev.reduce((a, b) => a + b, 0);
  const budget = r.budget.reduce((a, b) => a + b, 0);
  const yoy = prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : '—';
  const diff = total - budget;
  return { ...r, total, prevTotal, yoy, budget, diff };
}

const DATA = ROWS.map(calcRow);

const NUM_ROWS = 30;
const NUM_COLS = 14;

const fmt = n => (typeof n === 'number' ? n.toLocaleString() : n);

// Row index 0-based in grid body (row 1 = headers), selected cell is row 4 (index 3), col A (index 0)
const SELECTED_ROW = 3;
const SELECTED_COL = 0;

// --- Sub-components -------------------------------------------------------
function TitleBar() {
  return (
    <div style={{
      background: '#217346',
      color: '#fff',
      height: 30,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      fontSize: 13,
      fontWeight: 600,
      userSelect: 'none',
      flexShrink: 0,
    }}>
      <span style={{ marginRight: 8, fontSize: 16 }}>📗</span>
      季度報表_final_v3.xlsx — Excel
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 0 }}>
        {['—', '□', '✕'].map((s, i) => (
          <div key={i} style={{
            width: 46, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: i === 2 ? 12 : 14, cursor: 'default',
            background: 'transparent',
          }}
            onMouseEnter={e => e.currentTarget.style.background = i === 2 ? '#c42b1c' : 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >{s}</div>
        ))}
      </div>
    </div>
  );
}

function MenuBar() {
  const menus = ['檔案', '常用', '插入', '版面配置', '公式', '資料', '校閱', '檢視', '說明'];
  return (
    <div style={{
      background: '#217346',
      display: 'flex',
      alignItems: 'center',
      height: 26,
      padding: '0 4px',
      fontSize: 12,
      color: '#fff',
      flexShrink: 0,
    }}>
      {menus.map(m => (
        <div key={m} style={{
          padding: '3px 10px', cursor: 'default', borderRadius: 2,
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >{m}</div>
      ))}
    </div>
  );
}

function Toolbar() {
  const groups = [
    ['📋', '✂', '📌', '🖌'],
    ['B', 'I', 'U'],
    ['⬅', '☰', '➡'],
    ['💲', '%', ',', '.0', '.00'],
    ['📊', '⚠', '🔽'],
  ];
  return (
    <div style={{
      background: '#f3f2f1',
      borderBottom: '1px solid #c8c8c8',
      display: 'flex',
      alignItems: 'center',
      padding: '3px 6px',
      gap: 2,
      height: 40,
      flexShrink: 0,
      overflowX: 'hidden',
    }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: 'flex', gap: 1, marginRight: 6, borderRight: '1px solid #d1d1d1', paddingRight: 6 }}>
          {g.map((btn, bi) => (
            <div key={bi} style={{
              minWidth: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'default', borderRadius: 2, fontSize: 11,
              fontWeight: ['B', 'I', 'U'].includes(btn) ? 'bold' : 'normal',
              fontStyle: btn === 'I' ? 'italic' : 'normal',
              textDecoration: btn === 'U' ? 'underline' : 'none',
              color: '#333',
              padding: '0 4px',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#e1dfdd'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{btn}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FormulaBar() {
  return (
    <div style={{
      background: '#f3f2f1',
      borderBottom: '1px solid #c8c8c8',
      display: 'flex',
      alignItems: 'center',
      height: 26,
      padding: '0 4px',
      gap: 4,
      fontSize: 12,
      flexShrink: 0,
    }}>
      <div style={{
        width: 60, padding: '1px 6px',
        background: '#fff',
        border: '1px solid #c8c8c8',
        textAlign: 'center',
        fontFamily: 'Consolas, monospace',
        fontSize: 11,
        color: '#333',
      }}>A1</div>
      <div style={{ color: '#666', fontStyle: 'italic', fontSize: 13, padding: '0 4px' }}>fx</div>
      <div style={{
        flex: 1, padding: '1px 6px',
        background: '#fff',
        border: '1px solid #c8c8c8',
        fontFamily: 'Consolas, monospace',
        fontSize: 11,
        color: '#333',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}>=SUM(B2:B13)</div>
    </div>
  );
}

function SheetGrid() {
  const ROW_H = 18;
  const HEADER_COL_W = 28;

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      background: '#fff',
      position: 'relative',
    }}>
      <table style={{
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        minWidth: COL_WIDTHS.reduce((a, b) => a + b, HEADER_COL_W),
      }}>
        {/* Column headers (A, B, C, ...) */}
        <thead>
          <tr style={{ height: ROW_H }}>
            {/* Corner cell */}
            <th style={{
              width: HEADER_COL_W, minWidth: HEADER_COL_W,
              background: '#f3f2f1', border: '1px solid #d1d1d1',
              fontSize: 10, position: 'sticky', top: 0, left: 0, zIndex: 3,
            }} />
            {'ABCDEFGHIJKLMN'.split('').map((c, ci) => (
              <th key={c} style={{
                width: COL_WIDTHS[ci], minWidth: COL_WIDTHS[ci],
                background: ci === SELECTED_COL ? '#d3e9d0' : '#f3f2f1',
                border: '1px solid #d1d1d1',
                fontSize: 11, fontWeight: 400, color: '#333',
                textAlign: 'center',
                position: 'sticky', top: 0, zIndex: 2,
                userSelect: 'none',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Row 1: column headers (label row) */}
          <tr style={{ height: ROW_H }}>
            <td style={{
              background: '#f3f2f1', border: '1px solid #d1d1d1',
              fontSize: 10, textAlign: 'center', color: '#666',
              position: 'sticky', left: 0, zIndex: 1,
              fontFamily: 'Consolas, monospace',
            }}>1</td>
            {HEADERS.map((h, ci) => (
              <td key={ci} style={{
                background: '#e9f0e9', border: '1px solid #c8c8c8',
                padding: '1px 4px', fontSize: 12, fontWeight: 700,
                color: '#1d5b35', whiteSpace: 'nowrap', overflow: 'hidden',
                width: COL_WIDTHS[ci],
              }}>{h}</td>
            ))}
          </tr>

          {/* Data rows 2-13 */}
          {DATA.map((row, ri) => {
            const rn = ri + 2;
            const isSelected = ri === SELECTED_ROW;
            const isHighlighted = row.label === '稅後淨利' || row.label === '毛利';
            return (
              <tr key={ri} style={{ height: ROW_H }}>
                {/* Row number */}
                <td style={{
                  background: isSelected ? '#d3e9d0' : '#f3f2f1',
                  border: '1px solid #d1d1d1',
                  fontSize: 10, textAlign: 'center', color: '#666',
                  position: 'sticky', left: 0, zIndex: 1,
                  fontFamily: 'Consolas, monospace',
                }}>{rn}</td>

                {/* A: 項目 */}
                <td style={cellStyle(isSelected, 0, SELECTED_COL, ri, SELECTED_ROW, { fontWeight: isHighlighted ? 700 : 500, color: '#1d5b35' })}>
                  {row.label}
                </td>

                {/* B-E: Q1-Q4 */}
                {row.q.map((v, qi) => (
                  <td key={qi} style={cellStyle(isSelected, qi + 1, SELECTED_COL, ri, SELECTED_ROW, numStyle(v))}>
                    {fmt(v)}
                  </td>
                ))}

                {/* F: 總計 */}
                <td style={cellStyle(isSelected, 5, SELECTED_COL, ri, SELECTED_ROW, { ...numStyle(row.total), fontWeight: 700, background: isSelected ? '#b5d6b2' : '#eaf4ea' })}>
                  {fmt(row.total)}
                </td>

                {/* G: YoY% */}
                <td style={cellStyle(isSelected, 6, SELECTED_COL, ri, SELECTED_ROW, { ...numStyle(parseFloat(row.yoy)), textAlign: 'right', color: parseFloat(row.yoy) >= 0 ? '#107c10' : '#a4262c' })}>
                  {row.yoy !== '—' ? `${row.yoy}%` : '—'}
                </td>

                {/* H: 去年 */}
                <td style={cellStyle(isSelected, 7, SELECTED_COL, ri, SELECTED_ROW, numStyle(row.prevTotal))}>
                  {fmt(row.prevTotal)}
                </td>

                {/* I: 預算 */}
                <td style={cellStyle(isSelected, 8, SELECTED_COL, ri, SELECTED_ROW, numStyle(row.budget))}>
                  {fmt(row.budget)}
                </td>

                {/* J: 差異 */}
                <td style={cellStyle(isSelected, 9, SELECTED_COL, ri, SELECTED_ROW, { textAlign: 'right', color: row.diff >= 0 ? '#107c10' : '#a4262c', fontSize: 11 })}>
                  {row.diff >= 0 ? '+' : ''}{fmt(row.diff)}
                </td>

                {/* K: 備註 */}
                <td style={cellStyle(isSelected, 10, SELECTED_COL, ri, SELECTED_ROW, { fontSize: 10, color: '#666' })}>
                  {row.note}
                </td>

                {/* L: 狀態 */}
                <td style={cellStyle(isSelected, 11, SELECTED_COL, ri, SELECTED_ROW, {
                  textAlign: 'center', fontSize: 10,
                  color: row.status === '良好' ? '#107c10' : row.status === '警示' ? '#b45309' : '#333',
                  fontWeight: row.status !== '正常' ? 700 : 400,
                })}>
                  {row.status}
                </td>

                {/* M: 負責人 */}
                <td style={cellStyle(isSelected, 12, SELECTED_COL, ri, SELECTED_ROW, { fontSize: 11 })}>
                  {row.owner}
                </td>

                {/* N: 更新日 */}
                <td style={cellStyle(isSelected, 13, SELECTED_COL, ri, SELECTED_ROW, { fontSize: 10, color: '#888', fontFamily: 'Consolas, monospace' })}>
                  {`2026/0${(ri % 3) + 1}/1${ri}`}
                </td>
              </tr>
            );
          })}

          {/* Filler rows 14-30 */}
          {Array.from({ length: NUM_ROWS - DATA.length - 1 }, (_, i) => (
            <tr key={`filler-${i}`} style={{ height: ROW_H }}>
              <td style={{
                background: '#f3f2f1', border: '1px solid #d1d1d1',
                fontSize: 10, textAlign: 'center', color: '#666',
                position: 'sticky', left: 0, zIndex: 1,
                fontFamily: 'Consolas, monospace',
              }}>{DATA.length + i + 2}</td>
              {Array.from({ length: NUM_COLS }, (_, ci) => (
                <td key={ci} style={{
                  border: '1px solid #e8e8e8',
                  padding: '1px 4px',
                  background: '#fff',
                }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellStyle(rowSelected, colIdx, selCol, rowIdx, selRow, extra = {}) {
  const isSelectedCell = rowIdx === selRow && colIdx === selCol;
  return {
    border: isSelectedCell
      ? '2px solid #107c10'
      : `1px solid ${rowSelected ? '#b5d6b2' : '#e8e8e8'}`,
    padding: '1px 4px',
    fontSize: 12,
    background: rowSelected ? (isSelectedCell ? '#c8e6c5' : '#eaf4ea') : '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    ...extra,
  };
}

function numStyle(v) {
  return { textAlign: 'right', fontFamily: 'Consolas, monospace', fontSize: 11 };
}

function SheetTabs() {
  const tabs = ['工作表1', '工作表2', '工作表3'];
  return (
    <div style={{
      background: '#f3f2f1',
      borderTop: '1px solid #d1d1d1',
      display: 'flex',
      alignItems: 'flex-end',
      height: 26,
      padding: '0 4px',
      gap: 2,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: 1, alignItems: 'center', marginRight: 6 }}>
        {['◀◀', '◀', '▶', '▶▶'].map((b, i) => (
          <div key={i} style={{
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'default', color: '#666', fontSize: 9,
          }}>{b}</div>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t} style={{
          padding: '3px 14px',
          background: i === 0 ? '#fff' : '#e1dfdd',
          border: '1px solid #d1d1d1',
          borderBottom: i === 0 ? '1px solid #fff' : '1px solid #d1d1d1',
          borderTopLeftRadius: 3, borderTopRightRadius: 3,
          fontSize: 11,
          color: i === 0 ? '#107c10' : '#555',
          fontWeight: i === 0 ? 700 : 400,
          cursor: 'default',
        }}>{t}</div>
      ))}
      <div style={{
        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: '#666', cursor: 'default', marginLeft: 2,
      }}>+</div>
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{
      background: '#217346',
      color: '#fff',
      height: 22,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      fontSize: 11,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      <span>就緒</span>
      <span style={{ marginLeft: 16, color: 'rgba(255,255,255,0.8)' }}>|</span>
      <span style={{ marginLeft: 16 }}>平均: 1,234</span>
      <span style={{ marginLeft: 10, color: 'rgba(255,255,255,0.6)' }}>|</span>
      <span style={{ marginLeft: 10 }}>個數: 48</span>
      <span style={{ marginLeft: 10, color: 'rgba(255,255,255,0.6)' }}>|</span>
      <span style={{ marginLeft: 10 }}>加總: 59,232</span>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, opacity: 0.8 }}>□ □ □</span>
        <span>100%</span>
        <span style={{ opacity: 0.7 }}>—</span>
        <div style={{
          width: 80, height: 10, background: 'rgba(255,255,255,0.3)',
          borderRadius: 4, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ width: '50%', height: '100%', background: 'rgba(255,255,255,0.7)', borderRadius: 4 }} />
        </div>
        <span style={{ opacity: 0.7 }}>+</span>
      </div>
    </div>
  );
}

// --- Main export ----------------------------------------------------------
export default function BossKey() {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Microsoft JhengHei", "Calibri", "Segoe UI", sans-serif',
      fontSize: 12,
      background: '#fff',
      userSelect: 'none',
    }}>
      <TitleBar />
      <MenuBar />
      <Toolbar />
      <FormulaBar />
      <SheetGrid />
      <SheetTabs />
      <StatusBar />
    </div>
  );
}
