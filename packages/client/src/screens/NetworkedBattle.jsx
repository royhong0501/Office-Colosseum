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
  const endProps = { onRematch, onExit };
  if (gameType === 'battle-royale') {
    return <BattleRoyale initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'items') {
    return <ItemsBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'territory') {
    return <TerritoryBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  // 桌遊：包一個「放棄回首頁」浮動按鈕（左下角，避開標題列/HUD/FPS 浮窗）
  const boardGame = { gomoku: GomokuBattle, minesweeper: MinesweeperBattle, solitaire: SolitaireBattle }[gameType];
  if (boardGame) {
    const Game = boardGame;
    return (
      <>
        <Game initialState={initialState} config={config} onEnd={onEnd} {...endProps} />
        <button
          onClick={onHome}
          style={{
            position: 'fixed', bottom: 10, left: 10, zIndex: 150,
            padding: '6px 12px', cursor: 'pointer',
            background: 'var(--bg-chrome)', color: 'var(--ink)',
            border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}
        >← 放棄回首頁</button>
      </>
    );
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
