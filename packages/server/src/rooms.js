// 多房間管理：建房 / 入房 / 離房 / 觀戰、hall 廣播 ROOMS_LIST。
// 由 socketHandlers.js 在每個 socket 連線時 attachToHall(socket) 自動加入大廳頻道。

import { MSG, MAX_PLAYERS, GAME_TYPES, DEFAULT_GAME_TYPE } from '@office-colosseum/shared';
import { Room } from './room.js';

const HALL = 'hall';
const MAX_ROOMS = 32;
const MAX_NAME_LEN = 24;
const MAX_SPECTATORS_PER_ROOM = 20;

function sanitizeName(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_NAME_LEN);
}

function clampCapacity(raw) {
  const n = Number.isFinite(raw) ? raw | 0 : MAX_PLAYERS;
  return Math.min(Math.max(n, 2), MAX_PLAYERS);
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();              // roomId -> Room
    this.socketToRoom = new Map();       // socketId -> roomId（玩家身份）
    this.socketToSpectate = new Map();   // socketId -> roomId（觀戰身份；與玩家身份互斥）
    this.nextSeq = 1;
  }

  // ---- 查詢 ----
  getRoomForSocket(socketId) {
    const rid = this.socketToRoom.get(socketId);
    return rid ? this.rooms.get(rid) ?? null : null;
  }
  getSpectatedRoom(socketId) {
    const rid = this.socketToSpectate.get(socketId);
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

  // ---- 建房 ----
  createRoom(socket, payload) {
    if (this.rooms.size >= MAX_ROOMS) return { error: 'too_many_rooms' };

    const id = `room-${this.nextSeq++}`;
    const name = sanitizeName(payload?.roomName, `房間-${id.slice(5)}`);

    const mode = GAME_TYPES.includes(payload?.mode) ? payload.mode : DEFAULT_GAME_TYPE;
    const mapId = mode === 'battle-royale' && typeof payload?.mapId === 'string'
      ? payload.mapId.slice(0, 32) : null;
    const isPrivate = !!payload?.isPrivate;
    const password = isPrivate && typeof payload?.password === 'string' && payload.password.length > 0
      ? payload.password.slice(0, 64) : null;
    const capacity = clampCapacity(payload?.capacity);
    const hostId = socket.id;
    const hostUsername = socket.data?.user?.username ?? '?';

    const room = new Room(this.io.to(id), {
      id, name, mode, mapId, isPrivate, password, capacity, hostId, hostUsername,
    });
    this.rooms.set(id, room);
    const join = this.joinRoom(socket, id, { silent: true, skipPasswordCheck: true });
    if (join.error) {
      this.rooms.delete(id);
      return join;
    }
    this.broadcastList();
    return { ok: true, roomId: id, roomName: name };
  }

  // ---- 入房（玩家） ----
  joinRoom(socket, roomId, { silent = false, skipPasswordCheck = false, password = null } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (room.match) return { error: 'match_in_progress' };
    if (room.lobby.players.size >= room.capacity) return { error: 'room_full' };
    if (!skipPasswordCheck && room.isPrivate && room.password && password !== room.password) {
      return { error: 'bad_password' };
    }
    // 如果原本在別的房（玩家或觀戰），先退掉
    const prevId = this.socketToRoom.get(socket.id);
    if (prevId && prevId !== roomId) this._detachFromRoom(socket, prevId);
    if (this.socketToSpectate.has(socket.id)) this.unspectate(socket);

    socket.leave(HALL);
    socket.join(roomId);
    socket.join(`chat:room:${roomId}`);   // 房聊頻道（chatHandlers 廣播時用）
    this.socketToRoom.set(socket.id, roomId);
    socket.emit(MSG.ROOM_JOINED, {
      roomId, roomName: room.name, mode: room.mode, mapId: room.mapId,
    });
    if (!silent) this.broadcastList();
    return { ok: true, roomId, roomName: room.name };
  }

  // ---- 離房（玩家） ----
  leaveRoom(socket) {
    const rid = this.socketToRoom.get(socket.id);
    if (!rid) return { error: 'not_in_room' };
    this._detachFromRoom(socket, rid);
    socket.join(HALL);
    this.broadcastList();
    return { ok: true };
  }

  // ---- 觀戰 ----
  spectate(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'room_not_found' };
    if (!room.match) return { error: 'no_match' };
    // 私人房不允許觀戰（鎖頭就是要隔絕外人）
    if (room.isPrivate) return { error: 'private_room' };
    // 觀戰人數上限
    const currentSpec = [...this.socketToSpectate.values()].filter((rid) => rid === roomId).length;
    if (currentSpec >= MAX_SPECTATORS_PER_ROOM) return { error: 'spectators_full' };

    // 觀戰者不能同時在玩家身份
    if (this.socketToRoom.has(socket.id)) {
      this._detachFromRoom(socket, this.socketToRoom.get(socket.id));
    }
    socket.leave(HALL);
    socket.join(roomId);
    socket.join(`chat:room:${roomId}`);   // 觀戰者也能讀房聊
    this.socketToSpectate.set(socket.id, roomId);
    return { ok: true, room };
  }
  unspectate(socket) {
    const rid = this.socketToSpectate.get(socket.id);
    if (!rid) return;
    socket.leave(rid);
    socket.leave(`chat:room:${rid}`);
    this.socketToSpectate.delete(socket.id);
    socket.join(HALL);
  }

  handleDisconnect(socket) {
    if (this.socketToSpectate.has(socket.id)) {
      this.unspectate(socket);
      return;
    }
    const rid = this.socketToRoom.get(socket.id);
    if (!rid) return;
    this._detachFromRoom(socket, rid);
    // 不用重新把 socket 放回 hall — 它已斷線
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
    socket.leave(`chat:room:${rid}`);
    this.socketToRoom.delete(socket.id);
    this._gcRoom(rid);
  }
  _gcRoom(rid) {
    const room = this.rooms.get(rid);
    if (!room) return;
    if (!room.hasHuman() && !room.match) this.rooms.delete(rid);
  }
}
