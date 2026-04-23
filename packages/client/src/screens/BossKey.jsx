import { useState } from 'react';
import SheetWindow from '../components/SheetWindow.jsx';

const HEADERS = ['項目', 'Q1', 'Q2', 'Q3', 'Q4', '總計', 'YoY%', '去年', '預算', '差異', '備註', '狀態', '負責人', '更新日'];
const COL_WIDTHS = [88, 62, 62, 62, 62, 68, 46, 62, 62, 58, 80, 50, 54, 68];

const REVENUE_ROWS = [
  { label: '營收',     q: [12345, 11890, 13210, 14320], prev: [11200, 10800, 11900, 13100], budget: [12000, 12000, 13000, 14000], note: '季節性成長', status: '正常', owner: '王大明' },
  { label: '金流',     q: [ 9820,  9750, 10450, 11280], prev: [ 8900,  8600,  9500, 10400], budget: [ 9800,  9800, 10500, 11200], note: '現金回收',   status: '良好', owner: '林淑芬' },
  { label: '應收',     q: [ 2525,  2140,  2760,  3040], prev: [ 2300,  2200,  2400,  2700], budget: [ 2200,  2200,  2500,  2800], note: '回款天數延長', status: '警示', owner: '趙志偉' },
];

const COST_ROWS = [
  { label: '成本',     q: [ 7890,  7540,  8100,  8760], prev: [ 7100,  6900,  7500,  8200], budget: [ 7500,  7500,  8000,  8500], note: '原料漲價',   status: '警示', owner: '李小華' },
  { label: '人事',     q: [ 3100,  3100,  3200,  3250], prev: [ 2800,  2850,  2900,  2950], budget: [ 3000,  3000,  3100,  3200], note: '加薪',       status: '正常', owner: '吳秋月' },
  { label: '原物料',   q: [ 2620,  2490,  2780,  2980], prev: [ 2400,  2300,  2500,  2700], budget: [ 2500,  2500,  2700,  2900], note: '鋁價上漲',   status: '警示', owner: '陳建國' },
];

const GROSS_ROWS = [
  { label: '毛利',     q: [ 4455,  4350,  5110,  5560], prev: [ 4100,  3900,  4400,  4900], budget: [ 4500,  4500,  5000,  5500], note: '',           status: '正常', owner: '王大明' },
  { label: '毛利率',   q: [   36,    37,    39,    39], prev: [   37,    36,    37,    37], budget: [   38,    38,    38,    39], note: '', status: '良好', owner: '王大明' },
];

const SUMMARY_ROWS = [
  { label: '營收',     q: [12345, 11890, 13210, 14320], prev: [11200, 10800, 11900, 13100], budget: [12000, 12000, 13000, 14000], note: '',           status: '正常', owner: '王大明' },
  { label: '成本',     q: [ 7890,  7540,  8100,  8760], prev: [ 7100,  6900,  7500,  8200], budget: [ 7500,  7500,  8000,  8500], note: '',           status: '警示', owner: '李小華' },
  { label: '毛利',     q: [ 4455,  4350,  5110,  5560], prev: [ 4100,  3900,  4400,  4900], budget: [ 4500,  4500,  5000,  5500], note: '',           status: '正常', owner: '王大明' },
  { label: '營業費用', q: [ 1820,  1760,  1950,  2100], prev: [ 1700,  1680,  1800,  1950], budget: [ 1800,  1800,  1900,  2000], note: '',           status: '警示', owner: '張美玲' },
  { label: '研發',     q: [  890,   920,   980,  1050], prev: [  800,   850,   900,   980], budget: [  900,   900,  1000,  1050], note: 'AI投資',     status: '正常', owner: '陳建國' },
  { label: '行銷',     q: [  560,   480,   620,   780], prev: [  520,   450,   580,   720], budget: [  600,   500,   650,   800], note: '',           status: '正常', owner: '林淑芬' },
  { label: '折舊',     q: [  210,   210,   215,   220], prev: [  200,   200,   205,   210], budget: [  210,   210,   215,   220], note: '',           status: '正常', owner: '吳秋月' },
  { label: '利息',     q: [   88,    84,    91,    97], prev: [   90,    86,    92,    95], budget: [   90,    90,    90,    90], note: '',           status: '正常', owner: '趙志偉' },
  { label: '稅前淨利', q: [ 2635,  2590,  2863,  3460], prev: [ 2411,  2284,  2461,  2960], budget: [ 2700,  2620,  2875,  3360], note: '',           status: '良好', owner: '王大明' },
  { label: '所得稅',   q: [  527,   518,   572,   692], prev: [  482,   457,   492,   592], budget: [  540,   524,   575,   672], note: '稅率20%',   status: '正常', owner: '林淑芬' },
  { label: '稅後淨利', q: [ 2108,  2072,  2291,  2768], prev: [ 1929,  1827,  1969,  2368], budget: [ 2160,  2096,  2300,  2688], note: '超越預算',   status: '良好', owner: '王大明' },
];

const TABS = [
  { id: 'revenue', label: 'Q1 營收', rows: REVENUE_ROWS },
  { id: 'cost',    label: 'Q2 成本', rows: COST_ROWS },
  { id: 'gross',   label: 'Q3 毛利', rows: GROSS_ROWS },
  { id: 'summary', label: '彙總',    rows: SUMMARY_ROWS },
];

function calcRow(r) {
  const total = r.q.reduce((a, b) => a + b, 0);
  const prevTotal = r.prev.reduce((a, b) => a + b, 0);
  const budget = r.budget.reduce((a, b) => a + b, 0);
  const yoy = prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : '—';
  const diff = total - budget;
  return { ...r, total, prevTotal, yoy, budget, diff };
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);
const NUM_ROWS = 30;
const SELECTED_ROW = 3;

function SheetGrid({ data }) {
  const HEADER_COL_W = 28;
  const ROW_H = 20;

  return (
    <div style={{
      flex: 1, overflow: 'auto', background: 'var(--bg-input)',
      position: 'relative',
    }}>
      <table style={{
        borderCollapse: 'collapse', tableLayout: 'fixed',
        minWidth: COL_WIDTHS.reduce((a, b) => a + b, HEADER_COL_W),
        fontFamily: 'var(--font-mono)',
      }}>
        <thead>
          <tr style={{ height: ROW_H }}>
            <th style={{
              width: HEADER_COL_W, minWidth: HEADER_COL_W,
              background: 'var(--bg-cell-header)',
              border: '1px solid var(--line-soft)',
              fontSize: 10,
              position: 'sticky', top: 0, left: 0, zIndex: 3,
            }} />
            {'ABCDEFGHIJKLMN'.split('').map((c, ci) => (
              <th key={c} style={{
                width: COL_WIDTHS[ci], minWidth: COL_WIDTHS[ci],
                background: 'var(--bg-cell-header)',
                border: '1px solid var(--line-soft)',
                fontSize: 11, fontWeight: 400, color: 'var(--ink-soft)',
                textAlign: 'center',
                position: 'sticky', top: 0, zIndex: 2,
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 欄位標題列 */}
          <tr style={{ height: ROW_H }}>
            <td style={{
              background: 'var(--bg-cell-header)',
              border: '1px solid var(--line-soft)',
              fontSize: 10, textAlign: 'center', color: 'var(--ink-muted)',
              position: 'sticky', left: 0, zIndex: 1,
            }}>1</td>
            {HEADERS.map((h, ci) => (
              <td key={ci} style={{
                background: 'var(--bg-paper-alt)',
                border: '1px solid var(--line-soft)',
                padding: '2px 6px', fontSize: 11, fontWeight: 700,
                color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden',
                width: COL_WIDTHS[ci],
              }}>{h}</td>
            ))}
          </tr>

          {data.map((row, ri) => {
            const rn = ri + 2;
            const isSelected = ri === SELECTED_ROW;
            return (
              <tr key={ri} style={{ height: ROW_H }}>
                <td style={{
                  background: isSelected ? 'var(--bg-paper-alt)' : 'var(--bg-cell-header)',
                  border: '1px solid var(--line-soft)',
                  fontSize: 10, textAlign: 'center', color: 'var(--ink-muted)',
                  position: 'sticky', left: 0, zIndex: 1,
                }}>{rn}</td>
                <td style={cellStyle(isSelected, 0, 0, ri, { fontWeight: 600, color: 'var(--ink)' })}>
                  {row.label}
                </td>
                {row.q.map((v, qi) => (
                  <td key={qi} style={cellStyle(isSelected, qi + 1, 0, ri, { textAlign: 'right' })}>
                    {fmt(v)}
                  </td>
                ))}
                <td style={cellStyle(isSelected, 5, 0, ri, {
                  textAlign: 'right', fontWeight: 700,
                  background: isSelected ? 'var(--bg-paper-alt)' : 'var(--bg-paper-alt)',
                })}>
                  {fmt(row.total)}
                </td>
                <td style={cellStyle(isSelected, 6, 0, ri, {
                  textAlign: 'right',
                  color: parseFloat(row.yoy) >= 0 ? 'var(--accent)' : 'var(--accent-danger)',
                })}>
                  {row.yoy !== '—' ? `${row.yoy}%` : '—'}
                </td>
                <td style={cellStyle(isSelected, 7, 0, ri, { textAlign: 'right' })}>{fmt(row.prevTotal)}</td>
                <td style={cellStyle(isSelected, 8, 0, ri, { textAlign: 'right' })}>{fmt(row.budget)}</td>
                <td style={cellStyle(isSelected, 9, 0, ri, {
                  textAlign: 'right',
                  color: row.diff >= 0 ? 'var(--accent)' : 'var(--accent-danger)',
                })}>
                  {row.diff >= 0 ? '+' : ''}{fmt(row.diff)}
                </td>
                <td style={cellStyle(isSelected, 10, 0, ri, { fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-ui)' })}>
                  {row.note}
                </td>
                <td style={cellStyle(isSelected, 11, 0, ri, {
                  textAlign: 'center', fontSize: 10,
                  color: row.status === '良好' ? 'var(--accent)' : row.status === '警示' ? 'var(--accent-danger)' : 'var(--ink)',
                  fontWeight: row.status !== '正常' ? 700 : 400,
                })}>
                  {row.status}
                </td>
                <td style={cellStyle(isSelected, 12, 0, ri, { fontFamily: 'var(--font-ui)', fontSize: 11 })}>
                  {row.owner}
                </td>
                <td style={cellStyle(isSelected, 13, 0, ri, { fontSize: 10, color: 'var(--ink-muted)' })}>
                  {`2026/0${(ri % 3) + 1}/1${ri}`}
                </td>
              </tr>
            );
          })}
          {/* 空白列撐版 */}
          {Array.from({ length: Math.max(0, NUM_ROWS - data.length - 1) }, (_, i) => (
            <tr key={`filler-${i}`} style={{ height: ROW_H }}>
              <td style={{
                background: 'var(--bg-cell-header)',
                border: '1px solid var(--line-soft)',
                fontSize: 10, textAlign: 'center', color: 'var(--ink-muted)',
                position: 'sticky', left: 0, zIndex: 1,
              }}>{data.length + i + 2}</td>
              {Array.from({ length: 14 }, (_, ci) => (
                <td key={ci} style={{
                  border: '1px solid var(--line-soft)',
                  padding: '1px 4px',
                  background: 'var(--bg-input)',
                }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellStyle(rowSelected, colIdx, selCol, rowIdx, extra = {}) {
  const isSelectedCell = rowIdx === SELECTED_ROW && colIdx === selCol;
  return {
    border: isSelectedCell
      ? '2px solid var(--accent)'
      : `1px solid ${rowSelected ? 'var(--line)' : 'var(--line-soft)'}`,
    padding: '2px 6px',
    fontSize: 11,
    background: rowSelected ? 'var(--bg-paper-alt)' : 'var(--bg-input)',
    color: 'var(--ink)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    ...extra,
  };
}

export default function BossKey() {
  const [tab, setTab] = useState('summary');
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const data = active.rows.map(calcRow);

  const totalAll = data.reduce((s, r) => s + r.total, 0);
  const avgAll = data.length ? Math.round(totalAll / data.length) : 0;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      <SheetWindow
        fileName="季度報表_final_v3.xlsx"
        cellRef="C12"
        formula="=SUMPRODUCT(Q1:Q4, REVENUE)"
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={active.id}
        onTabSelect={setTab}
        statusLeft="完成 — 自動儲存於 2026/04/23 14:32"
        statusRight={`平均: ${avgAll.toLocaleString()} | 個數: ${data.length} | 加總: ${totalAll.toLocaleString()}`}
        fullscreen
      >
        <SheetGrid data={data} />
      </SheetWindow>
    </div>
  );
}
