// 多遊戲戰鬥 dispatcher：依 gameType 路由到對應戰鬥元件。
// 目前僅 BR 實作；Items / Territory 在 Phase 2 / 3 補上。

import BattleRoyale from './battle/br/BattleRoyale.jsx';
import ItemsBattle from './battle/items/ItemsBattle.jsx';
import TerritoryBattle from './battle/territory/TerritoryBattle.jsx';
import GomokuBattle from './battle/gomoku/GomokuBattle.jsx';
import MinesweeperBattle from './battle/minesweeper/MinesweeperBattle.jsx';
import SolitaireBattle from './battle/solitaire/SolitaireBattle.jsx';
import SheetWindow from '../components/SheetWindow.jsx';

export default function NetworkedBattle({ gameType, config, initialState, onEnd, onRematch, onExit, onHome }) {
  // 桌遊（gomoku/minesweeper/solitaire）改用「結束跳窗」流程（onRematch/onExit），
  // 停在戰鬥畫面播完化身動作再詢問；射擊類仍走原本的 GameOver 結算頁（onEnd）。
  // 桌遊（gomoku/minesweeper/solitaire）額外吃 onRematch/onExit（結束跳窗）與 onHome（HUD 放棄按鈕）
  const boardProps = { onRematch, onExit, onHome };
  if (gameType === 'battle-royale') {
    return <BattleRoyale initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'items') {
    return <ItemsBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'territory') {
    return <TerritoryBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'gomoku') {
    return <GomokuBattle initialState={initialState} config={config} onEnd={onEnd} {...boardProps} />;
  }
  if (gameType === 'minesweeper') {
    return <MinesweeperBattle initialState={initialState} config={config} onEnd={onEnd} {...boardProps} />;
  }
  if (gameType === 'solitaire') {
    return <SolitaireBattle initialState={initialState} config={config} onEnd={onEnd} {...boardProps} />;
  }
  // 未實作的 gameType placeholder
  return (
    <SheetWindow
      fileName={`${gameType ?? '對戰'}.xlsx — 對戰中`}
      cellRef="A1"
      formula={<><span className="fn">=BATTLE</span>(&quot;{gameType}&quot;)</>}
      statusLeft="Phase 1 尚未實作此遊戲"
      statusRight=""
      fullscreen
    >
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ fontSize: 48, color: 'var(--ink-faint)' }}>#N/A</div>
        <div>{gameType} 戰鬥畫面尚未實作</div>
      </div>
    </SheetWindow>
  );
}
