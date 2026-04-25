// Admin 後台：列使用者、新增帳號、停用、重設密碼。
// 僅 ADMIN role 可進入；非 ADMIN 由 App router 擋住。

import React, { useEffect, useState } from 'react';
import SheetWindow from '../components/SheetWindow.jsx';
import { fetchAuthed, getCurrentUser } from '../lib/auth.js';

const inputStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--line-soft)',
  color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12,
  padding: '5px 7px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const btn = (kind = 'normal') => ({
  padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-ui)',
  background: kind === 'primary' ? 'var(--accent)'
            : kind === 'danger' ? 'var(--accent-danger)'
            : 'var(--bg-paper)',
  color: kind === 'normal' ? 'var(--ink)' : 'var(--bg-paper)',
  border: `1px solid ${kind === 'normal' ? 'var(--line-soft)' : 'transparent'}`,
  cursor: 'pointer', letterSpacing: 0.5,
});

export default function AdminPanel({ onBack }) {
  const me = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', displayName: '', role: 'PLAYER' });

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAuthed('/admin/users');
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetchAuthed('/admin/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `http_${res.status}`);
      }
      setCreateForm({ username: '', password: '', displayName: '', role: 'PLAYER' });
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleDisabled = async (u) => {
    setError(null);
    try {
      const res = await fetchAuthed(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: !u.disabled }),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetPwd = async (u) => {
    const pwd = window.prompt(`為 ${u.username} 設定新密碼（至少 6 字）：`);
    if (!pwd || pwd.length < 6) return;
    setError(null);
    try {
      const res = await fetchAuthed(`/admin/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: pwd }),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      window.alert(`已重設 ${u.username} 的密碼，該帳號現有 token 已全部失效`);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <SheetWindow
      fileName="使用者管理.xlsx — 管理員專屬"
      cellRef="A1"
      formula={`=ADMIN.LIST_USERS()`}
      tabs={[{ id: 'users', label: '使用者' }]}
      activeTab="users"
      statusLeft={`Admin: ${me?.username ?? '—'} | 共 ${users.length} 位使用者`}
      statusRight={busy ? '載入中…' : '就緒'}
      fullscreen
    >
      <div style={{
        flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16,
        background: 'var(--bg-paper)', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={onBack} style={btn()}>← 返回主選單</button>
          <button type="button" onClick={reload} style={btn()}>重新整理</button>
          {error && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-danger)',
            }}>#ERROR! {error}</span>
          )}
        </div>

        {/* 新增帳號表單 */}
        <form onSubmit={create} style={{
          background: 'var(--bg-paper-alt)', border: '1px solid var(--line-soft)',
          padding: '14px 16px', display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 100px 100px',
          gap: 8, alignItems: 'end',
        }}>
          <Field label="USERNAME">
            <input
              required minLength={3} maxLength={64}
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="PASSWORD">
            <input
              required minLength={6} maxLength={256} type="text"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="DISPLAY NAME">
            <input
              maxLength={16} placeholder="留空則同 USERNAME"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="ROLE">
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              style={inputStyle}
            >
              <option value="PLAYER">PLAYER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </Field>
          <button type="submit" style={btn('primary')}>新增</button>
        </form>

        {/* 使用者列表 */}
        <div style={{ border: '1px solid var(--line-soft)', background: 'var(--bg-input)' }}>
          <div style={{
            padding: '8px 12px', background: 'var(--bg-cell-header)',
            borderBottom: '1px solid var(--line-soft)',
            display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr 1fr 1.2fr 200px',
            fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
          }}>
            <span>USERNAME</span>
            <span>DISPLAY NAME</span>
            <span>ROLE</span>
            <span>STATUS</span>
            <span>LAST LOGIN</span>
            <span style={{ textAlign: 'right' }}>操作</span>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 11, color: 'var(--ink-muted)' }}>
              #N/A — 尚無使用者
            </div>
          ) : users.map((u, i) => (
            <div key={u.id} style={{
              padding: '8px 12px',
              borderBottom: i < users.length - 1 ? '1px solid var(--line-soft)' : 'none',
              display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr 1fr 1.2fr 200px',
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
              alignItems: 'center',
              opacity: u.disabled ? 0.5 : 1,
            }}>
              <span>{u.username}</span>
              <span>{u.displayName}</span>
              <span style={{
                color: u.role === 'ADMIN' ? 'var(--accent)' : 'var(--ink-soft)',
                fontWeight: 600, letterSpacing: 0.5,
              }}>{u.role}</span>
              <span style={{ color: u.disabled ? 'var(--accent-danger)' : 'var(--ink-soft)' }}>
                {u.disabled ? 'DISABLED' : 'ACTIVE'}
              </span>
              <span style={{ color: 'var(--ink-muted)' }}>
                {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
              </span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => toggleDisabled(u)}
                  disabled={u.id === me?.id}
                  style={btn(u.disabled ? 'normal' : 'danger')}
                >
                  {u.disabled ? '啟用' : '停用'}
                </button>
                <button
                  type="button"
                  onClick={() => resetPwd(u)}
                  style={btn()}
                >重設密碼</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SheetWindow>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9, color: 'var(--ink-muted)', letterSpacing: 1,
        fontFamily: 'var(--font-mono)',
      }}>{label}</span>
      {children}
    </label>
  );
}
