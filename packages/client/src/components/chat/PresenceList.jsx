// 公開頻道上方的線上玩家清單（@displayName 按鈕，點下開 DM）。

export default function PresenceList({ online, selfId, onOpenDm }) {
  const others = online.filter((o) => o.userId !== selfId);
  if (others.length === 0) {
    return (
      <div style={{
        padding: '6px 8px', fontSize: 10, color: 'var(--ink-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        目前沒有其他人在線
      </div>
    );
  }
  return (
    <div style={{
      borderBottom: '1px solid var(--line-soft)',
      background: 'var(--bg-paper-alt)',
      padding: '4px 8px',
      display: 'flex', flexWrap: 'wrap', gap: 4,
    }}>
      {others.map((o) => (
        <button
          key={o.userId}
          onClick={() => onOpenDm(o.userId, o.displayName)}
          title={`私訊 ${o.displayName}`}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            padding: '2px 6px',
            background: 'var(--bg-input)',
            color: 'var(--ink)',
            border: '1px solid var(--line-soft)',
            cursor: 'pointer',
          }}
        >
          @{o.displayName}
        </button>
      ))}
    </div>
  );
}
