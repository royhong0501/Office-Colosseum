// ⚠️ 第二階段多房間預留。見 room.js 頂部註解。
// socketHandlers.js 目前沒引用本檔。

import { MSG, MAX_PLAYERS } from '@office-colosseum/shared';
import { Room } from './room.js';

const HALL = 'hall';
const MAX_ROOMS = 32;
const MAX_NAME_LEN = 24;

function sanitizeName(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_NAME_LEN);
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();              // roomId -> Room
    this.socketToRoom = new Map();       // socketId -> roomId
    this.nextSeq = 1;
  }

  // ---- 查詢 ----
  getRoomForSocket(socketId) {
    const rid = this.socketToRoom.get(socketId);
    return rid ? this.rooms.get(rid) ?? null : null;
  }
  list() {
    return [...this.rooms.values()].map((r) => r.summary());
  }

  // ---- 大廳 ----
  attachToHall(socket) {
    socket.join(HALL);
  }
  broadcastList() {
    this.io.to(HALL).emit(MSG.ROOMS_LIST, { rooms: this.list() });
  }
  sendListTo(socket) {
    socket.emit(MSG.ROOMS_LIST, { rooms: this.list() });
  }

  // ---- 建房 / 入房 / 離房 ----
  createRoom(socket, payload) {
    if (this.rooms.size >= MAX_ROOMS) return { error: 'too_many_rooms' };
    const id = `room-${this.nextSeq++}`;
    const name = sanitizeName(payload?.roomName, `房間-${id.slice(5)}`);
    const room = new Room(this.io.to(id), id, name);
    this.rooms.set(id, room);
    const join = this.joinRoom(socket, id, { silent: true });
    if (join.error) {
      this.rooms.delete(id);
      return join;
    }
    this.broadcastList();
    return { ok: true, roomId: id, roomName: name };
  }

  joinRoom(socket, roomId, { silent = false } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.match) return { error: 'match_in_progress' };
    if (room.lobby.players.size >= MAX_PLAYERS) return { error: 'room_full' };
    // 如果原本在別的房，先退掉
    const prevId = this.socketToRoom.get(socket.id);
    if (prevId && prevId !== roomId) {
      this._detachFromRoom(socket, prevId);
    }
    socket.leave(HALL);
    socket.join(roomId);
    this.socketToRoom.set(socket.id, roomId);
    socket.emit(MSG.ROOM_JOINED, { roomId, roomName: room.name });
    if (!silent) this.broadcastList();
    return { ok: true, roomId, roomName: room.name };
  }

  leaveRoom(socket) {
    const rid = this.socketToRoom.get(socket.id);
    if (!rid) return;
    this._detachFromRoom(socket, rid);
    socket.join(HALL);
    this.broadcastList();
  }

  handleDisconnect(socket) {
    const rid = this.socketToRoom.get(socket.id);
    if (!rid) return;
    this._detachFromRoom(socket, rid);
    // 不用重新把 socket 放回 hall — 它已經斷線
    this.broadcastList();
  }

  // 內部：從房間卸掉 socket + 視情況清空房
  _detachFromRoom(socket, rid) {
    const room = this.rooms.get(rid);
    if (room) {
      room.lobby.leave(socket.id);
      if (room.match) room.match.setPaused(socket.id, false);
    }
    socket.leave(rid);
    this.socketToRoom.delete(socket.id);
    this._gcRoom(rid);
  }
  _gcRoom(rid) {
    const room = this.rooms.get(rid);
    if (!room) return;
    if (!room.hasHuman() && !room.match) this.rooms.delete(rid);
  }
}
