// 踩地雷常數。單人遊戲：翻開所有非雷格即勝，踩到雷即負。

export const GAME_ID = 'minesweeper';
export const NAME = '踩地雷';

// 難度：cols × rows 與雷數。default 走 normal。
export const DIFFICULTIES = {
  easy:   { id: 'easy',   name: '新手',  cols: 9,  rows: 9,  mines: 10 },
  normal: { id: 'normal', name: '普通',  cols: 16, rows: 16, mines: 40 },
  hard:   { id: 'hard',   name: '專家',  cols: 30, rows: 16, mines: 99 },
};

export const DEFAULT_DIFFICULTY = 'normal';

export function getDifficulty(id) {
  return DIFFICULTIES[id] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
}
