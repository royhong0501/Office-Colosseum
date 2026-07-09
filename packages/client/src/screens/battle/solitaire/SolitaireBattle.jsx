// 接龍主畫面 — 單人。訂閱 SNAPSHOT，靠 'board' 事件替換整個盤面（board 小，直接整包換）。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';
import SheetWindow from '../../../components/SheetWindow.jsx';
import MatchEndModal from '../../../components/MatchEndModal.jsx';
import CharacterActor from '../../../components/CharacterActor.jsx';
import { spriteFor } from '../../../lib/breedSprite.js';
import { ACTIONS } from '../characterActions.js';
import ArenaSolitaire from './ArenaSolitaire.jsx';
import BattleHudSolitaire from './BattleHudSolitaire.jsx';
import { useInputSolitaire } from './useInputSolitaire.js';

function foundTotal(b) { return (b?.foundations ?? []).reduce((n, f) => n + f.length, 0); }

export default function SolitaireBattle({ initialState, config, onEnd, onRematch, onExit, onHome, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;
  const init = initialState?.state ?? {};
  const players = init.players ?? {};
  const selfChar = players[selfId]?.characterId ?? Object.values(players)[0]?.characterId;
  const pusherUrl = selfChar ? spriteFor(selfChar).url : null;   // 推牌用的小貓 sprite

  const [board, setBoard] = useState(init.board ?? null);
  const [moves, setMoves] = useState(init.moves ?? 0);
  const [phase, setPhase] = useState(init.phase ?? 'playing');
  const [result, setResult] = useState(null);
  const [startedAtMs] = useState(init.startedAtMs ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [actionFx, setActionFx] = useState(null);
  const [endModal, setEndModal] = useState(false);
  const [pushing, setPushing] = useState(false);   // 推牌滑行中 → 藏右下角化身
  const endedAtRef = useRef(null);
  const prevBoardRef = useRef(init.board ?? null);

  const { draw, auto, moveCard } = useInputSolitaire();
  const selfActor = useRef(null);
  const idleSelf = phase !== 'playing' ? (result === 'won' ? 'win' : 'idle') : 'idle';
  function playSelf(name) { selfActor.current?.play(name); setActionFx(ACTIONS[name]?.formula ?? null); }

  // 依 board 變化推斷玩家做了什麼動作 → 對應化身反應
  function reactToBoard(next) {
    const prev = prevBoardRef.current;
    prevBoardRef.current = next;
    if (!prev || !next) return;
    if (foundTotal(next) > foundTotal(prev)) playSelf('found');        // 進基礎堆
    else if (next.stockCount !== prev.stockCount) playSelf('draw');     // 抽牌 / 回收
    else playSelf('move');                                             // 疊放
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onSnapshot = (snap) => {
      if (typeof snap.moves === 'number') setMoves(snap.moves);
      if (snap.phase) setPhase(snap.phase);
      if (snap.result) setResult(snap.result);
      if (Array.isArray(snap.events)) {
        for (const e of snap.events) {
          if (e.type === 'board' && e.board) { setBoard(e.board); reactToBoard(e.board); }
          else if (e.type === 'stuck') { playSelf('stuck'); }
          else if (e.type === 'game_over') {
            if (e.result) setResult(e.result);
            if (endedAtRef.current == null) { endedAtRef.current = Date.now(); setNow(Date.now()); }
          }
        }
      }
    };
    const onMatchEnd = () => {
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

  const elapsedMs = (endedAtRef.current ?? now) - startedAtMs;
  const foundations = board?.foundations ?? [[], [], [], []];

  const handleMove = (from, to) => { if (!readOnly) moveCard(from, to); };
  const handleDraw = () => { if (!readOnly) draw(); };
  const handleAuto = () => { if (!readOnly) auto(); };

  return (
    <SheetWindow
      fileName="資料排序_紙牌歸檔.xlsx"
      cellRef="A1"
      formula={actionFx
        ? <span style={{ fontFamily: 'var(--font-mono)' }}>{actionFx}</span>
        : <><span className="fn">=SOLITAIRE</span>(<span style={{ color: 'var(--accent-danger)' }}>SORT(SUIT, ASC)</span>)</>}
      statusLeft={`${phase === 'ended' ? (result === 'won' ? '全部歸位' : '結束') : '進行中'} · 手數 ${moves}`}
      statusRight={`歸位 ${foundations.reduce((n, f) => n + f.length, 0)}/52`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <ArenaSolitaire
          board={board}
          phase={phase}
          pusherUrl={pusherUrl}
          onPushing={setPushing}
          onDraw={handleDraw}
          onAuto={handleAuto}
          onMove={handleMove}
        />
        <BattleHudSolitaire
          foundations={foundations}
          moves={moves}
          elapsedMs={elapsedMs}
          phase={phase}
          result={result}
          onAuto={handleAuto}
          onDraw={handleDraw}
          onHome={onHome}
        />

        {/* 化身：右下（大）；推牌滑行時隱藏（改由滑行中的小貓推牌），推完再出現 */}
        {selfChar && !pushing && (
          <div style={{ position: 'absolute', bottom: 4, right: 252, pointerEvents: 'none', zIndex: 51 }}>
            <CharacterActor ref={selfActor} characterId={selfChar} idleAction={idleSelf} scale={1.35} anchor="br" />
          </div>
        )}

        {endModal && (
          <MatchEndModal
            title="全部歸位！"
            subtitle={`=SOLITAIRE · 手數 ${moves}`}
            onRematch={onRematch}
            onExit={onExit}
          />
        )}
      </div>
    </SheetWindow>
  );
}
