// 訊息列表。messages 變動時自動 scroll 到底；空陣列顯示 emptyHint。
// 渲染：mention 高亮（@username 變色）+ reply quote 條 + 已讀 N（自己訊息底部小字）。
//
// 自己訊息 align right、bg=accent；他人 align left、bg=bg-input。
// hover 他人訊息時右邊出現 ↩ 按鈕，點下 → onSelectReply(msg)，由父層 setReplyTarget。

import { useEffect, useRef, useState } from 'react';
import { fmtTime } from './util.js';

const MENTION_RE = /(@[a-zA-Z0-9_.-]+)/g;

function renderContentWithMentions(content) {
  // 簡單 split + 給 @username token 加 highlight span
  const parts = content.split(MENTION_RE);
  return parts.map((p, i) => {
    if (MENTION_RE.test(p)) {
      MENTION_RE.lastIndex = 0;   // reset for next match
      return (
        <span key={i} style={{
          color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)',
        }}>{p}</span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function ReplyQuote({ replyToContent, replyToSenderName }) {
  if (!replyToContent) return null;
  const truncated = replyToContent.length > 60
    ? replyToContent.slice(0, 60) + '…'
    : replyToContent;
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--font-mono)',
      color: 'var(--ink-muted)',
      borderLeft: '2px solid var(--accent-link)',
      paddingLeft: 6, marginBottom: 2,
      maxWidth: '90%',
    }}>
      ↳ <span style={{ color: 'var(--accent-link)' }}>@{replyToSenderName ?? '?'}</span>: {truncated}
    </div>
  );
}

export default function MessageList({ messages, selfId, emptyHint, channel, onSelectReply }) {
  const ref = useRef(null);
  const [hoverId, setHoverId] = useState(null);
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

  // 是否顯示「已讀 N」（DM/ROOM 訊息有意義；公開頻道太多人讀沒意義）
  const showReadCount = channel === 'dm' || channel === 'room';

  return (
    <div ref={ref} style={{
      flex: 1, overflowY: 'auto', minHeight: 0,
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {messages.map((m) => {
        const mine = m.senderId === selfId;
        const showReplyBtn = onSelectReply && hoverId === m.id;
        return (
          <div
            key={m.id}
            onMouseEnter={() => setHoverId(m.id)}
            onMouseLeave={() => setHoverId((cur) => (cur === m.id ? null : cur))}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: mine ? 'flex-end' : 'flex-start',
              position: 'relative',
            }}
          >
            <div style={{
              fontSize: 9, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
              marginBottom: 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{mine ? '你' : (m.senderName || '?')} · {fmtTime(m.createdAt)}</span>
              {showReplyBtn && (
                <button
                  onClick={() => onSelectReply(m)}
                  title="回覆此訊息"
                  style={{
                    background: 'var(--bg-paper)',
                    border: '1px solid var(--line-soft)',
                    color: 'var(--accent-link)',
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    padding: '0 5px', cursor: 'pointer',
                  }}
                >↩</button>
              )}
            </div>
            <ReplyQuote
              replyToContent={m.replyToContent}
              replyToSenderName={m.replyToSenderName}
            />
            <div style={{
              maxWidth: '90%',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              padding: '4px 8px',
              border: '1px solid var(--line-soft)',
              background: mine ? 'var(--accent)' : 'var(--bg-input)',
              color: mine ? 'var(--bg-paper)' : 'var(--ink)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {renderContentWithMentions(m.content)}
            </div>
            {mine && showReadCount && m.readByCount > 0 && (
              <div style={{
                fontSize: 8, fontFamily: 'var(--font-mono)',
                color: 'var(--ink-muted)', marginTop: 1,
              }}>
                已讀 {m.readByCount}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
