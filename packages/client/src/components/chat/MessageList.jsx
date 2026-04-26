// 訊息列表。messages 變動時自動 scroll 到底；空陣列顯示 emptyHint。

import { useEffect, useRef } from 'react';
import { fmtTime } from './util.js';

export default function MessageList({ messages, selfId, emptyHint }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  if (!messages.length) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 11,
        padding: 16, textAlign: 'center',
      }}>
        {emptyHint}
      </div>
    );
  }

  return (
    <div ref={ref} style={{
      flex: 1, overflowY: 'auto', minHeight: 0,
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {messages.map((m) => {
        const mine = m.senderId === selfId;
        return (
          <div key={m.id} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: mine ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
              marginBottom: 1,
            }}>
              {mine ? '你' : (m.senderName || '?')} · {fmtTime(m.createdAt)}
            </div>
            <div style={{
              maxWidth: '90%',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              padding: '4px 8px',
              border: '1px solid var(--line-soft)',
              background: mine ? 'var(--bg-paper-alt)' : 'var(--bg-input)',
              color: 'var(--ink)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
