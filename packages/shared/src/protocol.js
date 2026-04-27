// Socket event 名稱與共用常數。
// 多遊戲平台：server 依 gameType 分派 simulation；client 依 gameType 路由戰鬥畫面。

export const GAME_TYPES = ['battle-royale', 'items', 'territory'];

// 預設模式：Lobby 剛建立時的 gameType（Phase 0 只有 BR 上線）
export const DEFAULT_GAME_TYPE = 'battle-royale';

export const MSG = {
  // ---- 大廳（多房列表）----
  LIST_ROOMS: 'list_rooms',             // C→S 主動拉一次房間列表
  ROOMS_LIST: 'rooms_list',             // S→C { rooms: [summary, ...] }
  CREATE_ROOM: 'create_room',           // C→S { roomName, mode, mapId?, capacity, isPrivate, password? }
  JOIN_ROOM: 'join_room',               // C→S { roomId, password? }
  LEAVE_ROOM: 'leave_room',             // C→S 離開目前房間（未在 match 中）
  ROOM_JOINED: 'room_joined',           // S→C { roomId, roomName, mode, mapId? }

  // ---- 觀戰 ----
  SPECTATE_ROOM: 'spectate_room',       // C→S { roomId }
  SPECTATE_INIT: 'spectate_init',       // S→C { gameType, config, state } 中途加入用
  SPECTATE_LEAVE: 'spectate_leave',     // C→S 離開觀戰

  // ---- 房內 / 對戰 ----
  JOIN: 'join',
  LOBBY_STATE: 'lobby_state',          // payload 帶 gameType、mapId、players
  PICK: 'pick_character',
  READY: 'ready',
  SET_GAME_TYPE: 'set_game_type',      // host only：切換 mode（含 config 如 BR 的 mapId）
  START: 'start_match',
  MATCH_START: 'match_start',           // payload: { gameType, config, state }
  INPUT: 'input',                       // payload shape 依 gameType 不同（見各 game 的 simulation）
  SNAPSHOT: 'snapshot',                 // payload shape 依 gameType 不同
  MATCH_END: 'match_end',
  PAUSED: 'paused',
  LEAVE: 'leave',
  ERROR: 'error',
  ADD_BOT: 'add_bot',
  REMOVE_BOT: 'remove_bot',

  // ---- 全站（跨 game）----
  GET_RECORDS: 'get_records',
  RECORDS: 'records',

  // ---- 聊天 ----
  // channel: 'public' / 'announce' / 'room' / 'dm'
  CHAT_SEND: 'chat_send',                // C→S { channel, recipientId?, roomId?, content, replyToId? }
  CHAT_MSG: 'chat_msg',                  // S→C 單則新訊息（廣播到對應 room）
  CHAT_HISTORY_REQ: 'chat_history_req',  // C→S { channel, peerId?, roomId?, before?, limit? }
  CHAT_HISTORY_RES: 'chat_history_res',  // S→C { channel, peerId?, roomId?, messages, hasMore }
  CHAT_READ: 'chat_read',                // C→S DM: { peerId } / ROOM/ANNOUNCE: { messageId }
  CHAT_PRESENCE: 'chat_presence',        // S→C { users: [{userId, displayName, status}, ...] }
  CHAT_UNREAD: 'chat_unread',            // S→C { byPeer: { [userId]: count } }
  CHAT_MENTION_NOTIFY: 'chat_mention_notify', // S→C { messageId, channel, roomId?, senderName, content } 給被提及方
  CHAT_MSG_READ_UPDATE: 'chat_msg_read_update', // S→C { messageId, count } 給原發訊者，更新「已讀 N」
};

// ---- 聊天設定常數 ----
export const CHAT_CONTENT_MAX = 500;          // 單則訊息最大字元數
export const CHAT_RATE_LIMIT_SEC = 2;         // 同一使用者兩則訊息最短間隔（秒；Redis EXPIRE 為秒粒度）
export const CHAT_HISTORY_PAGE_SIZE = 50;     // 一次拉幾則歷史
