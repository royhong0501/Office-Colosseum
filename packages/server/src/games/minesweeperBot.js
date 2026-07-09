// 踩地雷是單人遊戲，沒有 bot 對手。此 stub 僅為滿足 GAMES registry 的 { sim, bot } 形狀；
// 理論上不會被呼叫（單人房不會有 isBot 玩家），保險起見回傳無效動作。
export function decideBotInput(_state, _botId, _now) {
  return { seq: 0, action: 'noop' };
}
