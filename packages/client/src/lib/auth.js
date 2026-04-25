// Auth client：JWT token 管理 + fetchAuthed helper + 當前使用者快取。
// token 存 localStorage（key oc.token），user 解 token payload + /auth/me 校正。

const TOKEN_KEY = 'oc.token';
const USER_KEY = 'oc.user';

let cachedUser = null;

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function setCurrentUser(user) {
  cachedUser = user || null;
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
}

export function getCurrentUser() {
  if (cachedUser) return cachedUser;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) cachedUser = JSON.parse(raw);
  } catch {}
  return cachedUser;
}

export function isAuthed() {
  return !!getToken();
}

export function isAdmin() {
  return getCurrentUser()?.role === 'ADMIN';
}

export async function login(username, password) {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    err.retryAfter = data.retryAfter;
    throw err;
  }
  const data = await res.json();
  setToken(data.token);
  setCurrentUser(data.user);
  return data.user;
}

export async function logout() {
  const token = getToken();
  if (token) {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  setToken(null);
  setCurrentUser(null);
}

// 帶 Authorization header 打 internal API
export async function fetchAuthed(url, opts = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    setToken(null); setCurrentUser(null);
    throw new Error('unauthorized');
  }
  return res;
}

// 啟動時呼叫一次：用既有 token 校正當前使用者。失敗則清掉。
export async function refreshMe() {
  if (!getToken()) return null;
  try {
    const res = await fetchAuthed('/auth/me');
    if (!res.ok) throw new Error('http');
    const u = await res.json();
    setCurrentUser(u);
    return u;
  } catch {
    setToken(null); setCurrentUser(null);
    return null;
  }
}

export async function updateDisplayName(displayName) {
  const res = await fetchAuthed('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error('update_failed');
  const data = await res.json();
  const cur = getCurrentUser();
  if (cur) setCurrentUser({ ...cur, displayName: data.displayName });
  return data;
}
