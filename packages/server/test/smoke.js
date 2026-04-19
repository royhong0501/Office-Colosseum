// packages/server/test/smoke.js
import { io as ioClient } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { MSG, ALL_CHARACTERS } from '@office-colosseum/shared';

const server = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: '3100' }, stdio: 'pipe' });
await new Promise(r => setTimeout(r, 500));  // give it time to boot

const url = 'http://localhost:3100';
const a = ioClient(url), b = ioClient(url);
let lobbyUpdates = 0, matchStarted = false;

function done(err) {
  server.kill();
  a.close(); b.close();
  if (err) { console.error('FAIL:', err); process.exit(1); }
  console.log('SMOKE PASS: lobby updates, match_start received');
  process.exit(0);
}

a.on('connect_error', e => done('a connect: ' + e.message));
b.on('connect_error', e => done('b connect: ' + e.message));

a.on(MSG.LOBBY_STATE, () => lobbyUpdates++);
a.on(MSG.MATCH_START, () => { matchStarted = true; setTimeout(() => {
  if (lobbyUpdates < 4) return done('expected lobby updates, got ' + lobbyUpdates);
  if (!matchStarted) return done('no match_start');
  done();
}, 200); });

await new Promise(r => a.on('connect', r));
await new Promise(r => b.on('connect', r));
a.emit(MSG.JOIN, { name: 'A' });
b.emit(MSG.JOIN, { name: 'B' });
setTimeout(() => {
  a.emit(MSG.PICK, { characterId: ALL_CHARACTERS[0].id });
  b.emit(MSG.PICK, { characterId: ALL_CHARACTERS[1].id });
  a.emit(MSG.READY, { ready: true });
  b.emit(MSG.READY, { ready: true });
  setTimeout(() => a.emit(MSG.START, {}), 100);
}, 200);

setTimeout(() => done('timeout — match_start never fired'), 3000);
