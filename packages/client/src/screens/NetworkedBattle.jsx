// 多遊戲戰鬥 dispatcher：依 gameType 路由到對應戰鬥元件。
// 目前僅 BR 實作；Items / Territory 在 Phase 2 / 3 補上。

import BattleRoyale from './battle/br/BattleRoyale.jsx';
import ItemsBattle from './battle/items/ItemsBattle.jsx';
import TerritoryBattle from './battle/territory/TerritoryBattle.jsx';
import SheetWindow from '../components/SheetWindow.jsx';

export default function NetworkedBattle({ gameType, config, initialState, onEnd }) {
  if (gameType === 'battle-royale') {
    return <BattleRoyale initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'items') {
    return <ItemsBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  if (gameType === 'territory') {
    return <TerritoryBattle initialState={initialState} config={config} onEnd={onEnd} />;
  }
  // Items / Territory placeholder
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
