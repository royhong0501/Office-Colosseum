// 接龍是單人遊戲，無 bot。stub 僅為滿足 GAMES registry 的 { sim, bot } 形狀。
export function decideBotInput(_state, _botId, _now) {
  return { seq: 0, action: 'noop' };
}
