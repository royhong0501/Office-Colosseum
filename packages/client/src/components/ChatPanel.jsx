// 聊天側邊欄主元件。280px 寬，貼在主畫面右側（auth/battle/gameover 不掛）。
// 訂閱 useChatStore；自己 emit CHAT_SEND / CHAT_HISTORY_REQ / CHAT_READ。
// 監聽全域 CustomEvent 'oc:open-dm'（Lobby 玩家列「DM」按鈕觸發）。
//
// 子元件：components/chat/{MessageList, Composer, PresenceList, TabBar}.jsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../hooks/useChatStore.js';
import { getCurrentUser } from '../lib/auth.js';
import MessageList from './chat/MessageList.jsx';
import Composer from './chat/Composer.jsx';
import PresenceList from './chat/PresenceList.jsx';
import TabBar from './chat/TabBar.jsx';
import { chatErrorText } from './chat/util.js';

const PANEL_WIDTH = 280;
const STUB_WIDTH = 32;

function CollapsedStub({ onOpen, totalUnread }) {
  return (
    <button
      onClick={onOpen}
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

function Header({ onlineCount, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 8px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg-cell-header)',
      fontSize: 11,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
        =CHAT(<span style={{ color: 'var(--accent)' }}>"{onlineCount}"</span>)
      </span>
      <button
        onClick={onClose}
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

  const { state, send, openDm, closeDm, markRead, clearError } = useChatStore({ selfId, activePeerIdRef });

  // 切到 DM tab → 標已讀
  useEffect(() => {
    if (activeTab === 'public') return;
    const t = state.dmThreads[activeTab];
    if (t && t.unread > 0) markRead(activeTab);
  }, [activeTab, state.dmThreads, markRead]);

  // 監聽 Lobby 玩家列「DM」按鈕觸發的 CustomEvent
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

  // sticky error 2.5s
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

  if (!open) {
    return <CollapsedStub onOpen={() => onToggle?.(true)} totalUnread={totalUnread} />;
  }

  const messages = activeTab === 'public'
    ? state.publicMessages
    : (state.dmThreads[activeTab]?.messages ?? []);
  const emptyHint = activeTab === 'public'
    ? '大廳還沒有人說話。先打個招呼吧！'
    : '尚無訊息，輸入後按 Enter 開始對話';

  const onSend = (text) => {
    if (activeTab === 'public') send('public', null, text);
    else send('dm', activeTab, text);
  };

  const handleSelectTab = (id) => setActiveTab(id);
  const handleCloseTab = (peerId) => {
    if (activeTab === peerId) setActiveTab('public');
    closeDm(peerId);
  };
  const handleOpenDmFromPresence = (id, name) => {
    openDm(id, name);
    setActiveTab(id);
  };

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
      <Header onlineCount={state.online.length} onClose={() => onToggle?.(false)} />

      <TabBar
        activeTab={activeTab}
        dmTabs={dmTabs}
        onlineCount={state.online.length}
        onSelect={handleSelectTab}
        onClose={handleCloseTab}
      />

      {activeTab === 'public' && (
        <PresenceList online={state.online} selfId={selfId} onOpenDm={handleOpenDmFromPresence} />
      )}

      <MessageList messages={messages} selfId={selfId} emptyHint={emptyHint} />

      {state.error && (
        <div style={{
          background: 'var(--accent-danger)',
          color: 'var(--bg-paper)',
          fontSize: 10,
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          textAlign: 'center',
        }}>
          {chatErrorText(state.error)}
        </div>
      )}

      <Composer onSend={onSend} />
    </div>
  );
}
