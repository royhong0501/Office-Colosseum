import React from 'react';
import StatusBarThemeSelect from './StatusBarThemeSelect.jsx';

// HiiiCalc 統一外殼——由上而下 7 層：
// TitleBar / MenuBar / Toolbar / FormulaBar / 內容 / TabBar / StatusBar
//
// 所有色彩一律走 CSS 變數（--bg-chrome / --ink / --line-soft ...），
// 禁用 emoji、border-radius、漸層；邊框固定 1px solid var(--line-soft)。

const MENU_ITEMS = [
  '檔案(F)', '編輯(E)', '檢視(V)', '插入(I)',
  '格式(O)', '資料(D)', '工具(T)', '競技場(C)', '說明(H)',
];

const TOOLBAR_ITEMS = [
  { label: '新增' },
  { label: '開啟' },
  { label: '儲存' },
  { sep: true },
  { label: 'B', style: { fontWeight: 700 } },
  { label: 'I', style: { fontStyle: 'italic' } },
  { label: 'U', style: { textDecoration: 'underline' } },
  { sep: true },
  { label: '←' },
  { label: '↑' },
  { label: '→' },
  { sep: true },
  { label: 'Σ' },
  { label: 'fx', style: { fontStyle: 'italic' } },
  { label: '⊞' },
];

function TitleBar({ fileName }) {
  const label = fileName ? `HiiiCalc — ${fileName}` : 'HiiiCalc';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 22, padding: '0 8px',
      background: 'var(--bg-chrome-dark)', color: 'var(--bg-paper)',
      fontFamily: 'var(--font-ui)', fontSize: 11,
      borderBottom: '1px solid var(--line)',
      userSelect: 'none',
    }}>
      <span style={{ letterSpacing: 0.4 }}>{label}</span>
      <span style={{ display: 'flex', gap: 10, fontSize: 11, opacity: 0.85 }}>
        <span>―</span>
        <span>□</span>
        <span>✕</span>
      </span>
    </div>
  );
}

function MenuBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      height: 22, padding: '0 6px',
      background: 'var(--bg-chrome)', color: 'var(--ink)',
      fontFamily: 'var(--font-ui)', fontSize: 12,
      borderBottom: '1px solid var(--line-soft)',
      userSelect: 'none',
    }}>
      {MENU_ITEMS.map((m) => (
        <span
          key={m}
          style={{
            padding: '3px 8px',
            color: 'var(--ink)',
          }}
        >
          {m}
        </span>
      ))}
    </div>
  );
}

function Toolbar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      height: 28, padding: '0 6px',
      background: 'var(--bg-paper-alt)',
      borderBottom: '1px solid var(--line-soft)',
      fontFamily: 'var(--font-ui)', fontSize: 12,
      userSelect: 'none',
    }}>
      {TOOLBAR_ITEMS.map((t, i) => t.sep ? (
        <div key={i} style={{ width: 1, height: 18, background: 'var(--line-soft)', margin: '0 4px' }} />
      ) : (
        <div
          key={i}
          style={{
            minWidth: 24, height: 22, padding: '0 6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-soft)',
            border: '1px solid transparent',
            ...(t.style ?? {}),
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

function FormulaBar({ cellRef, formula }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      height: 22,
      background: 'var(--bg-paper-alt)',
      borderBottom: '1px solid var(--line-soft)',
      fontFamily: 'var(--font-mono)', fontSize: 11,
    }}>
      <div style={{
        width: 96, padding: '0 8px',
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-input)',
        borderRight: '1px solid var(--line-soft)',
        color: 'var(--ink)',
      }}>
        {cellRef || 'A1'}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 10px',
        color: 'var(--ink-muted)', fontStyle: 'italic',
        borderRight: '1px solid var(--line-soft)',
      }}>fx</div>
      <div style={{
        flex: 1, padding: '0 10px',
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-input)',
        color: 'var(--ink-soft)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {formula || '=COLOSSEUM()'}
      </div>
    </div>
  );
}

function TabBar({ tabs, activeTab, onTabSelect }) {
  if (!tabs || tabs.length === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end',
      height: 22,
      background: 'var(--bg-chrome)',
      borderTop: '1px solid var(--line-soft)',
      fontFamily: 'var(--font-ui)', fontSize: 11,
      padding: '0 4px',
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--ink-muted)', fontSize: 10, marginRight: 6 }}>
        <span>◂</span>
        <span>▸</span>
        <span>⊕</span>
      </div>
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            onClick={() => onTabSelect && onTabSelect(tab.id)}
            style={{
              padding: '3px 14px',
              cursor: onTabSelect ? 'pointer' : 'default',
              background: active ? 'var(--bg-paper)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-soft)',
              borderLeft: '1px solid var(--line-soft)',
              borderRight: '1px solid var(--line-soft)',
              borderTop: active ? '2px solid var(--accent)' : '1px solid var(--line-soft)',
              marginRight: -1,
              fontWeight: active ? 600 : 400,
            }}
          >
            {tab.label}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
    </div>
  );
}

function StatusBar({ statusLeft, statusRight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 22, padding: '0 10px',
      background: 'var(--bg-chrome-dark)', color: 'var(--bg-paper)',
      fontFamily: 'var(--font-ui)', fontSize: 10,
      borderTop: '1px solid var(--line)',
    }}>
      <span style={{ opacity: 0.92 }}>
        {statusLeft || '就緒'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ opacity: 0.8 }}>{statusRight || ''}</span>
        <StatusBarThemeSelect />
      </div>
    </div>
  );
}

export default function SheetWindow({
  fileName,
  cellRef,
  formula,
  tabs,
  activeTab,
  onTabSelect,
  statusLeft,
  statusRight,
  children,
  fullscreen = false,
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: fullscreen ? '100vh' : '100%',
      width: '100%',
      background: 'var(--bg-paper)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--ink)',
    }}>
      <TitleBar fileName={fileName} />
      <MenuBar />
      <Toolbar />
      <FormulaBar cellRef={cellRef} formula={formula} />
      <div style={{
        flex: 1, minHeight: 0,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-paper)',
      }}>
        {children}
      </div>
      <TabBar tabs={tabs} activeTab={activeTab} onTabSelect={onTabSelect} />
      <StatusBar statusLeft={statusLeft} statusRight={statusRight} />
    </div>
  );
}
