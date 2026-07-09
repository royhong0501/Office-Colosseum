// 對戰結束跳窗：停在戰鬥畫面上（讓化身動作播完），詢問再來一場 / 回到大廳。
// 試算表風格浮層。

export default function MatchEndModal({ title, subtitle, onRematch, onExit }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(40, 30, 18, 0.22)',   // 淡一點，讓後面化身持續歡呼/喪氣看得見
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 320, maxWidth: '86%',
        background: 'var(--bg-paper)',
        border: '1px solid var(--line)',
        boxShadow: '0 8px 26px rgba(0,0,0,0.28)',
        fontFamily: 'var(--font-ui)',
      }}>
        {/* 標題列（偽視窗） */}
        <div style={{
          padding: '7px 10px', background: 'var(--bg-chrome)',
          borderBottom: '1px solid var(--line)', fontSize: 12,
        }}>
          <span className="fn">=MATCH.END</span>()
        </div>
        {/* 內容 */}
        <div style={{ padding: '22px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
              {subtitle}
            </div>
          )}
        </div>
        {/* 按鈕 */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 14px',
          borderTop: '1px solid var(--line)', background: 'var(--bg-paper-alt)',
        }}>
          <button className="btn-cell primary" onClick={onRematch} style={{ flex: 1, padding: '8px 0' }}>
            再來一場
          </button>
          <button className="btn-cell" onClick={onExit} style={{ flex: 1, padding: '8px 0' }}>
            回到大廳
          </button>
        </div>
      </div>
    </div>
  );
}
