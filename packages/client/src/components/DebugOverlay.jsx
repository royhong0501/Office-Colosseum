// Debug overlay：F3 切顯，固定右下角。仿 SheetWindow 儲存格風格。
// 顯示三項：FPS（rAF 幀率）、PING（client→server→ack 來回）、DROP25（每秒 > 25ms 的幀）。
//
// visible=false 時整段 useEffect 不執行（沒 rAF、沒 interval、沒 ping），0 成本。

import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket.js';

export default function DebugOverlay({ visible }) {
  const [stats, setStats] = useState({ fps: 0, ping: null, drop25: 0 });

  useEffect(() => {
    if (!visible) return undefined;

    let frames = 0, drops25 = 0, lastFrame = 0, rafId = 0;
    let pingMs = null;
    // 滾動平均，避免單次抽風讓 PING 跳；最近 5 次取平均
    const pingSamples = [];

    const measureFrame = () => {
      const now = performance.now();
      if (lastFrame) {
        const delta = now - lastFrame;
        frames++;
        if (delta > 25) drops25++;
      }
      lastFrame = now;
      rafId = requestAnimationFrame(measureFrame);
    };
    rafId = requestAnimationFrame(measureFrame);

    const reportTimer = setInterval(() => {
      setStats({ fps: frames, ping: pingMs, drop25: drops25 });
      frames = 0;
      drops25 = 0;
    }, 1000);

    const pingTimer = setInterval(() => {
      const sock = getSocket();
      if (!sock?.connected) { pingMs = null; return; }
      const t0 = performance.now();
      // 第二參數的 ack callback 在 server 收到並回 ack 時觸發
      sock.timeout(2000).emit('ping_diag', null, (err) => {
        if (err) return;  // 超時不更新
        const rtt = performance.now() - t0;
        pingSamples.push(rtt);
        if (pingSamples.length > 5) pingSamples.shift();
        const avg = pingSamples.reduce((s, v) => s + v, 0) / pingSamples.length;
        pingMs = Math.round(avg);
      });
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(reportTimer);
      clearInterval(pingTimer);
    };
  }, [visible]);

  if (!visible) return null;

  const fpsBad = stats.fps > 0 && stats.fps < 55;
  const pingBad = stats.ping != null && stats.ping > 50;
  const dropBad = stats.drop25 > 0;

  return (
    <div style={{
      position: 'fixed',
      bottom: 12,
      right: 12,
      zIndex: 9999,
      width: 140,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      background: 'var(--bg-paper)',
      border: '1px solid var(--line)',
      boxShadow: '1px 1px 0 var(--line-soft)',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <div style={{
        background: 'var(--bg-chrome)',
        borderBottom: '1px solid var(--line)',
        padding: '2px 6px',
        color: 'var(--ink-soft)',
      }}>
        <span style={{ color: 'var(--accent-link)' }}>=DEBUG</span>()
      </div>
      <Row label="FPS"    value={stats.fps}                 bad={fpsBad} />
      <Row label="PING"   value={stats.ping == null ? '--' : `${stats.ping}ms`} bad={pingBad} />
      <Row label="DROP25" value={stats.drop25}              bad={dropBad} />
    </div>
  );
}

function Row({ label, value, bad }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '60px 1fr',
      borderBottom: '1px solid var(--line-soft)',
    }}>
      <div style={{
        padding: '3px 6px',
        color: 'var(--ink-muted)',
        borderRight: '1px solid var(--line-soft)',
        background: 'var(--bg-chrome)',
      }}>{label}</div>
      <div style={{
        padding: '3px 6px',
        textAlign: 'right',
        color: bad ? 'var(--accent-danger)' : 'var(--ink)',
      }}>{value}</div>
    </div>
  );
}
