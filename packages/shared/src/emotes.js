// 戰鬥內快捷表情（顏文字）— 三款遊戲共用。
// 觸發機制：client INPUT 帶 emote: 1-6 | null；server 過 applyEmoteInput
// 檢查 cooldown / 範圍 / paused，合法則寫入 state.events。

export const EMOTE_CD_MS = 3000;

export const EMOTES = [
  { slot: 1, key: '1', kaomoji: '(´∀｀)',         label: '笑' },
  { slot: 2, key: '2', kaomoji: '＼(^o^)／',      label: '拍手' },
  { slot: 3, key: '3', kaomoji: '(╥﹏╥)',         label: '哭' },
  { slot: 4, key: '4', kaomoji: '(°ロ°)',         label: '驚' },
  { slot: 5, key: '5', kaomoji: 'ಠ_ಠ',           label: '嘲諷' },
  { slot: 6, key: '6', kaomoji: '(╯°□°)╯︵ ┻━┻', label: '翻桌' },
];

/**
 * 三款 sim 的 applyInput 末段都呼叫此 helper。
 * 死亡 / 凍結 / silenced 不擋（emote 是社交訊號，不是遊戲動作）。
 * 只擋：non-integer slot、越界、玩家 paused（老闆鍵）、cooldown 中。
 *
 * @param {object} player — state.players[id]，會就地修改 emoteCdUntil
 * @param {object} input — sanitize 後的 INPUT（input.emote 為 1-6 | null）
 * @param {object} state — { events: [...] }，會就地 push 事件
 * @param {number} now — 絕對 ms 時間戳
 */
export function applyEmoteInput(player, input, state, now) {
  if (input == null || input.emote == null) return;
  if (!Number.isInteger(input.emote)) return;
  if (input.emote < 1 || input.emote > EMOTES.length) return;
  if (player.paused) return;
  if (now < (player.emoteCdUntil || 0)) return;
  player.emoteCdUntil = now + EMOTE_CD_MS;
  state.events.push({
    kind: 'emote',
    playerId: player.id,
    slot: input.emote,
    atMs: now,
  });
}
