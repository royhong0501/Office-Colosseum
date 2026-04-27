// chat dock 左側全玩家清單。每位使用者一列：彩色狀態圓點 + displayName。
// 點任一列開 DM tab（自己跳過）。
//
// 顏色：
//   ● 綠（#4f8d4f）= 在線（online）
//   ● 藍（var(--accent-link) / #3a5a7a）= 遊戲中（in_match）
//   ● 紅（var(--accent-danger)）= 離線（offline）

const STATUS_INFO = {
  online:   { color: '#4f8d4f',           label: '在線' },
  in_match: { color: 'var(--accent-link)', label: '遊戲中' },
  offline:  { color: 'var(--accent-danger)', label: '離線' },
};

export default function UserSidebar({ allUsers, online, selfId, onOpenDm }) {
  // 線上 status 索引（Map 用 userId → status）
  const statusByUserId = new Map();
  for (const o of online) statusByUserId.set(o.userId, o.status ?? 'online');

  // 全玩家清單排除自己；上線的優先（排序：online → in_match → offline，內各自照 displayName）
  const others = allUsers
    .filter((u) => u.id !== selfId)
    .map((u) => ({
      ...u,
      status: statusByUserId.get(u.id) ?? 'offline',
    }))
    .sort((a, b) => {
      const order = { online: 0, in_match: 1, offline: 2 };
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a.displayName ?? '').localeCompare(b.displayName ?? '');
    });

  return (
    <div style={{
      width: 130,
      flexShrink: 0,
      borderRight: '1px solid var(--line-soft)',
      background: 'var(--bg-paper-alt)',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '4px 8px',
        background: 'var(--bg-cell-header)',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 9, color: 'var(--ink-muted)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 0.8,
      }}>
        玩家 · {others.length}
      </div>
      {others.length === 0 ? (
        <div style={{
          padding: '12px 8px',
          fontSize: 10, color: 'var(--ink-muted)',
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          #N/A — 尚無其他玩家
        </div>
      ) : others.map((u) => {
        const info = STATUS_INFO[u.status] ?? STATUS_INFO.offline;
        return (
          <button
            key={u.id}
            onClick={() => onOpenDm(u.id, u.displayName)}
            title={`${u.displayName}（${info.label}）— 點擊私訊`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--line-soft)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)', fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
              opacity: u.status === 'offline' ? 0.55 : 1,
            }}
          >
            <span style={{ color: info.color, fontSize: 11, lineHeight: 1, flexShrink: 0 }}>●</span>
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>{u.displayName ?? u.username}</span>
          </button>
        );
      })}
    </div>
  );
}
