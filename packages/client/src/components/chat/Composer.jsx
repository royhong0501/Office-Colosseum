// 輸入列。Enter 送出、Shift+Enter 換行；超過 CHAT_CONTENT_MAX 字計數變紅。

import { useState } from 'react';
import { CHAT_CONTENT_MAX } from '@office-colosseum/shared';

export default function Composer({ onSend, disabled = false }) {
  const [text, setText] = useState('');
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const t = text.trim();
      if (!t) return;
      onSend(t);
      setText('');
    }
  };
  const tooLong = text.length > CHAT_CONTENT_MAX;
  return (
    <div style={{
      borderTop: '1px solid var(--line-soft)',
      padding: '6px 8px',
      background: 'var(--bg-paper)',
    }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={disabled ? '請選擇對象 ...' : '說點什麼... (Enter 送出，Shift+Enter 換行)'}
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
        <span>{disabled ? '' : 'Enter ↵'}</span>
        <span>{text.length}/{CHAT_CONTENT_MAX}</span>
      </div>
    </div>
  );
}
