import { excelColors } from '../theme.js';

const CONFIG = {
  connecting: { text: '連線中...', bg: excelColors.headerBg, color: excelColors.textLight },
  connected:  { text: null, bg: null, color: null },
  disconnected: { text: '已斷線 — 正在嘗試重連', bg: excelColors.redAccent, color: '#F5F0E8' },
  error:      { text: '連線失敗 — 請檢查 server 是否在執行', bg: excelColors.redAccent, color: '#F5F0E8' },
};

export default function ConnectionBanner({ status }) {
  const cfg = CONFIG[status] ?? CONFIG.connecting;
  if (!cfg.text) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: '4px 12px',
        fontSize: 11,
        fontFamily: '"Microsoft JhengHei","Noto Sans TC",sans-serif',
        background: cfg.bg,
        color: cfg.color,
        textAlign: 'center',
        borderBottom: `1px solid ${excelColors.cellBorder}`,
      }}
    >
      {cfg.text}
    </div>
  );
}
