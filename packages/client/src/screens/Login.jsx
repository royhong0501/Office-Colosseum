// 登入頁。SheetWindow 外殼 + username/password 表單。
// 走 POST /auth/login；成功後呼叫 onLoggedIn(user)。

import React, { useState } from 'react';
import SheetWindow from '../components/SheetWindow.jsx';
import { login } from '../lib/auth.js';
import { reconnectSocket } from '../net/socket.js';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const user = await login(username.trim(), password);
      reconnectSocket();
      onLoggedIn?.(user);
    } catch (err) {
      if (err.status === 423) {
        setError(`登入嘗試過於頻繁，請 ${err.retryAfter}s 後再試`);
      } else if (err.message === 'invalid_credentials') {
        setError('帳號或密碼不正確');
      } else if (err.message === 'bad_input') {
        setError('輸入格式錯誤');
      } else {
        setError(`登入失敗：${err.message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetWindow
      fileName="登入.xlsx — HiiiCalc"
      cellRef="A1"
      formula={`=AUTH("${username || '___'}")`}
      tabs={[{ id: 'login', label: '登入' }]}
      activeTab="login"
      statusLeft="未登入 — 請輸入由管理員發放的帳號與密碼"
      statusRight="安全模式 / SECURE"
      fullscreen
    >
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-paper)', padding: 32,
      }}>
        <form onSubmit={submit} style={{
          width: 360, background: 'var(--bg-paper-alt)',
          border: '1px solid var(--line-soft)', padding: '20px 22px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{
            fontSize: 10, color: 'var(--ink-muted)', letterSpacing: 1,
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
          }}>
            <span style={{
              background: 'var(--accent)', color: 'var(--bg-paper)',
              padding: '1px 6px', fontFamily: 'var(--font-mono)', fontSize: 9,
            }}>fx</span>
            <span>OFFICE COLOSSEUM / 員工登入</span>
          </div>
          <div style={{ fontSize: 22, color: 'var(--ink)', fontWeight: 600, letterSpacing: 1 }}>
            登入
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
            僅授權員工可進入系統。請使用主管發放的帳號與初始密碼登入。
          </div>

          <Field label="員工編號 / USERNAME">
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={64}
            />
          </Field>

          <Field label="安全代碼 / PASSWORD">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={256}
            />
          </Field>

          {error && (
            <div style={{
              fontSize: 11, color: 'var(--accent-danger)',
              background: 'var(--bg-input)', border: '1px solid var(--accent-danger)',
              padding: '6px 8px', fontFamily: 'var(--font-mono)',
            }}>
              #ERROR! {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            style={{
              marginTop: 4, padding: '8px 12px',
              background: busy ? 'var(--bg-cell-header)' : 'var(--accent)',
              color: 'var(--bg-paper)', border: '1px solid var(--accent)',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
              letterSpacing: 1, cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '驗證中…' : '登入'}
          </button>

          <div style={{
            fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            borderTop: '1px dashed var(--line-soft)', paddingTop: 8, marginTop: 4,
          }}>
            首次登入後請聯繫管理員修改密碼。連續輸錯密碼會觸發 5 分鐘鎖定。
          </div>
        </form>
      </div>
    </SheetWindow>
  );
}

function Field({ label, children }) {
  // 把 input 的標準樣式統一塞給 children 上
  const styled = {
    background: 'var(--bg-input)',
    border: '1px solid var(--line-soft)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono)', fontSize: 12,
    padding: '6px 8px', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9, color: 'var(--ink-muted)', letterSpacing: 1,
        fontFamily: 'var(--font-mono)',
      }}>{label}</span>
      {/* clone child 並合併 style */}
      {React.Children.map(children, (c) => React.cloneElement(c, {
        style: { ...styled, ...(c.props.style || {}) },
      }))}
    </label>
  );
}
