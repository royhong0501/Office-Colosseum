const CONFIG = {
  connecting: { text: '連線中...', bg: 'var(--bg-cell-header)', color: 'var(--ink-soft)' },
  connected:  { text: null, bg: null, color: null },
  disconnected: { text: '已斷線 — 正在嘗試重連', bg: 'var(--accent-danger)', color: 'var(--bg-paper)' },
  error:      { text: '連線失敗 — 請檢查 server 是否在執行', bg: 'var(--accent-danger)', color: 'var(--bg-paper)' },
};

export default function ConnectionBanner({ status }) {
  const cfg = CONFIG[status] ?? CONFIG.connecting;
  if (!cfg.text) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 10000,
        padding: '4px 12px',
        fontSize: 11,
        fontFamily: 'var(--font-ui)',
        background: cfg.bg,
        color: cfg.color,
        textAlign: 'center',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {cfg.text}
    </div>
  );
}
