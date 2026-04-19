import React from 'react';
import { excelColors } from '../theme.js';

// ============ MENU BAR ============
export function ExcelMenuBar({ currentSheet, onNavigate }) {
  const [activeMenu, setActiveMenu] = React.useState(null);
  const menus = ['檔案(F)', '編輯(E)', '檢視(V)', '插入(I)', '格式(O)', '資料(D)', '工具(T)', '競技場(C)', '說明(H)'];

  const menuItems = {
    '競技場(C)': [
      { label: '📊 角色總覽', action: () => onNavigate('select') },
      { label: '⚔ 開始戰鬥', action: () => onNavigate('battle') },
      { label: '📈 戰績報表', action: () => onNavigate('results') },
    ],
    '檔案(F)': [
      { label: '新增對戰...', action: () => onNavigate('select') },
      { label: '開啟記錄...', action: () => {} },
      { label: '儲存', action: () => {} },
      { label: '另存新檔...', action: () => {} },
    ],
  };

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', height: 28,
      background: excelColors.menuBg, borderBottom: `1px solid ${excelColors.menuBorder}`,
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      fontSize: 12, color: excelColors.text, userSelect: 'none', position: 'relative', zIndex: 100,
      padding: '0 4px',
    }
  },
    React.createElement('span', { style: { fontWeight: 'bold', marginRight: 12, fontSize: 13, color: excelColors.accent, letterSpacing: 1 } }, '📋 HiiiCalc'),
    menus.map(m => React.createElement('div', {
      key: m,
      style: {
        padding: '4px 8px', cursor: 'pointer', position: 'relative',
        background: activeMenu === m ? excelColors.selectedCell : 'transparent',
        borderRadius: 2,
      },
      onMouseEnter: () => { if (activeMenu) setActiveMenu(m); },
      onClick: () => setActiveMenu(activeMenu === m ? null : m),
    },
      m,
      activeMenu === m && menuItems[m] && React.createElement('div', {
        style: {
          position: 'absolute', top: '100%', left: 0, background: excelColors.cellBg,
          border: `1px solid ${excelColors.cellBorder}`, borderRadius: 3,
          boxShadow: '2px 2px 8px rgba(0,0,0,0.12)', minWidth: 160, zIndex: 200,
          padding: '4px 0',
        }
      }, menuItems[m].map((item, i) => React.createElement('div', {
        key: i,
        style: { padding: '6px 16px', cursor: 'pointer' },
        onMouseEnter: (e) => e.target.style.background = excelColors.selectedCell,
        onMouseLeave: (e) => e.target.style.background = 'transparent',
        onClick: (e) => { e.stopPropagation(); item.action(); setActiveMenu(null); },
      }, item.label)))
    )),
    activeMenu && React.createElement('div', {
      style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 },
      onClick: () => setActiveMenu(null),
    })
  );
}

// ============ TOOLBAR ============
export function ExcelToolbar({ cellRef, formulaText }) {
  const tools = ['✂', '📋', '🖌', '|', 'B', 'I', 'U', '|', '⬅', '⬆', '➡', '|', '🔤', '📊', '🔢'];
  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      borderBottom: `1px solid ${excelColors.cellBorder}`,
      background: excelColors.toolbarBg,
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif', fontSize: 12,
    }
  },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', padding: '2px 4px', gap: 2 }
    },
      tools.map((t, i) => t === '|'
        ? React.createElement('div', { key: i, style: { width: 1, height: 18, background: excelColors.cellBorder, margin: '0 3px' } })
        : React.createElement('div', {
            key: i,
            style: {
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 2, fontSize: t.length === 1 ? 12 : 14,
              fontWeight: ['B', 'I', 'U'].includes(t) ? 'bold' : 'normal',
              fontStyle: t === 'I' ? 'italic' : 'normal',
              textDecoration: t === 'U' ? 'underline' : 'none',
            },
            onMouseEnter: (e) => e.target.style.background = excelColors.selectedCell,
            onMouseLeave: (e) => e.target.style.background = 'transparent',
          }, t)
      )
    ),
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', padding: '2px 4px', borderTop: `1px solid ${excelColors.cellBorder}` }
    },
      React.createElement('div', {
        style: {
          width: 60, padding: '2px 6px', background: excelColors.formulaBg,
          border: `1px solid ${excelColors.cellBorder}`, marginRight: 4,
          textAlign: 'center', fontFamily: 'Consolas, monospace', fontSize: 11,
        }
      }, cellRef || 'A1'),
      React.createElement('div', { style: { margin: '0 4px', color: excelColors.textLight, fontStyle: 'italic' } }, 'fx'),
      React.createElement('div', {
        style: {
          flex: 1, padding: '2px 6px', background: excelColors.formulaBg,
          border: `1px solid ${excelColors.cellBorder}`,
          fontFamily: 'Consolas, monospace', fontSize: 11,
          whiteSpace: 'nowrap', overflow: 'hidden',
        }
      }, formulaText || '=COLOSSEUM.BATTLE()')
    )
  );
}

// ============ SHEET TABS ============
export function ExcelSheetTabs({ sheets, active, onSelect }) {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'flex-end', height: 28,
      background: excelColors.statusBar, borderTop: `1px solid ${excelColors.cellBorder}`,
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif', fontSize: 11,
      padding: '0 4px', gap: 2,
    }
  },
    React.createElement('div', { style: { display: 'flex', gap: 1, marginRight: 8 } },
      ['◀', '▶', '⊕'].map((b, i) => React.createElement('div', {
        key: i,
        style: { width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: excelColors.textLight, fontSize: 10 },
      }, b))
    ),
    sheets.map(s => React.createElement('div', {
      key: s.id,
      style: {
        padding: '4px 16px', cursor: 'pointer',
        background: active === s.id ? excelColors.sheetTabActive : excelColors.sheetTab,
        border: `1px solid ${excelColors.cellBorder}`,
        borderBottom: active === s.id ? `2px solid ${excelColors.accent}` : '1px solid transparent',
        borderTopLeftRadius: 3, borderTopRightRadius: 3,
        fontWeight: active === s.id ? 600 : 400,
        color: active === s.id ? excelColors.accent : excelColors.textLight,
      },
      onClick: () => onSelect(s.id),
    }, s.label)),
    React.createElement('div', { style: { flex: 1 } }),
    React.createElement('span', { style: { fontSize: 10, color: excelColors.textLight, marginRight: 8 } }, '就緒'),
  );
}

// ============ STATUS BAR ============
export function ExcelStatusBar({ stats }) {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 22, background: excelColors.accent, color: '#F5F0E8',
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif', fontSize: 10,
      padding: '0 12px',
    }
  },
    React.createElement('span', null, stats || '🏛 HiiiColosseum v1.0 — 競技場管理系統'),
    React.createElement('span', null, '平均: -- | 計數: -- | 加總: --'),
  );
}
