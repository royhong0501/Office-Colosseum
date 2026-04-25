// packages/server/test/smoke.js
//
// 端到端 smoke：admin 登入 → admin 建 2 個 player → 兩個 player 用 token 連 socket → 進 lobby → START。
//
// 前置條件（必須先跑起來）：
//   - postgres 與 redis 在本機可連線（docker compose up -d postgres redis）
//   - DATABASE_URL / REDIS_URL / JWT_SECRET 已設好
//   - prisma migrate deploy 已跑過
//   - ADMIN_INITIAL_PASSWORD 已設好且 admin 已 seed（或之後在這支裡建）
//
// 用法：npm run smoke --workspace @office-colosseum/server

import { io as ioClient } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { MSG, ALL_CHARACTERS } from '@office-colosseum/shared';

// Windows 在 Hyper-V dynamic port range（通常 ~50000–60000，但實作會吃到 3xxx 範圍）
// 預留某些 port，所以不能用 3100。13100 在保留範圍外、又夠高不會撞到一般服務。
const PORT = process.env.SMOKE_PORT || '13100';
const URL = `http://localhost:${PORT}`;
const adminUser = process.env.ADMIN_INITIAL_USERNAME || 'admin';
const adminPwd = process.env.ADMIN_INITIAL_PASSWORD;

if (!adminPwd) { console.error('ADMIN_INITIAL_PASSWORD 未設定'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL 未設定'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET 未設定'); process.exit(1); }

const server = spawn(process.execPath, ['src/index.js'], {
  env: { ...process.env, PORT },
  stdio: 'pipe',
});
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));

await new Promise(r => setTimeout(r, 1500));

let pass = false;
function done(err) {
  server.kill();
  if (err) { console.error('FAIL:', err); process.exit(1); }
  if (pass) { console.log('SMOKE PASS'); process.exit(0); }
  process.exit(1);
}

async function loginAs(username, password) {
  const res = await fetch(`${URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status}`);
  return (await res.json()).token;
}

async function ensureUser(adminToken, username, password) {
  // 嘗試建；若 409（已存在）也視為成功
  const res = await fetch(`${URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ username, password, role: 'PLAYER' }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`create ${username} failed: ${res.status}`);
}

try {
  const adminToken = await loginAs(adminUser, adminPwd);
  await ensureUser(adminToken, 'smoke-a', 'smoke-pwd');
  await ensureUser(adminToken, 'smoke-b', 'smoke-pwd');
  const tokenA = await loginAs('smoke-a', 'smoke-pwd');
  const tokenB = await loginAs('smoke-b', 'smoke-pwd');

  const a = ioClient(URL, { auth: { token: tokenA } });
  const b = ioClient(URL, { auth: { token: tokenB } });
  let lobbyUpdates = 0, matchStarted = false;

  a.on('connect_error', e => done('a connect: ' + e.message));
  b.on('connect_error', e => done('b connect: ' + e.message));
  a.on(MSG.LOBBY_STATE, () => lobbyUpdates++);
  a.on(MSG.MATCH_START, () => {
    matchStarted = true;
    setTimeout(() => {
      if (lobbyUpdates < 4) return done('expected lobby updates, got ' + lobbyUpdates);
      if (!matchStarted) return done('no match_start');
      pass = true;
      done();
    }, 200);
  });

  await new Promise(r => a.on('connect', r));
  await new Promise(r => b.on('connect', r));
  a.emit(MSG.JOIN);
  setTimeout(() => b.emit(MSG.JOIN), 30);
  setTimeout(() => {
    a.emit(MSG.PICK, { characterId: ALL_CHARACTERS[0].id });
    b.emit(MSG.PICK, { characterId: ALL_CHARACTERS[1].id });
    a.emit(MSG.READY, { ready: true });
    b.emit(MSG.READY, { ready: true });
    setTimeout(() => a.emit(MSG.START, {}), 100);
  }, 200);

  setTimeout(() => done('timeout — match_start never fired'), 5000);
} catch (e) {
  done(e.message);
}
