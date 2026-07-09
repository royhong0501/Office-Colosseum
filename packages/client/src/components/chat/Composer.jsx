// 輸入列。Enter 送出、Shift+Enter 換行；超過 CHAT_CONTENT_MAX 字計數變紅。
// replyTarget 帶值時上方顯示引用條（含 X 取消），onSend 會收到 replyToId。
//
// @ autocomplete：偵測 caret 前最後一段 `@xxx`（無空白）→ 從 allUsers filter
// startsWith 前綴匹配的候選 → 浮層列出最多 8 筆。↓↑ 切換、Tab/Enter 確認補全
// 為 `@username `（含末尾空格），Esc 關閉。浮層開時 Enter 不送訊息。

import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_CONTENT_MAX } from '@office-colosseum/shared';

const MAX_CANDIDATES = 8;

// 從文字找 caret 之前最後一個未閉合 `@xxx`（不含空白）。回 { start, partial } 或 null。
function findActiveMention(text, caret) {
  const before = text.slice(0, caret);
  const match = before.match(/@([a-zA-Z0-9_.-]*)$/);
  if (!match) return null;
  return { start: match.index, partial: match[1] };
}

export default function Composer({
  onSend, disabled = false, placeholder,
  replyTarget, onCancelReply,
  allUsers = [], onlineMap,    // onlineMap: { userId → status } 給排序用
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const taRef = useRef(null);

  // 算當前 active mention（如果有）
  const active = findActiveMention(text, caret);

  // 候選清單：partial 為前綴，case-insensitive。按線上 status + 字典序排序。
  const candidates = useMemo(() => {
    if (!active) return [];
    const q = active.partial.toLowerCase();
    const filtered = allUsers.filter((u) =>
      (u.username ?? '').toLowerCase().startsWith(q) ||
      (u.displayName ?? '').toLowerCase().startsWith(q),
    );
    const order = { online: 0, in_match: 1, offline: 2, undefined: 3 };
    filtered.sort((a, b) => {
      const sa = order[onlineMap?.get?.(a.id)] ?? 3;
      const sb = order[onlineMap?.get?.(b.id)] ?? 3;
      if (sa !== sb) return sa - sb;
      return (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username);
    });
    return filtered.slice(0, MAX_CANDIDATES);
  }, [active, allUsers, onlineMap]);

  const popoverOpen = candidates.length > 0;

  // active 區間或候選變動時，重置高亮 idx
  useEffect(() => {
    if (popoverOpen) setHighlightIdx(0);
  }, [popoverOpen, active?.start]);

  function applyCandidate(user) {
    if (!active) return;
    const handle = user.username ?? user.displayName;
    const before = text.slice(0, active.start);
    const after = text.slice(caret);
    const inserted = `@${handle} `;
    const next = before + inserted + after;
    const newCaret = before.length + inserted.length;
    setText(next);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
        setCaret(newCaret);
      }
    });
  }

  const onKey = (e) => {
    // 浮層開時優先處理導航 / 確認 / 關閉
    if (popoverOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        applyCandidate(candidates[highlightIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // 簡單做法：在 partial 末尾插個空白讓 active 變 null 關閉浮層
        const ta = taRef.current;
        if (ta) {
          const before = text.slice(0, caret);
          const after = text.slice(caret);
          setText(before + ' ' + after);
          requestAnimationFrame(() => {
            ta.setSelectionRange(caret + 1, caret + 1);
            setCaret(caret + 1);
          });
        }
        return;
      }
    }
    // 一般 Enter 送出
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const t = text.trim();
      if (!t) return;
      onSend(t, replyTarget?.id ?? null);
      setText('');
      setCaret(0);
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    setCaret(e.target.selectionStart ?? e.target.value.length);
  };
  const handleSelect = (e) => {
    setCaret(e.target.selectionStart ?? 0);
  };

  const tooLong = text.length > CHAT_CONTENT_MAX;
  return (
    <div style={{
      borderTop: '1px solid var(--line-soft)',
      background: 'var(--bg-paper)',
      position: 'relative',
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

      {/* @ 候選浮層 */}
      {popoverOpen && (
        <div style={{
          position: 'absolute',
          left: 8, right: 8,
          bottom: 'calc(100% - 1px)',
          background: 'var(--bg-paper)',
          border: '1px solid var(--line)',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.12)',
          zIndex: 10,
          maxHeight: 180, overflowY: 'auto',
        }}>
          {candidates.map((u, i) => {
            const status = onlineMap?.get?.(u.id) ?? 'offline';
            const dot = status === 'online' ? '#4f8d4f'
              : status === 'in_match' ? 'var(--accent-link)'
              : 'var(--accent-danger)';
            return (
              <div
                key={u.id}
                onMouseDown={(e) => { e.preventDefault(); applyCandidate(u); }}
                onMouseEnter={() => setHighlightIdx(i)}
                style={{
                  padding: '4px 10px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--font-ui)', fontSize: 11,
                  color: 'var(--ink)',
                  background: i === highlightIdx ? 'var(--bg-paper-alt)' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--line-soft)',
                }}
              >
                <span style={{ color: dot, fontSize: 11, lineHeight: 1, flexShrink: 0 }}>●</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
                  @{u.username}
                </span>
                {u.displayName && u.displayName !== u.username && (
                  <span style={{ color: 'var(--ink-muted)' }}>({u.displayName})</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: '6px 8px' }}>
        <textarea
          ref={taRef}
          value={text}
          onChange={handleChange}
          onSelect={handleSelect}
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
          <span>{disabled ? '' : (popoverOpen ? '↑↓ 選 · Tab/Enter 確認 · Esc 取消' : 'Enter ↵ · Shift+Enter 換行')}</span>
          <span>{text.length}/{CHAT_CONTENT_MAX}</span>
        </div>
      </div>
    </div>
  );
}
