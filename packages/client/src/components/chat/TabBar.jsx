// 4 種 channel 分頁列：大廳 / 公告 / 房間（在房內才出現）/ DM*N。
// 各分頁獨立顯示 mention 紅點（mentionFlags by channel）。
// DM tab 額外有未讀紅點與關閉按鈕。

import { tabStyle } from './util.js';

function MentionDot() {
  return (
    <span style={{
      background: 'var(--accent-danger)', color: 'var(--bg-paper)',
      fontSize: 9, padding: '0 4px', marginLeft: 4, fontWeight: 700,
    }}>!</span>
  );
}

export default function TabBar({
  activeChannel, activePeerId,
  hasRoom, roomLabel,
  dmTabs,
  onlineCount,
  mentionFlags = { public: false, announce: false, room: false, dm: false },
  onSelect, onCloseDm,
}) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', flexShrink: 0,
      borderBottom: '1px solid var(--line-soft)',
      background: 'var(--bg-input)',
    }}>
      <button
        onClick={() => onSelect('public')}
        style={tabStyle(activeChannel === 'public')}
      >
        大廳 · {onlineCount}
        {mentionFlags.public && <MentionDot />}
      </button>
      <button
        onClick={() => onSelect('announce')}
        style={tabStyle(activeChannel === 'announce')}
      >
        公告
        {mentionFlags.announce && <MentionDot />}
      </button>
      {hasRoom && (
        <button
          onClick={() => onSelect('room')}
          style={tabStyle(activeChannel === 'room')}
        >
          {roomLabel ?? '房間'}
          {mentionFlags.room && <MentionDot />}
        </button>
      )}
      {dmTabs.map((t) => (
        <span key={t.peer.id} style={{ display: 'flex', alignItems: 'stretch' }}>
          <button
            onClick={() => onSelect('dm', t.peer.id)}
            style={tabStyle(activeChannel === 'dm' && activePeerId === t.peer.id)}
          >
            @{t.peer.displayName || t.peer.id.slice(0, 4)}
            {t.unread > 0 && (
              <span style={{
                background: 'var(--accent-danger)', color: 'var(--bg-paper)',
                fontSize: 9, padding: '0 4px', marginLeft: 4, fontWeight: 700,
              }}>{t.unread}</span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCloseDm(t.peer.id); }}
            title="關閉"
            style={{
              background: 'transparent', border: 'none',
              borderRight: '1px solid var(--line-soft)',
              color: 'var(--ink-muted)',
              fontSize: 9, padding: '0 4px', cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >×</button>
        </span>
      ))}
    </div>
  );
}
