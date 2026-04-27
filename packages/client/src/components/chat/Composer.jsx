// 輸入列。Enter 送出、Shift+Enter 換行；超過 CHAT_CONTENT_MAX 字計數變紅。
// replyTarget 帶值時上方顯示引用條（含 X 取消），onSend 會收到 replyToId。

import { useState } from 'react';
import { CHAT_CONTENT_MAX } from '@office-colosseum/shared';

export default function Composer({ onSend, disabled = false, placeholder, replyTarget, onCancelReply }) {
  const [text, setText] = useState('');
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const t = text.trim();
      if (!t) return;
      onSend(t, replyTarget?.id ?? null);
      setText('');
    }
  };
  const tooLong = text.length > CHAT_CONTENT_MAX;
  return (
    <div style={{
      borderTop: '1px solid var(--line-soft)',
      background: 'var(--bg-paper)',
    }}>
      {replyTarget && (
        <div style={{
          padding: '4px 8px',
          background: 'var(--bg-paper-alt)',
          borderBottom: '1px solid var(--line-soft)',
          fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--ink-soft)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--accent-link)' }}>↳ 回覆</span>
          <span style={{ color: 'var(--accent-link)' }}>@{replyTarget.senderName ?? '?'}</span>
          <span style={{
            flex: 1, color: 'var(--ink-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            : {replyTarget.content}
          </span>
          <button
            onClick={onCancelReply}
            title="取消回覆"
            style={{
              background: 'transparent', border: '1px solid var(--line-soft)',
              color: 'var(--ink-muted)', fontSize: 10,
              padding: '0 5px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
            }}
          >×</button>
        </div>
      )}
      <div style={{ padding: '6px 8px' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder ?? (disabled ? '請選擇對象 ...' : '說點什麼... (Enter 送出，Shift+Enter 換行)')}
          disabled={disabled}
          rows={2}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--line-soft)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            padding: '4px 6px',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: tooLong ? 'var(--accent-danger)' : 'var(--ink-muted)',
          marginTop: 2,
        }}>
          <span>{disabled ? '' : 'Enter ↵ · Shift+Enter 換行'}</span>
          <span>{text.length}/{CHAT_CONTENT_MAX}</span>
        </div>
      </div>
    </div>
  );
}
