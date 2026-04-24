// ⚠️ 第二階段多房間預留測試。
// socketHandlers.js 目前跑 singleton，但 RoomManager 類別仍可獨立存在、
// 獨立測試，不影響現行流程。第二階段啟用多房間時這些測試直接生效。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
import { MSG } from '@office-colosseum/shared';

// ---- Stubs ----
// io.to(channel).emit(event, payload) — 記錄到 channel 的 emissions
// socket.join/leave/emit 追蹤 socket 自己的狀態
function makeIo() {
  const channelEmits = new Map();  // channel -> [{event, payload}]
  return {
    channelEmits,
    to(channel) {
      return {
        emit(event, payload) {
          if (!channelEmits.has(channel)) channelEmits.set(channel, []);
          channelEmits.get(channel).push({ event, payload });
        },
      };
    },
  };
}
function makeSocket(id) {
  return {
    id,
    rooms: new Set(),
    emitted: [],
    join(r) { this.rooms.add(r); },
    leave(r) { this.rooms.delete(r); },
    emit(event, payload) { this.emitted.push({ event, payload }); },
  };
}

function lastEmit(socket, event) {
  return [...socket.emitted].reverse().find((e) => e.event === event)?.payload;
}

test('createRoom: 第一間房，socket 被放進 room、收到 ROOM_JOINED、hall 收到 ROOMS_LIST', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s1');
  mgr.attachToHall(s);
  assert.ok(s.rooms.has('hall'));

  const r = mgr.createRoom(s, { roomName: 'A-room' });
  assert.equal(r.ok, true);
  assert.equal(r.roomId, 'room-1');
  assert.equal(r.roomName, 'A-room');

  assert.ok(s.rooms.has('room-1'));
  assert.ok(!s.rooms.has('hall'));

  const joined = lastEmit(s, MSG.ROOM_JOINED);
  assert.deepEqual(joined, { roomId: 'room-1', roomName: 'A-room' });

  const hallEmits = io.channelEmits.get('hall') ?? [];
  assert.ok(hallEmits.some((e) => e.event === MSG.ROOMS_LIST));
});

test('createRoom: 房名空字串會用預設「房間-N」', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s1');
  mgr.attachToHall(s);
  const r = mgr.createRoom(s, { roomName: '   ' });
  assert.equal(r.roomName, '房間-1');
});

test('createRoom: nextSeq 連續遞增', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const a = makeSocket('a'); const b = makeSocket('b');
  mgr.attachToHall(a); mgr.attachToHall(b);
  const r1 = mgr.createRoom(a, { roomName: 'A' });
  const r2 = mgr.createRoom(b, { roomName: 'B' });
  assert.equal(r1.roomId, 'room-1');
  assert.equal(r2.roomId, 'room-2');
});

test('joinRoom: 不存在的 roomId 回 room_not_found', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s1');
  mgr.attachToHall(s);
  const r = mgr.joinRoom(s, 'room-999');
  assert.deepEqual(r, { error: 'room_not_found' });
  assert.ok(s.rooms.has('hall'));
});

test('joinRoom: 第二個 socket 成功進入同一房', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const a = makeSocket('a'); const b = makeSocket('b');
  mgr.attachToHall(a); mgr.attachToHall(b);
  const created = mgr.createRoom(a, { roomName: 'R' });
  const r = mgr.joinRoom(b, created.roomId);
  assert.equal(r.ok, true);
  assert.ok(b.rooms.has(created.roomId));
  assert.equal(mgr.getRoomForSocket('b')?.id, created.roomId);
});

test('joinRoom: 房間滿了回 room_full', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const host = makeSocket('host');
  mgr.attachToHall(host);
  const { roomId } = mgr.createRoom(host, { roomName: 'R' });
  const room = mgr.rooms.get(roomId);
  // 注意：createRoom 僅把 socket 放進 socket.io room，不主動呼叫 lobby.join
  // （lobby.join 由 client 的 MSG.JOIN 觸發）。所以從 0 灌到 MAX_PLAYERS。
  for (let i = 0; i < room.summary().maxPlayers; i++) {
    room.lobby.join(`dummy-${i}`, `D${i}`);
  }
  const late = makeSocket('late');
  mgr.attachToHall(late);
  const r = mgr.joinRoom(late, roomId);
  assert.deepEqual(r, { error: 'room_full' });
});

test('joinRoom: 比賽進行中不能加入 (match_in_progress)', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const host = makeSocket('host');
  mgr.attachToHall(host);
  const { roomId } = mgr.createRoom(host, { roomName: 'R' });
  const room = mgr.rooms.get(roomId);
  room.match = { setPaused() {} };  // 粗略塞個 truthy 佔位
  const late = makeSocket('late');
  mgr.attachToHall(late);
  const r = mgr.joinRoom(late, roomId);
  assert.deepEqual(r, { error: 'match_in_progress' });
});

test('leaveRoom: socket 離開後回到 hall、empty 房被清掉', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s');
  mgr.attachToHall(s);
  const { roomId } = mgr.createRoom(s, { roomName: 'R' });
  // 真人加入 lobby（createRoom 沒呼叫 lobby.join，所以手動補）
  mgr.rooms.get(roomId).lobby.join('s', 'S');
  assert.equal(mgr.rooms.size, 1);

  mgr.leaveRoom(s);
  assert.ok(s.rooms.has('hall'));
  assert.equal(mgr.getRoomForSocket('s'), null);
  assert.equal(mgr.rooms.size, 0);  // 沒真人 → 清掉
});

test('leaveRoom: 還有其他真人時房間保留', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const a = makeSocket('a'); const b = makeSocket('b');
  mgr.attachToHall(a); mgr.attachToHall(b);
  const { roomId } = mgr.createRoom(a, { roomName: 'R' });
  mgr.joinRoom(b, roomId);
  mgr.rooms.get(roomId).lobby.join('a', 'A');
  mgr.rooms.get(roomId).lobby.join('b', 'B');

  mgr.leaveRoom(a);
  assert.equal(mgr.rooms.size, 1);
  assert.equal(mgr.getRoomForSocket('b')?.id, roomId);
});

test('handleDisconnect: 清 mapping、清空房', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s');
  mgr.attachToHall(s);
  const { roomId } = mgr.createRoom(s, { roomName: 'R' });
  mgr.rooms.get(roomId).lobby.join('s', 'S');

  mgr.handleDisconnect(s);
  assert.equal(mgr.getRoomForSocket('s'), null);
  assert.equal(mgr.rooms.size, 0);
});

test('list: 回傳 summary 陣列，phase=lobby，playerCount 正確', () => {
  const io = makeIo();
  const mgr = new RoomManager(io);
  const s = makeSocket('s');
  mgr.attachToHall(s);
  const { roomId } = mgr.createRoom(s, { roomName: 'R' });
  mgr.rooms.get(roomId).lobby.join('s', 'S');

  const list = mgr.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, roomId);
  assert.equal(list[0].phase, 'lobby');
  assert.equal(list[0].playerCount, 1);
});
