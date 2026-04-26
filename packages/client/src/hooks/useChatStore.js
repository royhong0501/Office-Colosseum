// 聊天狀態管理 hook：訂閱 socket chat 事件、維護 publicMessages / dmThreads / online。
// 設計成「整個 App 內 mount 一次」，所以放在 App.jsx 的 ChatPanel 處（非戰鬥畫面才 mount）。
//
// 對外提供：
//   - state: { publicMessages, dmThreads (Map-like obj keyed by peerId), online, error }
//   - actions: { send, requestPublicHistory, requestDmHistory, openDm, markRead, clearError }

import { useEffect, useReducer, useCallback, useRef } from 'react';
import { MSG } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';

const initialState = {
  publicMessages: [],
  publicHasMore: true,
  publicLoaded: false,
  dmThreads: {},          // peerId -> { peer:{id,displayName}, messages:[], unread:0, hasMore, loaded }
  online: [],             // [{userId, displayName}]
  error: null,
};

function emptyThread(peer) {
  return { peer, messages: [], unread: 0, hasMore: true, loaded: false };
}

function reducer(state, a) {
  switch (a.type) {
    case 'PUBLIC_HISTORY': {
      const next = a.older
        ? [...a.messages, ...state.publicMessages]
        : a.messages;
      return { ...state, publicMessages: next, publicHasMore: a.hasMore, publicLoaded: true };
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
          [peerId]: { ...prev, peer: { ...prev.peer, displayName: peerName || prev.peer.displayName }, messages: [...prev.messages, msg], unread },
        },
      };
    }
    case 'OPEN_DM': {
      const { peerId, displayName } = a;
      const prev = state.dmThreads[peerId];
      if (prev) return state;
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
      // server 推來的 byPeer：把現有 thread 對齊；沒 thread 的用 stub 建一個
      const next = { ...state.dmThreads };
      for (const [peerId, count] of Object.entries(a.byPeer)) {
        if (next[peerId]) next[peerId] = { ...next[peerId], unread: count };
        else next[peerId] = { ...emptyThread({ id: peerId, displayName: '' }), unread: count };
      }
      return { ...state, dmThreads: next };
    }
    case 'PRESENCE':
      return { ...state, online: a.list };
    case 'PRESENCE_RESOLVE_NAMES': {
      // 收到 presence 後，把已知 displayName 補進尚未有名字的 dmThreads
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
    case 'ERROR':
      return { ...state, error: a.code };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useChatStore({ selfId, activePeerIdRef }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const initRef = useRef(false);

  useEffect(() => {
    if (!selfId) return;
    const socket = getSocket();

    const onMsg = (msg) => {
      if (msg.channel === 'public') {
        dispatch({ type: 'NEW_PUBLIC', msg });
      } else {
        const peerId = msg.senderId === selfId ? msg.recipientId : msg.senderId;
        const isActive = activePeerIdRef?.current === peerId;
        dispatch({ type: 'NEW_DM', msg, selfId, isActive });
        // 如果這個對話正打開、且訊息是別人寄來，立即標 read（讓未讀計數同步）
        if (isActive && msg.senderId !== selfId) {
          socket.emit(MSG.CHAT_READ, { peerId });
          dispatch({ type: 'MARK_READ', peerId });
        }
      }
    };
    const onHistoryRes = ({ peerId, messages, hasMore }) => {
      if (peerId) {
        dispatch({ type: 'DM_HISTORY', peerId, messages, hasMore, older: false });
      } else {
        dispatch({ type: 'PUBLIC_HISTORY', messages, hasMore, older: false });
      }
    };
    const onUnread = ({ byPeer }) => {
      dispatch({ type: 'UNREAD_BULK', byPeer });
    };
    const onPresence = ({ online }) => {
      dispatch({ type: 'PRESENCE', list: online });
      dispatch({ type: 'PRESENCE_RESOLVE_NAMES', list: online });
    };
    const onError = (e) => {
      if (e?.code?.startsWith?.('chat_')) dispatch({ type: 'ERROR', code: e.code });
    };

    socket.on(MSG.CHAT_MSG, onMsg);
    socket.on(MSG.CHAT_HISTORY_RES, onHistoryRes);
    socket.on(MSG.CHAT_UNREAD, onUnread);
    socket.on(MSG.CHAT_PRESENCE, onPresence);
    socket.on(MSG.ERROR, onError);

    return () => {
      socket.off(MSG.CHAT_MSG, onMsg);
      socket.off(MSG.CHAT_HISTORY_RES, onHistoryRes);
      socket.off(MSG.CHAT_UNREAD, onUnread);
      socket.off(MSG.CHAT_PRESENCE, onPresence);
      socket.off(MSG.ERROR, onError);
    };
  }, [selfId, activePeerIdRef]);

  // 第一次 mount 時拉公開頻道歷史（連線後）
  useEffect(() => {
    if (!selfId || initRef.current) return;
    const socket = getSocket();
    const fire = () => {
      if (initRef.current) return;
      initRef.current = true;
      socket.emit(MSG.CHAT_HISTORY_REQ, {});
    };
    if (socket.connected) fire();
    else socket.once('connect', fire);
    return () => socket.off('connect', fire);
  }, [selfId]);

  const send = useCallback((channel, recipientId, content) => {
    const socket = getSocket();
    socket.emit(MSG.CHAT_SEND, { channel, recipientId, content });
  }, []);

  const requestPublicHistory = useCallback((before) => {
    getSocket().emit(MSG.CHAT_HISTORY_REQ, before ? { before } : {});
  }, []);

  const requestDmHistory = useCallback((peerId, before) => {
    getSocket().emit(MSG.CHAT_HISTORY_REQ, before ? { peerId, before } : { peerId });
  }, []);

  const openDm = useCallback((peerId, displayName) => {
    dispatch({ type: 'OPEN_DM', peerId, displayName: displayName ?? '' });
    getSocket().emit(MSG.CHAT_HISTORY_REQ, { peerId });
  }, []);

  const closeDm = useCallback((peerId) => {
    dispatch({ type: 'CLOSE_DM', peerId });
  }, []);

  const markRead = useCallback((peerId) => {
    getSocket().emit(MSG.CHAT_READ, { peerId });
    dispatch({ type: 'MARK_READ', peerId });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  return { state, send, requestPublicHistory, requestDmHistory, openDm, closeDm, markRead, clearError };
}
