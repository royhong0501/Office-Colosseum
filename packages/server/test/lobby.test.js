import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../src/lobby.js';
import { MAX_PLAYERS, ALL_CHARACTERS } from '@office-colosseum/shared';

// Stub io — addBot/removeBot 會呼叫 broadcast() → io.emit()
function makeIo() {
  const emitted = [];
  return { emit: (event, payload) => emitted.push({ event, payload }), emitted };
}

test('addBot: 非 host 呼叫回 not_host', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const result = lobby.addBot('socket-guest');
  assert.deepEqual(result, { error: 'not_host' });
  assert.equal(lobby.players.size, 2);
});

test('addBot: lobby 滿了回 lobby_full', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  for (let i = 0; i < MAX_PLAYERS; i++) lobby.join(`s${i}`, `P${i}`);
  const result = lobby.addBot('s0');
  assert.deepEqual(result, { error: 'lobby_full' });
  assert.equal(lobby.players.size, MAX_PLAYERS);
});

test('addBot: host 呼叫成功、entry 有 isBot/ready/characterId/isHost: false', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const result = lobby.addBot('socket-host');
  assert.equal(result.ok, true);
  assert.ok(result.botId.startsWith('bot-'));
  const bot = lobby.players.get(result.botId);
  assert.equal(bot.isBot, true);
  assert.equal(bot.ready, true);
  assert.equal(bot.isHost, false);
  assert.ok(ALL_CHARACTERS.some(c => c.id === bot.characterId), 'characterId 必須是合法角色');
  assert.equal(bot.name, 'Bot-1');
});

test('addBot: 連加 3 個，id 與 name 都跟著 seq', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const r1 = lobby.addBot('socket-host');
  const r2 = lobby.addBot('socket-host');
  const r3 = lobby.addBot('socket-host');
  assert.equal(r1.botId, 'bot-1');
  assert.equal(r2.botId, 'bot-2');
  assert.equal(r3.botId, 'bot-3');
  assert.equal(lobby.players.get('bot-2').name, 'Bot-2');
});

test('removeBot: 非 host 回 not_host', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const addResult = lobby.addBot('socket-host');
  const result = lobby.removeBot('socket-guest', addResult.botId);
  assert.deepEqual(result, { error: 'not_host' });
  assert.equal(lobby.players.has(addResult.botId), true);
});

test('removeBot: 目標不是 bot 回 not_bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  lobby.join('socket-guest', 'Guest');
  const result = lobby.removeBot('socket-host', 'socket-guest');
  assert.deepEqual(result, { error: 'not_bot' });
  assert.equal(lobby.players.has('socket-guest'), true);
});

test('removeBot: host 成功移除 bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const addResult = lobby.addBot('socket-host');
  const result = lobby.removeBot('socket-host', addResult.botId);
  assert.deepEqual(result, { ok: true });
  assert.equal(lobby.players.has(addResult.botId), false);
});

test('removeBot: 不存在的 botId 回 not_bot', () => {
  const io = makeIo();
  const lobby = new Lobby(io);
  lobby.join('socket-host', 'Host');
  const result = lobby.removeBot('socket-host', 'bot-999');
  assert.deepEqual(result, { error: 'not_bot' });
});
