// Socket event 名稱與共用常數。
// 多遊戲平台：server 依 gameType 分派 simulation；client 依 gameType 路由戰鬥畫面。

export const GAME_TYPES = ['battle-royale', 'items', 'territory'];

// 預設模式：Lobby 剛建立時的 gameType（Phase 0 只有 BR 上線）
export const DEFAULT_GAME_TYPE = 'battle-royale';

export const MSG = {
  // ---- 房內 / 大廳控制 ----
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

  // ---- 聊天（V1：全站公開頻道 + 1-on-1 私訊）----
  CHAT_SEND: 'chat_send',                // C→S { channel: 'public'|'dm', recipientId?, content }
  CHAT_MSG: 'chat_msg',                  // S→C 單則新訊息（公開廣播 / DM 投遞）
  CHAT_HISTORY_REQ: 'chat_history_req',  // C→S { peerId?: string, before?: ISO, limit?: number }
  CHAT_HISTORY_RES: 'chat_history_res',  // S→C { peerId?: string, messages: [...], hasMore }
  CHAT_READ: 'chat_read',                // C→S { peerId } 標記與 peerId 之間所有 DM 已讀
  CHAT_PRESENCE: 'chat_presence',        // S→C { online: [{userId, displayName}, ...] }
  CHAT_UNREAD: 'chat_unread',            // S→C { byPeer: { [userId]: count } }
};

// ---- 聊天設定常數 ----
export const CHAT_CONTENT_MAX = 500;          // 單則訊息最大字元數
export const CHAT_RATE_LIMIT_MS = 1500;       // 同一使用者兩則訊息最短間隔
export const CHAT_HISTORY_PAGE_SIZE = 50;     // 一次拉幾則歷史
