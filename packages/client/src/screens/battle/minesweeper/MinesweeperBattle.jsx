// 踩地雷主畫面 — 單人。訂閱 SNAPSHOT，靠 reveal / flag / reveal_mines 事件維護本地盤面。
// 雷位置在遊戲結束前不會由 server 送來（防作弊）。
// 化身：自己右下（大）；reveal/flag/mine 反應；結束後 win/lose 持續循環；結束跳窗。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';
import SheetWindow from '../../../components/SheetWindow.jsx';
import MatchEndModal from '../../../components/MatchEndModal.jsx';
import CharacterActor from '../../../components/CharacterActor.jsx';
import { ACTIONS } from '../characterActions.js';
import ArenaMinesweeper from './ArenaMinesweeper.jsx';
import BattleHudMinesweeper from './BattleHudMinesweeper.jsx';
import { useInputMinesweeper } from './useInputMinesweeper.js';

export default function MinesweeperBattle({ initialState, config, onEnd, onRematch, onExit, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;
  const init = initialState?.state ?? {};
  const players = init.players ?? {};
  const selfChar = players[selfId]?.characterId ?? Object.values(players)[0]?.characterId;

  const cols = init.cols ?? 16;
  const rows = init.rows ?? 16;
  const [mineCount] = useState(init.mineCount ?? 40);
  const [difficulty] = useState(init.config?.difficulty ?? config?.difficulty ?? 'normal');
  const safeTotal = cols * rows - mineCount;

  // revealed: Map<'c,r', adj>；flagged: Set<'c,r'>
  const [revealed, setRevealed] = useState(() => new Map());
  const [flagged, setFlagged] = useState(() => new Set());
  const [mineCells, setMineCells] = useState(null);   // 結束才有
  const [explodedKey, setExplodedKey] = useState(null);
  const [flagsUsed, setFlagsUsed] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [phase, setPhase] = useState(init.phase ?? 'playing');
  const [result, setResult] = useState(null);
  const [startedAtMs] = useState(init.startedAtMs ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [actionFx, setActionFx] = useState(null);
  const [endModal, setEndModal] = useState(false);
  const endedAtRef = useRef(null);

  const { reveal, flag } = useInputMinesweeper();
  const selfActor = useRef(null);
  const idleSelf = phase !== 'playing' ? (result === 'won' ? 'win' : 'lose') : 'idle';
  function playSelf(name) { selfActor.current?.play(name); setActionFx(ACTIONS[name]?.formula ?? null); }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onSnapshot = (snap) => {
      if (typeof snap.flagsUsed === 'number') setFlagsUsed(snap.flagsUsed);
      if (typeof snap.revealedCount === 'number') setRevealedCount(snap.revealedCount);
      if (snap.phase) setPhase(snap.phase);
      if (snap.result) setResult(snap.result);
      if (Array.isArray(snap.events)) applyEvents(snap.events);
    };
    const onMatchEnd = () => {
      // 停在畫面播完動作，延遲跳窗
      setTimeout(() => setEndModal(true), 2600);
    };
    socket.on(MSG.SNAPSHOT, onSnapshot);
    socket.on(MSG.MATCH_END, onMatchEnd);
    return () => {
      socket.off(MSG.SNAPSHOT, onSnapshot);
      socket.off(MSG.MATCH_END, onMatchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyEvents(events) {
    let revPatch = null;
    let flagPatch = null;
    for (const e of events) {
      if (e.type === 'reveal' && Array.isArray(e.cells)) {
        if (!revPatch) revPatch = [];
        for (const [c, r, adj] of e.cells) revPatch.push([`${c},${r}`, adj]);
        playSelf('reveal');
      } else if (e.type === 'flag') {
        if (!flagPatch) flagPatch = [];
        flagPatch.push([`${e.c},${e.r}`, e.flagged]);
        if (e.flagged) playSelf('flag');
      } else if (e.type === 'explode') {
        setExplodedKey(`${e.c},${e.r}`);
        playSelf('mine');
      } else if (e.type === 'reveal_mines' && Array.isArray(e.cells)) {
        setMineCells(e.cells);
      } else if (e.type === 'game_over') {
        if (e.result) setResult(e.result);
        if (endedAtRef.current == null) { endedAtRef.current = Date.now(); setNow(Date.now()); }
      }
    }
    if (revPatch) {
      setRevealed((prev) => {
        const next = new Map(prev);
        for (const [k, adj] of revPatch) next.set(k, adj);
        return next;
      });
      // flood 可能清掉標錯的旗
      setFlagged((prev) => {
        if (!prev.size) return prev;
        const next = new Set(prev);
        for (const [k] of revPatch) next.delete(k);
        return next;
      });
    }
    if (flagPatch) {
      setFlagged((prev) => {
        const next = new Set(prev);
        for (const [k, on] of flagPatch) { if (on) next.add(k); else next.delete(k); }
        return next;
      });
    }
  }

  const elapsedMs = (endedAtRef.current ?? now) - startedAtMs;

  const handleReveal = (c, r) => { if (!readOnly) reveal(c, r); };
  const handleFlag = (c, r) => { if (!readOnly) flag(c, r); };

  return (
    <SheetWindow
      fileName="風險分析_地雷偵測.xlsx"
      cellRef="A1"
      formula={actionFx
        ? <span style={{ fontFamily: 'var(--font-mono)' }}>{actionFx}</span>
        : <><span className="fn">=MINESWEEPER</span>(<span style={{ color: 'var(--accent-danger)' }}>COUNTIF(RANGE, MINE)</span>)</>}
      statusLeft={`${phase === 'ended' ? (result === 'won' ? '清盤成功' : '已引爆') : '偵測中'} · 翻開 ${revealedCount}/${safeTotal}`}
      statusRight={`剩餘雷 ${mineCount - flagsUsed}`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <ArenaMinesweeper
          cols={cols}
          rows={rows}
          revealed={revealed}
          flagged={flagged}
          mineCells={mineCells}
          explodedKey={explodedKey}
          phase={phase}
          onReveal={handleReveal}
          onFlag={handleFlag}
        />
        <BattleHudMinesweeper
          difficulty={difficulty}
          mineCount={mineCount}
          flagsUsed={flagsUsed}
          revealedCount={revealedCount}
          safeTotal={safeTotal}
          phase={phase}
          result={result}
          elapsedMs={elapsedMs}
        />

        {/* 化身：右下（大），貼在棋盤區右側、避開右側 HUD 與右下 FPS 視窗 */}
        {selfChar && (
          <div style={{ position: 'absolute', bottom: 4, right: 252, pointerEvents: 'none', zIndex: 51 }}>
            <CharacterActor ref={selfActor} characterId={selfChar} idleAction={idleSelf} scale={1.35} anchor="br" />
          </div>
        )}

        {endModal && (
          <MatchEndModal
            title={result === 'won' ? '清盤成功！' : '踩到地雷'}
            subtitle={`=MINESWEEPER · 翻開 ${revealedCount}/${safeTotal}`}
            onRematch={onRematch}
            onExit={onExit}
          />
        )}
      </div>
    </SheetWindow>
  );
}
