import { useState } from 'react';
import { excelColors } from '../theme.js';
import {
  ExcelMenuBar,
  ExcelToolbar,
  ExcelSheetTabs,
  ExcelStatusBar,
} from '../components/ExcelChrome.jsx';

const RECENT_FILES = [
  { name: 'Q1_營收報表_v3.xlsx', date: '2026/04/18', size: '2.4 MB' },
  { name: '人事成本分析_2026Q1.xlsx', date: '2026/04/15', size: '1.8 MB' },
  { name: '庫存盤點表_final.xlsx', date: '2026/04/10', size: '956 KB' },
  { name: '預算提案草稿.xlsx', date: '2026/04/07', size: '1.1 MB' },
];

export default function MainMenu({ onStart, onOpenCharacters, onOpenHistory }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  // ExcelMenuBar expects onNavigate — wire it to a no-op since routing is prop-driven
  const noNav = () => {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif' }}>
      <ExcelMenuBar currentSheet="MainMenu" onNavigate={noNav} />
      <ExcelToolbar cellRef="A1" formulaText='=COLOSSEUM.LOBBY()' />

      {/* Main body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: excelColors.cellBg }}>
        {/* Left panel */}
        <div style={{
          width: 280, background: excelColors.accent, color: '#F5F0E8',
          padding: '40px 24px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, letterSpacing: 2 }}>
            HiiiCalc
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 40 }}>
            v3.2.1 — 試算表管理工具
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, opacity: 0.8 }}>
            快速開始
          </div>

          {[
            { icon: '\u26D4', label: '連線對戰 / Play Online', desc: '加入多人競技場', isMain: true, onClick: onStart },
            { icon: '\uD83D\uDCCA', label: '角色資料庫', desc: '查看所有角色能力值', isMain: false, onClick: onOpenCharacters },
            { icon: '\uD83D\uDCC8', label: '戰績報表', desc: '歷史對戰數據分析', isMain: false, onClick: onOpenHistory },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                padding: '12px 16px', marginBottom: 8, borderRadius: 4, cursor: 'pointer',
                background: hoveredCell === `menu${i}`
                  ? (item.isMain ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)')
                  : (item.isMain ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'),
                border: item.isMain ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                transition: 'background 0.2s',
              }}
              onMouseEnter={() => setHoveredCell(`menu${i}`)}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={item.onClick}
            >
              <div style={{ fontSize: 14, fontWeight: item.isMain ? 700 : 600 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{item.desc}</div>
            </div>
          ))}

          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 9, opacity: 0.4 }}>© 2026 Hiii Corp. 版權所有</div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: excelColors.text, marginBottom: 24 }}>
            最近開啟的檔案
          </div>

          {/* File table */}
          <div style={{ border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 80px',
              background: excelColors.headerBg, padding: '8px 12px',
              fontSize: 11, fontWeight: 600, color: excelColors.textLight,
              borderBottom: `1px solid ${excelColors.cellBorder}`,
            }}>
              <span>名稱</span>
              <span>修改日期</span>
              <span>大小</span>
            </div>

            {RECENT_FILES.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 80px',
                  padding: '10px 12px', fontSize: 12, color: excelColors.text,
                  borderBottom: i < RECENT_FILES.length - 1 ? `1px solid ${excelColors.cellBorder}` : 'none',
                  cursor: 'pointer',
                  background: hoveredCell === `file${i}` ? excelColors.selectedCell : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={() => setHoveredCell(`file${i}`)}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={onStart}
              >
                <span>{f.name}</span>
                <span style={{ color: excelColors.textLight }}>{f.date}</span>
                <span style={{ color: excelColors.textLight }}>{f.size}</span>
              </div>
            ))}
          </div>

          {/* Stats panel */}
          <div style={{
            marginTop: 40, padding: 20, background: excelColors.headerBg,
            borderRadius: 6, border: `1px solid ${excelColors.cellBorder}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: excelColors.accent, marginBottom: 12 }}>
              今日競技場概況
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: excelColors.textLight }}>
              {[
                '貓方勝率: 48.2%',
                '犬方勝率: 51.8%',
                '今日對戰: 1,247 場',
                'MVP: 哈士奇',
              ].map((s, i) => (
                <div key={i} style={{
                  padding: '8px 12px', background: excelColors.cellBg,
                  borderRadius: 4, border: `1px solid ${excelColors.cellBorder}`,
                }}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ExcelSheetTabs
        sheets={[
          { id: 'menu', label: '主選單' },
          { id: 'lobby', label: '連線大廳' },
        ]}
        active="menu"
        onSelect={(id) => { if (id === 'lobby') onStart(); }}
      />
      <ExcelStatusBar stats="就緒 — 點選「連線對戰」進入多人競技場" />
    </div>
  );
}
