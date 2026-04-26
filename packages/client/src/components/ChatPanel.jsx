// 聊天側邊欄。280px 寬，貼在主畫面右側（auth/battle/gameover 不掛）。
// 訂閱 useChatStore；自己 emit CHAT_SEND / CHAT_HISTORY_REQ / CHAT_READ。
// 監聽全域 CustomEvent 'oc:open-dm'（Lobby 玩家列「私訊」按鈕觸發）。

import { useEffect, useRef, useState, useMemo } from 'react';
import { useChatStore } from '../hooks/useChatStore.js';
import { getCurrentUser } from '../lib/auth.js';
import { CHAT_CONTENT_MAX } from '@office-colosseum/shared';

const PANEL_WIDTH = 280;
const STUB_WIDTH = 32;

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ErrorMap(code) {
  switch (code) {
    case 'chat_rate_limited': return '太快了，等一下再說';
    case 'chat_too_long': return `訊息超過 ${CHAT_CONTENT_MAX} 字`;
    case 'chat_empty': return '訊息不能空白';
    case 'chat_recipient_invalid': return '對方帳號不存在或已停用';
    case 'chat_recipient_self': return '不能傳給自己';
    default: return code ?? '送出失敗';
  }
}

function MessageList({ messages, selfId, emptyHint }) {
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

function Composer({ onSend, disabled }) {
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

function PresenceList({ online, selfId, onOpenDm }) {
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

export default function ChatPanel({ open, onToggle }) {
  const me = getCurrentUser();
  const selfId = me?.id ?? null;
  const [activeTab, setActiveTab] = useState('public');  // 'public' | peerId
  const activePeerIdRef = useRef(null);
  useEffect(() => {
    activePeerIdRef.current = activeTab === 'public' ? null : activeTab;
  }, [activeTab]);

  const {
    state, send, openDm, closeDm, markRead, clearError,
  } = useChatStore({ selfId, activePeerIdRef });

  // 切到 DM tab → 標已讀 + 拉一次歷史（如果還沒拉過）
  useEffect(() => {
    if (activeTab === 'public') return;
    const t = state.dmThreads[activeTab];
    if (t && t.unread > 0) markRead(activeTab);
  }, [activeTab, state.dmThreads, markRead]);

  // 監聽外部「開私訊」事件（Lobby 玩家列按鈕觸發）
  useEffect(() => {
    const onOpenDm = (e) => {
      const { userId, displayName } = e.detail ?? {};
      if (!userId || userId === selfId) return;
      openDm(userId, displayName);
      setActiveTab(userId);
      if (!open) onToggle?.(true);
    };
    window.addEventListener('oc:open-dm', onOpenDm);
    return () => window.removeEventListener('oc:open-dm', onOpenDm);
  }, [openDm, selfId, open, onToggle]);

  // 顯示 sticky error 2 秒
  useEffect(() => {
    if (!state.error) return;
    const id = setTimeout(clearError, 2500);
    return () => clearTimeout(id);
  }, [state.error, clearError]);

  const dmTabs = useMemo(() => Object.values(state.dmThreads), [state.dmThreads]);
  const totalUnread = useMemo(
    () => dmTabs.reduce((s, t) => s + (t.unread || 0), 0),
    [dmTabs],
  );

  const onSend = (text) => {
    if (activeTab === 'public') {
      send('public', null, text);
    } else {
      send('dm', activeTab, text);
    }
  };

  // 收起時的窄條
  if (!open) {
    return (
      <button
        onClick={() => onToggle?.(true)}
        title="展開聊天室"
        style={{
          width: STUB_WIDTH, flexShrink: 0,
          height: '100vh',
          background: 'var(--bg-cell-header)',
          border: 'none',
          borderLeft: '1px solid var(--line)',
          color: 'var(--ink-soft)',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 8,
          padding: '12px 0',
          position: 'relative',
        }}
      >
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: 2 }}>
          =CHAT()
        </span>
        {totalUnread > 0 && (
          <span style={{
            background: 'var(--accent-danger)',
            color: 'var(--bg-paper)',
            fontSize: 9,
            padding: '1px 4px',
            fontWeight: 700,
            minWidth: 14, textAlign: 'center',
          }}>
            {totalUnread}
          </span>
        )}
      </button>
    );
  }

  const messages = activeTab === 'public'
    ? state.publicMessages
    : (state.dmThreads[activeTab]?.messages ?? []);
  const emptyHint = activeTab === 'public'
    ? '大廳還沒有人說話。先打個招呼吧！'
    : '尚無訊息，輸入後按 Enter 開始對話';

  return (
    <div style={{
      width: PANEL_WIDTH, flexShrink: 0,
      height: '100vh',
      background: 'var(--bg-paper)',
      borderLeft: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-ui)',
      color: 'var(--ink)',
    }}>
      {/* 標題列 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg-cell-header)',
        fontSize: 11,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
          =CHAT(<span style={{ color: 'var(--accent)' }}>"{state.online.length}"</span>)
        </span>
        <button
          onClick={() => onToggle?.(false)}
          title="收起"
          style={{
            background: 'transparent',
            border: '1px solid var(--line-soft)',
            color: 'var(--ink-muted)',
            fontSize: 10,
            padding: '0 6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          →
        </button>
      </div>

      {/* tabs */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid var(--line-soft)',
        background: 'var(--bg-input)',
      }}>
        <button
          onClick={() => setActiveTab('public')}
          style={tabStyle(activeTab === 'public')}
        >
          大廳 · {state.online.length}
        </button>
        {dmTabs.map((t) => (
          <span key={t.peer.id} style={{ display: 'flex', alignItems: 'stretch' }}>
            <button
              onClick={() => setActiveTab(t.peer.id)}
              style={tabStyle(activeTab === t.peer.id)}
            >
              @{t.peer.displayName || t.peer.id.slice(0, 4)}
              {t.unread > 0 && (
                <span style={{
                  background: 'var(--accent-danger)',
                  color: 'var(--bg-paper)',
                  fontSize: 9,
                  padding: '0 4px',
                  marginLeft: 4,
                  fontWeight: 700,
                }}>
                  {t.unread}
                </span>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (activeTab === t.peer.id) setActiveTab('public');
                closeDm(t.peer.id);
              }}
              title="關閉"
              style={{
                background: 'transparent',
                border: 'none',
                borderRight: '1px solid var(--line-soft)',
                color: 'var(--ink-muted)',
                fontSize: 9,
                padding: '0 4px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* 線上清單（只在公開頻道顯示） */}
      {activeTab === 'public' && (
        <PresenceList online={state.online} selfId={selfId} onOpenDm={(id, name) => {
          openDm(id, name);
          setActiveTab(id);
        }} />
      )}

      {/* 訊息列表 */}
      <MessageList messages={messages} selfId={selfId} emptyHint={emptyHint} />

      {/* 錯誤提示 */}
      {state.error && (
        <div style={{
          background: 'var(--accent-danger)',
          color: 'var(--bg-paper)',
          fontSize: 10,
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
        }}>
          {ErrorMap(state.error)}
        </div>
      )}

      {/* 輸入列 */}
      <Composer onSend={onSend} disabled={false} />
    </div>
  );
}

function tabStyle(active) {
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
