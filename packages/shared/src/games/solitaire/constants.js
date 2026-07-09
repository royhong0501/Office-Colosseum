// 接龍（Klondike）常數。單人：把 52 張牌全部依花色升序疊進 4 個 foundation 即勝。

export const GAME_ID = 'solitaire';
export const NAME = '接龍';

export const NUM_TABLEAU = 7;      // 7 個牌列
export const NUM_FOUNDATIONS = 4;  // 4 個歸位堆（每花色一個）
export const RANK_MAX = 13;        // A=1 ... K=13
export const DECK_SIZE = 52;

// 花色 index：0=黑桃 1=紅心 2=方塊 3=梅花（與顯示符號對應）
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];

/** 紅色花色：紅心 / 方塊。 */
export function isRed(suit) {
  return suit === 1 || suit === 2;
}

/** 兩張牌是否異色。 */
export function altColor(a, b) {
  return isRed(a.s) !== isRed(b.s);
}
