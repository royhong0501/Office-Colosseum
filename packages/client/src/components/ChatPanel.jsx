// 聊天浮動 dock：右下角固定，340×460 展開、收合時剩 pill。
// 4 channel：大廳 / 公告 / 房間（在房內才出現）/ DM*N。
//
// 訂閱 useChatStore；自己 emit CHAT_SEND / CHAT_HISTORY_REQ / CHAT_READ。
// 監聽全域 CustomEvent 'oc:open-dm'（Lobby 玩家列「DM」按鈕觸發）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../hooks/useChatStore.js';
import { getCurrentUser, isAdmin } from '../lib/auth.js';
import MessageList from './chat/MessageList.jsx';
import Composer from './chat/Composer.jsx';
import UserSidebar from './chat/UserSidebar.jsx';
import TabBar from './chat/TabBar.jsx';
import { chatErrorText } from './chat/util.js';

const DOCK_WIDTH = 480;
const DOCK_HEIGHT = 460;

function CollapsedPill({ onOpen, label, totalUnread, hasMention }) {
  // bottom 22px = 剛好坐在 SheetWindow 的 TabBar 那一列、不擋下方 StatusBar 的主題切換按鈕
  return (
    <button
      onClick={onOpen}
      title="展開聊天室"
      style={{
        position: 'fixed', bottom: 22, right: 12, zIndex: 9000,
        height: 22, minWidth: 140,
        padding: '0 14px',
        background: 'var(--bg-paper)',
        border: '1px solid var(--line)',
        borderTop: '2px solid var(--accent)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        cursor: 'pointer',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{ color: 'var(--accent-link)' }}>=CHAT</span>
      <span style={{ color: 'var(--ink-muted)' }}>(&quot;{label}&quot;)</span>
      {totalUnread > 0 && (
        <span style={{
          background: 'var(--accent-danger)', color: 'var(--bg-paper)',
          fontSize: 9, padding: '1px 5px', fontWeight: 700, minWidth: 14, textAlign: 'center',
        }}>{totalUnread}</span>
      )}
      {hasMention && (
        <span style={{
          background: 'var(--accent-link)', color: 'var(--bg-paper)',
          fontSize: 9, padding: '1px 4px', fontWeight: 700,
        }}>@</span>
      )}
    </button>
  );
}

function Header({ onlineCount, channelLabel, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 10px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg-chrome)',
      fontSize: 11,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
        <span style={{ color: 'var(--accent-link)' }}>=CHAT</span>
        (<span style={{ color: 'var(--accent)' }}>&quot;{channelLabel}&quot;</span>) <span style={{ color: 'var(--ink-muted)' }}>// 線上 {onlineCount}</span>
      </span>
      <button
        onClick={onClose}
        title="收起"
        style={{
          background: 'transparent', border: '1px solid var(--line-soft)',
          color: 'var(--ink-muted)', fontSize: 10, padding: '0 6px',
          cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }}
      >▼</button>
    </div>
  );
}

const CHANNEL_LABEL = {
  public: '大廳', announce: '公告', room: '房間', dm: 'DM',
};

export default function ChatPanel({ open, onToggle, currentRoomId }) {
  const me = getCurrentUser();
  const selfId = me?.id ?? null;
  const userIsAdmin = isAdmin();

  // 當前 active channel + (DM 時的) peerId
  const [activeChannel, setActiveChannel] = useState('public');  // public | announce | room | dm
  const [activePeerId, setActivePeerId] = useState(null);
  // reply 中的目標訊息（{ id, senderName, content } 或 null）
  const [replyTarget, setReplyTarget] = useState(null);
  const activeChannelRef = useRef('public');
  const activePeerIdRef = useRef(null);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { activePeerIdRef.current = activePeerId; }, [activePeerId]);

  const {
    state, send, openDm, closeDm, markDmRead, clearMentions, clearError,
    requestOlderHistory,
  } = useChatStore({
    selfId,
    activeChannelRef,
    activePeerIdRef,
    currentRoomId,
  });

  // 當 currentRoomId 不見了（離開房間），切回大廳避免顯示已關閉的 room channel
  // 反之剛進房（從 null 變有值）時自動切到房間頻道
  const prevRoomIdRef = useRef(currentRoomId);
  useEffect(() => {
    const prev = prevRoomIdRef.current;
    if (prev !== currentRoomId) {
      if (!currentRoomId && activeChannel === 'room') {
        setActiveChannel('public');
      } else if (currentRoomId && !prev) {
        setActiveChannel('room');
      }
      prevRoomIdRef.current = currentRoomId;
    }
  }, [currentRoomId, activeChannel]);

  // 切到 DM tab → 標已讀
  useEffect(() => {
    if (activeChannel !== 'dm' || !activePeerId) return;
    const t = state.dmThreads[activePeerId];
    if (t && t.unread > 0) markDmRead(activePeerId);
  }, [activeChannel, activePeerId, state.dmThreads, markDmRead]);

  // 監聽 Lobby 玩家列「DM」按鈕觸發的 CustomEvent
  useEffect(() => {
    const onOpenDm = (e) => {
      const { userId, displayName } = e.detail ?? {};
      if (!userId || userId === selfId) return;
      openDm(userId, displayName);
      setActiveChannel('dm');
      setActivePeerId(userId);
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

  // Map<userId, status>，給 Composer @ autocomplete 排序 + UserSidebar 用
  const onlineStatusMap = useMemo(() => {
    const m = new Map();
    for (const o of state.online) m.set(o.userId, o.status ?? 'online');
    return m;
  }, [state.online]);

  const dmTabs = useMemo(() => Object.values(state.dmThreads), [state.dmThreads]);
  const totalUnread = useMemo(
    () => dmTabs.reduce((s, t) => s + (t.unread || 0), 0),
    [dmTabs],
  );
  // 每個 channel 是否有未讀提及（per-channel 紅點）
  const mentionFlags = useMemo(() => {
    const m = state.mentionedByChannel ?? { public: [], announce: [], room: {}, dm: [] };
    return {
      public: (m.public?.length ?? 0) > 0,
      announce: (m.announce?.length ?? 0) > 0,
      room: currentRoomId ? ((m.room?.[currentRoomId]?.length ?? 0) > 0) : false,
      dm: (m.dm?.length ?? 0) > 0,
    };
  }, [state.mentionedByChannel, currentRoomId]);
  const hasMention = mentionFlags.public || mentionFlags.announce || mentionFlags.room || mentionFlags.dm;

  if (!open) {
    return (
      <CollapsedPill
        onOpen={() => onToggle?.(true)}
        label={CHANNEL_LABEL[activeChannel] ?? '大廳'}
        totalUnread={totalUnread}
        hasMention={hasMention}
      />
    );
  }

  // 當前訊息列 + emptyHint + onSend 行為
  let messages = [];
  let emptyHint = '';
  let onSend = null;
  let canSend = true;
  let composerPlaceholder = '';

  // 共用送出 + 自動帶 replyToId、送完清掉 reply 狀態
  const buildSendFn = (channel, baseOpts) => (text, replyToId) => {
    send(channel, { ...baseOpts, content: text, replyToId: replyToId ?? null });
    if (replyTarget) setReplyTarget(null);
  };

  // hasMore + onLoadOlder：MessageList 滾到頂時用
  let hasMore = false;
  let onLoadOlder = null;

  if (activeChannel === 'public') {
    messages = state.publicMessages;
    emptyHint = '大廳還沒有人說話。先打個招呼吧！';
    composerPlaceholder = '對全站說...';
    onSend = buildSendFn('public', {});
    hasMore = state.publicHasMore;
    onLoadOlder = (before) => requestOlderHistory({ channel: 'public', before });
  } else if (activeChannel === 'announce') {
    messages = state.announceMessages;
    emptyHint = '尚無公告';
    canSend = userIsAdmin;
    composerPlaceholder = canSend ? '發送公告（全站可見）...' : '只有 ADMIN 可發公告';
    onSend = buildSendFn('announce', {});
    hasMore = state.announceHasMore;
    onLoadOlder = (before) => requestOlderHistory({ channel: 'announce', before });
  } else if (activeChannel === 'room') {
    messages = state.roomThread?.messages ?? [];
    emptyHint = '房間頻道還沒有訊息';
    composerPlaceholder = '在房間內說...';
    onSend = buildSendFn('room', { roomId: currentRoomId });
    hasMore = !!state.roomThread?.hasMore;
    onLoadOlder = (before) => requestOlderHistory({ channel: 'room', roomId: currentRoomId, before });
  } else if (activeChannel === 'dm' && activePeerId) {
    messages = state.dmThreads[activePeerId]?.messages ?? [];
    emptyHint = '尚無訊息，輸入後按 Enter 開始對話';
    composerPlaceholder = `對 @${state.dmThreads[activePeerId]?.peer?.displayName ?? '對方'} 說...`;
    onSend = buildSendFn('dm', { recipientId: activePeerId });
    hasMore = !!state.dmThreads[activePeerId]?.hasMore;
    onLoadOlder = (before) => requestOlderHistory({ channel: 'dm', peerId: activePeerId, before });
  }

  // 切 channel / 切 peer 時清掉 reply（避免回覆條跨頻道殘留）
  const handleSelectReply = (msg) => {
    setReplyTarget({
      id: msg.id,
      senderName: msg.senderName,
      content: msg.content.slice(0, 80),
    });
  };

  const handleSelectTab = (channel, peerId) => {
    setActiveChannel(channel);
    setActivePeerId(peerId ?? null);
    setReplyTarget(null);
    // 清掉切換到的 channel 對應的 mention 紅點
    if (channel === 'room' && currentRoomId) {
      clearMentions({ channel: 'room', roomId: currentRoomId });
    } else if (channel === 'public' || channel === 'announce' || channel === 'dm') {
      clearMentions({ channel });
    }
  };
  const handleCloseTab = (peerId) => {
    if (activeChannel === 'dm' && activePeerId === peerId) {
      setActiveChannel('public'); setActivePeerId(null);
    }
    closeDm(peerId);
  };
  const handleOpenDmFromPresence = (id, name) => {
    openDm(id, name);
    setActiveChannel('dm');
    setActivePeerId(id);
  };

  return (
    <div style={{
      // bottom 22px = StatusBar 高度，dock 從 TabBar 上方往上展開、不擋主題按鈕
      position: 'fixed', bottom: 22, right: 12, zIndex: 9000,
      width: DOCK_WIDTH, height: DOCK_HEIGHT,
      background: 'var(--bg-paper)',
      border: '1px solid var(--line)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-ui)', color: 'var(--ink)',
    }}>
      <Header
        onlineCount={state.online.length}
        channelLabel={CHANNEL_LABEL[activeChannel] ?? '大廳'}
        onClose={() => onToggle?.(false)}
      />

      {/* split: 左側全玩家 sidebar + 右側 tabs+messages+composer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <UserSidebar
          allUsers={state.allUsers}
          online={state.online}
          selfId={selfId}
          onOpenDm={handleOpenDmFromPresence}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TabBar
            activeChannel={activeChannel}
            activePeerId={activePeerId}
            hasRoom={!!currentRoomId}
            roomLabel={currentRoomId ? `房間 R-${(currentRoomId.replace(/^room-/, '').padStart(4, '0').slice(-4)).toUpperCase()}` : null}
            dmTabs={dmTabs}
            onlineCount={state.online.length}
            mentionFlags={mentionFlags}
            onSelect={handleSelectTab}
            onCloseDm={handleCloseTab}
          />

          <MessageList
            messages={messages}
            selfId={selfId}
            emptyHint={emptyHint}
            channel={activeChannel}
            onSelectReply={canSend ? handleSelectReply : null}
            hasMore={hasMore}
            onLoadOlder={onLoadOlder}
          />

          {state.error && (
            <div style={{
              background: 'var(--accent-danger)', color: 'var(--bg-paper)',
              fontSize: 10, padding: '4px 8px', fontFamily: 'var(--font-mono)',
              textAlign: 'center',
            }}>
              {chatErrorText(state.error)}
            </div>
          )}

          <Composer
            onSend={onSend}
            placeholder={composerPlaceholder}
            disabled={!canSend}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            allUsers={state.allUsers}
            onlineMap={onlineStatusMap}
          />
        </div>
      </div>
    </div>
  );
}
