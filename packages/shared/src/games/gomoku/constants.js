// 五子棋常數。棋盤為 BOARD_SIZE×BOARD_SIZE 的交叉點格；先連成 WIN_LEN 子者勝。

export const GAME_ID = 'gomoku';
export const NAME = '五子棋';

export const BOARD_SIZE = 15;   // 15×15 標準盤
export const WIN_LEN = 5;       // 五連勝

// 單手思考時限：逾時判「該手玩家」負（避免 AFK / 斷線讓對局卡死）。
export const TURN_TIME_MS = 60000;

export const COLORS = ['black', 'white'];   // index 0 先手
