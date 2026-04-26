// chatHandlers 單元測試（無 DB 需求）：
// - 多 socket 同 userId 時 presence ref-count 正確
// - 中途斷線一條不誤刪別人 / 全斷才從 presence 移除
// - CHAT_SEND public / dm 廣播路徑正確
// - CHAT_SEND 錯誤分支：ChatValidationError → MSG.ERROR(code)；RateLimitError → chat_rate_limited
// - CHAT_HISTORY_REQ 公開 / DM 路由
//
// 不碰 DB —— chatService 用 stub 注入；錯誤實例引用真正的 class 以滿足 instanceof 檢查。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MSG } from '@office-colosseum/shared';
import { registerChatHandlers } from '../src/chatHandlers.js';
import { ChatValidationError } from '../src/services/chatService.js';
import { RateLimitError } from '../src/services/rateLimiter.js';

// ---- 測試輔助：fake io / socket ----

function makeIo() {
  const calls = []; // { room, event, payload }
  return {
    to(room) {
      return {
        emit(event, payload) { calls.push({ room, event, payload }); },
      };
    },
    calls,
    last(event) { return [...calls].reverse().find((c) => c.event === event); },
    allOf(event) { return calls.filter((c) => c.event === event); },
  };
}

function makeSocket(id, user) {
  const handlers = new Map(); // event -> fn
  const directEmits = []; // { event, payload }
  const joined = new Set();
  return {
    id,
    data: { user },
    join(room) { joined.add(room); },
    leave() {},
    on(event, fn) { handlers.set(event, fn); },
    emit(event, payload) { directEmits.push({ event, payload }); },
    async trigger(event, payload) {
      const fn = handlers.get(event);
      if (!fn) throw new Error(`no handler for ${event}`);
      await fn(payload);
    },
    handlers, directEmits, joined,
  };
}

function makeChatStub(overrides = {}) {
  return {
    sendMessage: async () => ({ id: 'msg1', channel: 'public', senderId: 'x', recipientId: null, content: 'hi', createdAt: 1, readAt: null, senderName: 'X' }),
    getPublicHistory: async () => ({ messages: [], hasMore: false }),
    getDmHistory: async () => ({ messages: [], hasMore: false }),
    markDmRead: async () => ({ updated: 0 }),
    getUnreadCounts: async () => ({ byPeer: {} }),
    ...overrides,
  };
}

const newUser = (label) => ({ id: `u-${label}-${randomUUID().slice(0, 8)}`, displayName: `User-${label}`, username: `u_${label}`, role: 'PLAYER' });

// 給 microtask 一個 tick 跑完（getUnreadCounts.then 與 socket handler 都是 async）
const tick = () => new Promise((r) => setImmediate(r));

// ---- Tests ----

test('connection: 加入 chat:public 與 chat:user:<id> rooms，broadcast presence', async () => {
  const io = makeIo();
  const u = newUser('a');
  const s = makeSocket('sk1', u);
  registerChatHandlers(io, s, { chatService: makeChatStub() });

  assert.equal(s.joined.has('chat:public'), true);
  assert.equal(s.joined.has(`chat:user:${u.id}`), true);

  const presence = io.last(MSG.CHAT_PRESENCE);
  assert.ok(presence, 'should broadcast presence');
  assert.equal(presence.room, 'chat:public');
  assert.deepEqual(
    presence.payload.online.find((o) => o.userId === u.id),
    { userId: u.id, displayName: u.displayName },
  );
});

test('connection: 上線後 socket.emit CHAT_UNREAD（從 stub 取）', async () => {
  const io = makeIo();
  const u = newUser('b');
  const s = makeSocket('sk1', u);
  const chatService = makeChatStub({ getUnreadCounts: async () => ({ byPeer: { peer1: 3 } }) });
  registerChatHandlers(io, s, { chatService });

  await tick();

  const unread = s.directEmits.find((e) => e.event === MSG.CHAT_UNREAD);
  assert.deepEqual(unread?.payload, { byPeer: { peer1: 3 } });
});

test('多 socket 同 userId：presence 只列一筆（去重）', async () => {
  const io = makeIo();
  const u = newUser('c');
  const s1 = makeSocket('skA', u);
  const s2 = makeSocket('skB', u);

  registerChatHandlers(io, s1, { chatService: makeChatStub() });
  registerChatHandlers(io, s2, { chatService: makeChatStub() });

  const last = io.last(MSG.CHAT_PRESENCE);
  const occurrences = last.payload.online.filter((o) => o.userId === u.id);
  assert.equal(occurrences.length, 1, 'same user should appear once even with two sockets');
});

test('disconnect 一條 socket：另一條還在時不從 presence 移除', async () => {
  const io = makeIo();
  const u = newUser('d');
  const s1 = makeSocket('skA', u);
  const s2 = makeSocket('skB', u);
  registerChatHandlers(io, s1, { chatService: makeChatStub() });
  registerChatHandlers(io, s2, { chatService: makeChatStub() });

  // 第一條斷
  await s1.trigger('disconnect');

  const last = io.last(MSG.CHAT_PRESENCE);
  const stillThere = last.payload.online.some((o) => o.userId === u.id);
  assert.equal(stillThere, true, 'user still online via second socket');
});

test('全部 socket 斷線：從 presence 移除', async () => {
  const io = makeIo();
  const u = newUser('e');
  const s1 = makeSocket('skA', u);
  const s2 = makeSocket('skB', u);
  registerChatHandlers(io, s1, { chatService: makeChatStub() });
  registerChatHandlers(io, s2, { chatService: makeChatStub() });

  await s1.trigger('disconnect');
  await s2.trigger('disconnect');

  const last = io.last(MSG.CHAT_PRESENCE);
  const found = last.payload.online.some((o) => o.userId === u.id);
  assert.equal(found, false, 'user should be removed after all sockets disconnect');
});

test('CHAT_SEND public：io.to(chat:public).emit(CHAT_MSG)', async () => {
  const io = makeIo();
  const u = newUser('f');
  const s = makeSocket('sk1', u);
  const fakeMsg = { id: 'm1', channel: 'public', senderId: u.id, recipientId: null, content: 'hi all', createdAt: 1, readAt: null, senderName: u.displayName };
  const chatService = makeChatStub({ sendMessage: async () => fakeMsg });
  registerChatHandlers(io, s, { chatService });

  io.calls.length = 0; // 清掉 connection 時的 presence broadcast
  await s.trigger(MSG.CHAT_SEND, { channel: 'public', content: 'hi all' });

  const msgs = io.allOf(MSG.CHAT_MSG);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].room, 'chat:public');
  assert.deepEqual(msgs[0].payload, fakeMsg);
});

test('CHAT_SEND dm：io.to(chat:user:recipient).emit + socket.emit echo', async () => {
  const io = makeIo();
  const u = newUser('g');
  const s = makeSocket('sk1', u);
  const peerId = 'peer-xyz';
  const fakeMsg = { id: 'm2', channel: 'dm', senderId: u.id, recipientId: peerId, content: 'hi peer', createdAt: 1, readAt: null, senderName: u.displayName, recipientName: 'Peer' };
  const chatService = makeChatStub({ sendMessage: async () => fakeMsg });
  registerChatHandlers(io, s, { chatService });

  io.calls.length = 0;
  s.directEmits.length = 0;
  await s.trigger(MSG.CHAT_SEND, { channel: 'dm', recipientId: peerId, content: 'hi peer' });

  const ioMsgs = io.allOf(MSG.CHAT_MSG);
  assert.equal(ioMsgs.length, 1, 'one io.to broadcast');
  assert.equal(ioMsgs[0].room, `chat:user:${peerId}`);

  const echo = s.directEmits.find((e) => e.event === MSG.CHAT_MSG);
  assert.deepEqual(echo?.payload, fakeMsg, 'sender 自己也收到 echo');
});

test('CHAT_SEND ChatValidationError：socket.emit MSG.ERROR with code', async () => {
  const io = makeIo();
  const u = newUser('h');
  const s = makeSocket('sk1', u);
  const chatService = makeChatStub({
    sendMessage: async () => { throw new ChatValidationError('chat_too_long'); },
  });
  registerChatHandlers(io, s, { chatService });

  s.directEmits.length = 0;
  await s.trigger(MSG.CHAT_SEND, { channel: 'public', content: 'x'.repeat(9999) });

  const err = s.directEmits.find((e) => e.event === MSG.ERROR);
  assert.equal(err?.payload.code, 'chat_too_long');
});

test('CHAT_SEND RateLimitError：socket.emit MSG.ERROR chat_rate_limited', async () => {
  const io = makeIo();
  const u = newUser('i');
  const s = makeSocket('sk1', u);
  const chatService = makeChatStub({
    sendMessage: async () => { throw new RateLimitError(2); },
  });
  registerChatHandlers(io, s, { chatService });

  s.directEmits.length = 0;
  await s.trigger(MSG.CHAT_SEND, { channel: 'public', content: 'spam' });

  const err = s.directEmits.find((e) => e.event === MSG.ERROR);
  assert.equal(err?.payload.code, 'chat_rate_limited');
});

test('CHAT_HISTORY_REQ：無 peerId 走 getPublicHistory；有 peerId 走 getDmHistory', async () => {
  const io = makeIo();
  const u = newUser('j');
  const s = makeSocket('sk1', u);
  const calls = [];
  const chatService = makeChatStub({
    getPublicHistory: async (args) => { calls.push({ kind: 'public', args }); return { messages: ['p'], hasMore: false }; },
    getDmHistory: async (args) => { calls.push({ kind: 'dm', args }); return { messages: ['d'], hasMore: false }; },
  });
  registerChatHandlers(io, s, { chatService });

  s.directEmits.length = 0;
  await s.trigger(MSG.CHAT_HISTORY_REQ, {});
  await s.trigger(MSG.CHAT_HISTORY_REQ, { peerId: 'pX' });

  assert.equal(calls[0].kind, 'public');
  assert.equal(calls[1].kind, 'dm');
  assert.equal(calls[1].args.userId, u.id);
  assert.equal(calls[1].args.peerId, 'pX');

  const responses = s.directEmits.filter((e) => e.event === MSG.CHAT_HISTORY_RES);
  assert.equal(responses.length, 2);
  assert.equal(responses[0].payload.peerId, null);
  assert.equal(responses[1].payload.peerId, 'pX');
});

test('CHAT_READ：呼叫 markDmRead 並帶入 userId/peerId', async () => {
  const io = makeIo();
  const u = newUser('k');
  const s = makeSocket('sk1', u);
  let recorded = null;
  const chatService = makeChatStub({
    markDmRead: async (args) => { recorded = args; return { updated: 1 }; },
  });
  registerChatHandlers(io, s, { chatService });

  await s.trigger(MSG.CHAT_READ, { peerId: 'pZ' });
  assert.deepEqual(recorded, { userId: u.id, peerId: 'pZ' });
});

test('socket.data.user 為空時 registerChatHandlers 立即 return（不掛 handler）', () => {
  const io = makeIo();
  const s = makeSocket('skX', null);
  registerChatHandlers(io, s, { chatService: makeChatStub() });
  assert.equal(s.handlers.size, 0);
  assert.equal(s.joined.size, 0);
});
