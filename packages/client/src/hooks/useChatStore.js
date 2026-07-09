// 聊天狀態管理 hook：訂閱 socket chat 事件、維護 4 種 channel 的訊息 + presence。
//
// channel：
//   - public：大廳全站公頻（始終可見）
//   - announce：公告頻道（全站可讀，僅 ADMIN 可寫）
//   - room：房間頻道（只在進房時 active）
//   - dm：1-on-1 私訊（多 peer，每個是獨立分頁）
//
// 對外提供：
//   state: {
//     publicMessages, publicHasMore, publicLoaded,
//     announceMessages, announceHasMore, announceLoaded,
//     roomThread: { roomId, messages, hasMore, loaded } | null,
//     dmThreads: { [peerId]: { peer, messages, unread, hasMore, loaded } },
//     online: [{userId, displayName, status}],
//     mentionedMessageIds: Set<string>,    // 累計被@到自己尚未讀的 message ids
//     error,
//   }
//   actions: send / openDm / closeDm / markDmRead / markMessageRead / requestHistory / clearError

import { useEffect, useReducer, useCallback, useRef } from 'react';
import { MSG } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { fetchAuthed } from '../lib/auth.js';

const initialState = {
  publicMessages: [],
  publicHasMore: true,
  publicLoaded: false,
  announceMessages: [],
  announceHasMore: true,
  announceLoaded: false,
  roomThread: null,    // { roomId, messages, hasMore, loaded } | null
  dmThreads: {},
  allUsers: [],           // [{id, displayName, username}] — 從 /auth/users 一次拉
  online: [],             // [{userId, displayName, status}] — CHAT_PRESENCE 即時更新
  // 被 @ 到的訊息 id 依 channel 分桶；切到該 channel 才清那一桶
  mentionedByChannel: {
    public: [],
    announce: [],
    room: {},   // { [roomId]: [messageId, ...] }
    dm: [],     // 簡化：DM 不分 peer（DM 不常見 mention）
  },
  error: null,
};

function emptyThread(peer) {
  return { peer, messages: [], unread: 0, hasMore: true, loaded: false };
}

function reducer(state, a) {
  switch (a.type) {
    case 'PUBLIC_HISTORY': {
      const next = a.older ? [...a.messages, ...state.publicMessages] : a.messages;
      return { ...state, publicMessages: next, publicHasMore: a.hasMore, publicLoaded: true };
    }
    case 'ANNOUNCE_HISTORY': {
      const next = a.older ? [...a.messages, ...state.announceMessages] : a.messages;
      return { ...state, announceMessages: next, announceHasMore: a.hasMore, announceLoaded: true };
    }
    case 'ROOM_HISTORY': {
      // 只在 a.roomId 跟當前 active room 相同才 apply（避免換房後舊 history 殘留）
      if (state.roomThread?.roomId !== a.roomId) return state;
      const next = a.older ? [...a.messages, ...(state.roomThread?.messages ?? [])] : a.messages;
      return {
        ...state,
        roomThread: {
          roomId: a.roomId, messages: next,
          hasMore: a.hasMore, loaded: true,
        },
      };
    }
    case 'DM_HISTORY': {
      const peerId = a.peerId;
      const peer = a.peer ?? (state.dmThreads[peerId]?.peer ?? { id: peerId, displayName: '' });
      const prev = state.dmThreads[peerId] ?? emptyThread(peer);
      const next = a.older ? [...a.messages, ...prev.messages] : a.messages;
      return {
        ...state,
        dmThreads: {
          ...state.dmThreads,
          [peerId]: { ...prev, peer, messages: next, hasMore: a.hasMore, loaded: true },
        },
      };
    }
    case 'NEW_PUBLIC':
      return { ...state, publicMessages: [...state.publicMessages, a.msg] };
    case 'NEW_ANNOUNCE':
      return { ...state, announceMessages: [...state.announceMessages, a.msg] };
    case 'NEW_ROOM': {
      if (state.roomThread?.roomId !== a.msg.roomId) return state;
      return {
        ...state,
        roomThread: {
          ...state.roomThread,
          messages: [...state.roomThread.messages, a.msg],
        },
      };
    }
    case 'NEW_DM': {
      const { msg, selfId, isActive } = a;
      const peerId = msg.senderId === selfId ? msg.recipientId : msg.senderId;
      const peerName = msg.senderId === selfId ? (msg.recipientName ?? '') : msg.senderName;
      const peer = { id: peerId, displayName: peerName };
      const prev = state.dmThreads[peerId] ?? emptyThread(peer);
      const incoming = msg.senderId !== selfId;
      const unread = incoming && !isActive ? prev.unread + 1 : prev.unread;
      return {
        ...state,
        dmThreads: {
          ...state.dmThreads,
          [peerId]: {
            ...prev,
            peer: { ...prev.peer, displayName: peerName || prev.peer.displayName },
            messages: [...prev.messages, msg],
            unread,
          },
        },
      };
    }
    case 'OPEN_DM': {
      const { peerId, displayName } = a;
      if (state.dmThreads[peerId]) return state;
      return {
        ...state,
        dmThreads: {
          ...state.dmThreads,
          [peerId]: emptyThread({ id: peerId, displayName }),
        },
      };
    }
    case 'CLOSE_DM': {
      if (!state.dmThreads[a.peerId]) return state;
      const next = { ...state.dmThreads };
      delete next[a.peerId];
      return { ...state, dmThreads: next };
    }
    case 'MARK_READ': {
      const prev = state.dmThreads[a.peerId];
      if (!prev || prev.unread === 0) return state;
      return {
        ...state,
        dmThreads: { ...state.dmThreads, [a.peerId]: { ...prev, unread: 0 } },
      };
    }
    case 'UNREAD_BULK': {
      const next = { ...state.dmThreads };
      for (const [peerId, count] of Object.entries(a.byPeer)) {
        if (next[peerId]) next[peerId] = { ...next[peerId], unread: count };
        else next[peerId] = { ...emptyThread({ id: peerId, displayName: '' }), unread: count };
      }
      return { ...state, dmThreads: next };
    }
    case 'ALL_USERS':
      return { ...state, allUsers: a.users };
    case 'READ_UPDATE': {
      // 找跨 channel 的對應訊息，更新它的 readByCount
      const updateOne = (m) => (m.id === a.messageId ? { ...m, readByCount: a.count } : m);
      return {
        ...state,
        publicMessages: state.publicMessages.map(updateOne),
        announceMessages: state.announceMessages.map(updateOne),
        roomThread: state.roomThread
          ? { ...state.roomThread, messages: state.roomThread.messages.map(updateOne) }
          : null,
        dmThreads: Object.fromEntries(
          Object.entries(state.dmThreads).map(([k, v]) => [
            k, { ...v, messages: v.messages.map(updateOne) },
          ]),
        ),
      };
    }
    case 'PRESENCE':
      return { ...state, online: a.list };
    case 'PRESENCE_RESOLVE_NAMES': {
      const next = { ...state.dmThreads };
      let dirty = false;
      for (const peer of a.list) {
        const t = next[peer.userId];
        if (t && !t.peer.displayName) {
          next[peer.userId] = { ...t, peer: { id: peer.userId, displayName: peer.displayName } };
          dirty = true;
        }
      }
      return dirty ? { ...state, dmThreads: next } : state;
    }
    case 'ENTER_ROOM': {
      if (state.roomThread?.roomId === a.roomId) return state;
      return { ...state, roomThread: { roomId: a.roomId, messages: [], hasMore: true, loaded: false } };
    }
    case 'LEAVE_ROOM':
      if (!state.roomThread) return state;
      return { ...state, roomThread: null };
    case 'MENTION_ADD': {
      const { messageId, channel, roomId } = a;
      if (!messageId || !channel) return state;
      const m = state.mentionedByChannel;
      if (channel === 'public' || channel === 'announce' || channel === 'dm') {
        if (m[channel].includes(messageId)) return state;
        return {
          ...state,
          mentionedByChannel: { ...m, [channel]: [...m[channel], messageId] },
        };
      }
      if (channel === 'room' && roomId) {
        const cur = m.room[roomId] ?? [];
        if (cur.includes(messageId)) return state;
        return {
          ...state,
          mentionedByChannel: {
            ...m,
            room: { ...m.room, [roomId]: [...cur, messageId] },
          },
        };
      }
      return state;
    }
    case 'MENTION_CLEAR_CHANNEL': {
      // 切到該 channel 時清掉該桶
      const { channel, roomId } = a;
      const m = state.mentionedByChannel;
      if (channel === 'public' || channel === 'announce' || channel === 'dm') {
        if (m[channel].length === 0) return state;
        return { ...state, mentionedByChannel: { ...m, [channel]: [] } };
      }
      if (channel === 'room' && roomId) {
        if (!m.room[roomId]?.length) return state;
        const nextRoom = { ...m.room };
        delete nextRoom[roomId];
        return { ...state, mentionedByChannel: { ...m, room: nextRoom } };
      }
      return state;
    }
    case 'ERROR':
      return { ...state, error: a.code };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useChatStore({ selfId, activeChannelRef, activePeerIdRef, currentRoomId }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const initRef = useRef(false);
  const lastRoomIdRef = useRef(null);
  // 追蹤「下一個 HISTORY_RES 是不是 older（拉舊）」，每個 channel/peer/room 一筆 flag。
  // 因為 server 不會回傳這個 flag，client 自己記住「我剛才送的是不是 older request」。
  const pendingOlderRef = useRef(new Set());

  function pendingKey(channel, peerId, roomId) {
    if (channel === 'dm') return `dm:${peerId}`;
    if (channel === 'room') return `room:${roomId}`;
    return channel;   // public / announce
  }

  // ---- 訂閱 socket events ----
  useEffect(() => {
    if (!selfId) return;
    const socket = getSocket();

    const onMsg = (msg) => {
      if (msg.channel === 'public') {
        dispatch({ type: 'NEW_PUBLIC', msg });
      } else if (msg.channel === 'announce') {
        dispatch({ type: 'NEW_ANNOUNCE', msg });
        // 收到別人發的 announce 立即標已讀，server 會 push 「已讀 N」更新給 sender
        if (msg.senderId !== selfId) socket.emit(MSG.CHAT_READ, { messageId: msg.id });
      } else if (msg.channel === 'room') {
        dispatch({ type: 'NEW_ROOM', msg });
        if (msg.senderId !== selfId) socket.emit(MSG.CHAT_READ, { messageId: msg.id });
      } else if (msg.channel === 'dm') {
        const peerId = msg.senderId === selfId ? msg.recipientId : msg.senderId;
        const isActive = activeChannelRef?.current === 'dm' && activePeerIdRef?.current === peerId;
        dispatch({ type: 'NEW_DM', msg, selfId, isActive });
        if (isActive && msg.senderId !== selfId) {
          socket.emit(MSG.CHAT_READ, { peerId });
          dispatch({ type: 'MARK_READ', peerId });
        }
      }
    };
    const onReadUpdate = ({ messageId, count }) => {
      dispatch({ type: 'READ_UPDATE', messageId, count });
    };
    const onHistoryRes = ({ channel, peerId, roomId, messages, hasMore }) => {
      const key = pendingKey(channel ?? 'public', peerId, roomId);
      const older = pendingOlderRef.current.has(key);
      if (older) pendingOlderRef.current.delete(key);
      if (channel === 'announce') dispatch({ type: 'ANNOUNCE_HISTORY', messages, hasMore, older });
      else if (channel === 'room') dispatch({ type: 'ROOM_HISTORY', roomId, messages, hasMore, older });
      else if (channel === 'dm' || peerId) dispatch({ type: 'DM_HISTORY', peerId, messages, hasMore, older });
      else dispatch({ type: 'PUBLIC_HISTORY', messages, hasMore, older });
    };
    const onUnread = ({ byPeer }) => dispatch({ type: 'UNREAD_BULK', byPeer });
    const onPresence = ({ users, online }) => {
      const list = users ?? online ?? [];   // backward compat（舊 key 'online'）
      dispatch({ type: 'PRESENCE', list });
      dispatch({ type: 'PRESENCE_RESOLVE_NAMES', list });
    };
    const onMention = (notify) => {
      dispatch({
        type: 'MENTION_ADD',
        messageId: notify?.messageId,
        channel: notify?.channel,
        roomId: notify?.roomId ?? null,
      });
    };
    const onError = (e) => {
      if (e?.code?.startsWith?.('chat_')) dispatch({ type: 'ERROR', code: e.code });
    };

    socket.on(MSG.CHAT_MSG, onMsg);
    socket.on(MSG.CHAT_HISTORY_RES, onHistoryRes);
    socket.on(MSG.CHAT_UNREAD, onUnread);
    socket.on(MSG.CHAT_PRESENCE, onPresence);
    socket.on(MSG.CHAT_MENTION_NOTIFY, onMention);
    socket.on(MSG.CHAT_MSG_READ_UPDATE, onReadUpdate);
    socket.on(MSG.ERROR, onError);

    return () => {
      socket.off(MSG.CHAT_MSG, onMsg);
      socket.off(MSG.CHAT_HISTORY_RES, onHistoryRes);
      socket.off(MSG.CHAT_UNREAD, onUnread);
      socket.off(MSG.CHAT_PRESENCE, onPresence);
      socket.off(MSG.CHAT_MENTION_NOTIFY, onMention);
      socket.off(MSG.CHAT_MSG_READ_UPDATE, onReadUpdate);
      socket.off(MSG.ERROR, onError);
    };
  }, [selfId, activeChannelRef, activePeerIdRef]);

  // ---- 第一次 mount：拉公開頻道歷史 + 全使用者清單 ----
  useEffect(() => {
    if (!selfId || initRef.current) return;
    const socket = getSocket();
    const fire = () => {
      if (initRef.current) return;
      initRef.current = true;
      socket.emit(MSG.CHAT_HISTORY_REQ, { channel: 'public' });
      socket.emit(MSG.CHAT_HISTORY_REQ, { channel: 'announce' });
    };
    if (socket.connected) fire();
    else socket.once('connect', fire);

    // 拉一次全使用者清單給左側 sidebar
    fetchAuthed('/auth/users')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.users) dispatch({ type: 'ALL_USERS', users: data.users });
      })
      .catch(() => {});

    return () => socket.off('connect', fire);
  }, [selfId]);

  // ---- currentRoomId 變化：load room history / clear ----
  useEffect(() => {
    if (currentRoomId === lastRoomIdRef.current) return;
    lastRoomIdRef.current = currentRoomId;
    if (currentRoomId) {
      dispatch({ type: 'ENTER_ROOM', roomId: currentRoomId });
      getSocket().emit(MSG.CHAT_HISTORY_REQ, { channel: 'room', roomId: currentRoomId });
    } else {
      dispatch({ type: 'LEAVE_ROOM' });
    }
  }, [currentRoomId]);

  const send = useCallback((channel, opts) => {
    const socket = getSocket();
    socket.emit(MSG.CHAT_SEND, { channel, ...opts });
  }, []);

  /**
   * 拉「更舊」的訊息：scrollTop 觸頂時呼叫。
   * 由 caller 帶入該 channel 目前最早的 createdAt 當 before（避免 store 自己 race
   * 拿到還沒 prepend 進來的舊資料）。
   */
  const requestOlderHistory = useCallback(({ channel, peerId, roomId, before }) => {
    if (!channel || !before) return;
    const key = pendingKey(channel, peerId, roomId);
    if (pendingOlderRef.current.has(key)) return;   // 同一 channel 已有 in-flight 請求，避免連環觸發
    pendingOlderRef.current.add(key);
    const socket = getSocket();
    const payload = { channel, before };
    if (channel === 'dm') payload.peerId = peerId;
    if (channel === 'room') payload.roomId = roomId;
    socket.emit(MSG.CHAT_HISTORY_REQ, payload);
  }, []);

  const openDm = useCallback((peerId, displayName) => {
    dispatch({ type: 'OPEN_DM', peerId, displayName: displayName ?? '' });
    getSocket().emit(MSG.CHAT_HISTORY_REQ, { channel: 'dm', peerId });
  }, []);

  const closeDm = useCallback((peerId) => {
    dispatch({ type: 'CLOSE_DM', peerId });
  }, []);

  const markDmRead = useCallback((peerId) => {
    getSocket().emit(MSG.CHAT_READ, { peerId });
    dispatch({ type: 'MARK_READ', peerId });
  }, []);

  const markMessageRead = useCallback((messageId) => {
    getSocket().emit(MSG.CHAT_READ, { messageId });
  }, []);

  const clearMentions = useCallback(({ channel, roomId } = {}) => {
    dispatch({ type: 'MENTION_CLEAR_CHANNEL', channel, roomId });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  return {
    state,
    send, openDm, closeDm, markDmRead, markMessageRead,
    requestOlderHistory,
    clearMentions, clearError,
  };
}
