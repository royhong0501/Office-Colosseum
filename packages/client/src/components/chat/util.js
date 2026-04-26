// ChatPanel 共用 helper：時間格式 / 錯誤碼對映 / tab 樣式。
// 抽出來避免主檔重複；任何 chat/* 元件都可以 import。

import { CHAT_CONTENT_MAX } from '@office-colosseum/shared';

export function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function chatErrorText(code) {
  switch (code) {
    case 'chat_rate_limited': return '太快了，等一下再說';
    case 'chat_too_long': return `訊息超過 ${CHAT_CONTENT_MAX} 字`;
    case 'chat_empty': return '訊息不能空白';
    case 'chat_recipient_invalid': return '對方帳號不存在或已停用';
    case 'chat_recipient_self': return '不能傳給自己';
    default: return code ?? '送出失敗';
  }
}

export function tabStyle(active) {
  return {
    padding: '4px 8px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    background: active ? 'var(--bg-paper)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink-soft)',
    border: 'none',
    borderRight: '1px solid var(--line-soft)',
    borderBottom: active ? '1px solid var(--bg-paper)' : '1px solid var(--line-soft)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
