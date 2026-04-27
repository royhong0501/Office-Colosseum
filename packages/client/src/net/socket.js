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
    if (typeof window !== 'undefined') {
      window.__OC_SOCKET__ = socket;
      installDiag(socket);
    }
  }
  return socket;
}

// DevTools 防貼功能會擋使用者貼 diag 程式，所以把它做進 code，
// 在 console 打 `__OC_DIAG_START()` 就會開始量；`__OC_DIAG_STOP()` 停止。
// 量 INPUT 上行頻率、SNAPSHOT 下行頻率、單則 byte 大小、相鄰 snapshot 的 gap 分布。
function installDiag(socket) {
  let running = false;
  let inputCnt = 0, snapCnt = 0, snapBytes = 0, lastAt = 0;
  let gaps = [];
  // Frame drop 量測：60Hz 理想幀間隔 16.7ms，超過 25ms 算掉幀（慢於 40fps）；
  // 超過 50ms 是肉眼可見的「卡」。
  let frameCount = 0, frameDrops25 = 0, frameDrops50 = 0, lastFrame = 0;
  let frameWorst = 0;
  let timer = null, rafId = 0;
  let origEmit = null;
  const onSnap = (snap) => {
    snapCnt++;
    snapBytes += JSON.stringify(snap).length;
    const now = performance.now();
    if (lastAt) gaps.push(now - lastAt);
    lastAt = now;
  };
  const measureFrame = () => {
    const now = performance.now();
    if (lastFrame) {
      const delta = now - lastFrame;
      frameCount++;
      if (delta > 25) frameDrops25++;
      if (delta > 50) frameDrops50++;
      if (delta > frameWorst) frameWorst = delta;
    }
    lastFrame = now;
    rafId = requestAnimationFrame(measureFrame);
  };
  window.__OC_DIAG_START = () => {
    if (running) { console.log('[diag] already running'); return; }
    running = true;
    inputCnt = snapCnt = snapBytes = lastAt = 0;
    gaps = [];
    frameCount = frameDrops25 = frameDrops50 = lastFrame = 0;
    frameWorst = 0;
    origEmit = socket.emit.bind(socket);
    socket.emit = function (ev, ...args) {
      if (ev === 'input') inputCnt++;
      return origEmit(ev, ...args);
    };
    socket.on('snapshot', onSnap);
    rafId = requestAnimationFrame(measureFrame);
    timer = setInterval(() => {
      gaps.sort((a, b) => a - b);
      const p50 = gaps[Math.floor(gaps.length * 0.5)] ?? 0;
      const p95 = gaps[Math.floor(gaps.length * 0.95)] ?? 0;
      const max = gaps[gaps.length - 1] ?? 0;
      console.log(
        `[diag] in=${inputCnt}/s snap=${snapCnt}/s bytes=${snapCnt ? Math.round(snapBytes/snapCnt) : 0} `
        + `gap p50=${p50.toFixed(0)} p95=${p95.toFixed(0)} max=${max.toFixed(0)}ms `
        + `frames=${frameCount} drop25=${frameDrops25} drop50=${frameDrops50} worst=${frameWorst.toFixed(0)}ms`,
      );
      inputCnt = snapCnt = snapBytes = 0; gaps = [];
      frameCount = frameDrops25 = frameDrops50 = 0; frameWorst = 0;
    }, 1000);
    console.log('[diag] started — 一秒一行；停止：__OC_DIAG_STOP()');
  };
  window.__OC_DIAG_STOP = () => {
    if (!running) { console.log('[diag] not running'); return; }
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(rafId);
    socket.off('snapshot', onSnap);
    if (origEmit) socket.emit = origEmit;
    console.log('[diag] stopped');
  };
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
