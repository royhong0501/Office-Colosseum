// 大廳 + DM 分頁列。每個 DM tab 有未讀紅點與關閉按鈕。

import { tabStyle } from './util.js';

export default function TabBar({ activeTab, dmTabs, onlineCount, onSelect, onClose }) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', flexShrink: 0,
      borderBottom: '1px solid var(--line-soft)',
      background: 'var(--bg-input)',
    }}>
      <button
        onClick={() => onSelect('public')}
        style={tabStyle(activeTab === 'public')}
      >
        大廳 · {onlineCount}
      </button>
      {dmTabs.map((t) => (
        <span key={t.peer.id} style={{ display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => onSelect(t.peer.id)}
            style={tabStyle(activeTab === t.peer.id)}
          >
            @{t.peer.displayName || t.peer.id.slice(0, 4)}
            {t.unread > 0 && (
              <span style={{
                background: 'var(--accent-danger)',
                color: 'var(--bg-paper)',
                fontSize: 9,
                padding: '0 4px',
                marginLeft: 4,
                fontWeight: 700,
              }}>
                {t.unread}
              </span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(t.peer.id); }}
            title="關閉"
            style={{
              background: 'transparent',
              border: 'none',
              borderRight: '1px solid var(--line-soft)',
              color: 'var(--ink-muted)',
              fontSize: 9,
              padding: '0 4px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
