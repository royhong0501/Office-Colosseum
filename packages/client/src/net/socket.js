import { io } from 'socket.io-client';
import { getToken, setToken, setCurrentUser } from '../lib/auth.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: (cb) => cb({ token: getToken() }),
      // 跟 server `transports: ['websocket']` 對齊，跳過 polling 握手（雲端延遲較低）
      transports: ['websocket'],
    });
    socket.on('connect_error', (err) => {
      // 'unauthorized:*' → token 失效（過期/被 revoke/帳號停用），清狀態讓 App 跳回 Login
      if (typeof err?.message === 'string' && err.message.startsWith('unauthorized')) {
        setToken(null);
        setCurrentUser(null);
        window.dispatchEvent(new CustomEvent('oc:auth-cleared'));
      }
    });
    // 暴露給 DevTools console 做即時診斷（測延遲 / 計 input、snapshot 速率用）
    if (typeof window !== 'undefined') window.__OC_SOCKET__ = socket;
  }
  return socket;
}

// 登入後呼叫（或 token 有更新時）。如果已連線就先斷再重連，這樣 handshake 帶到新 token。
export function reconnectSocket() {
  if (!socket) return getSocket().connect();
  if (socket.connected) socket.disconnect();
  socket.connect();
  return socket;
}

// 登出時呼叫
export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
