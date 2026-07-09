// 五子棋主畫面 — 訂閱 SNAPSHOT + 點擊落子。回合制：board 靠 stone_placed 事件增量更新。
// 化身：自己右下（大）、對手右上（小）；事件驅動 think/wait/stamp/win/tense 動作 + 動態公式列。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';
import { BOARD_SIZE } from '@office-colosseum/shared/src/games/gomoku/constants.js';
import SheetWindow from '../../../components/SheetWindow.jsx';
import MatchEndModal from '../../../components/MatchEndModal.jsx';
import CharacterActor from '../../../components/CharacterActor.jsx';
import { ACTIONS } from '../characterActions.js';
import ArenaGomoku from './ArenaGomoku.jsx';
import BattleHudGomoku from './BattleHudGomoku.jsx';
import { useInputGomoku } from './useInputGomoku.js';

const LOG_LIMIT = 10;
const COLOR_LABEL = { black: '黑', white: '白' };
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

// 對手是否形成「四連且有開放端可成五」→ 觸發我方緊張
function hasFourThreat(board, color, size) {
  if (!color) return false;
  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) {
      if (board[`${c},${r}`] !== color) continue;
      for (const [dc, dr] of DIRS) {
        if (board[`${c - dc},${r - dr}`] === color) continue; // 只從連段起點算
        let len = 0, cc = c, rr = r;
        while (cc >= 0 && cc < size && rr >= 0 && rr < size && board[`${cc},${rr}`] === color) { len++; cc += dc; rr += dr; }
        if (len === 4) {
          const afterEmpty = cc >= 0 && cc < size && rr >= 0 && rr < size && !board[`${cc},${rr}`];
          const pc = c - dc, pr = r - dr;
          const beforeEmpty = pc >= 0 && pc < size && pr >= 0 && pr < size && !board[`${pc},${pr}`];
          if (afterEmpty || beforeEmpty) return true;
        }
      }
    }
  }
  return false;
}

export default function GomokuBattle({ initialState, config, onEnd, onRematch, onExit, onHome, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;
  const init = initialState?.state ?? {};

  const [players] = useState(init.players ?? {});
  const [order] = useState(init.order ?? Object.keys(init.players ?? {}));
  const [board, setBoard] = useState(init.board ?? {});
  const [turn, setTurn] = useState(init.turn ?? null);
  const [turnColor, setTurnColor] = useState(init.turnColor ?? 'black');
  const [turnEndsAtMs, setTurnEndsAtMs] = useState(init.turnEndsAtMs ?? 0);
  const [moveCount, setMoveCount] = useState(init.moveCount ?? 0);
  const [lastMove, setLastMove] = useState(init.lastMove ?? null);
  const [winner, setWinner] = useState(init.winner ?? null);
  const [winningLine, setWinningLine] = useState(init.winningLine ?? null);
  const [phase, setPhase] = useState(init.phase ?? 'playing');
  const [log, setLog] = useState(['=BATTLE.START("五子棋")']);
  const [now, setNow] = useState(Date.now());
  const [actionFx, setActionFx] = useState(null);   // 動態公式列文字
  const [endModal, setEndModal] = useState(null);   // { winnerId } 結束跳窗（延遲顯示讓動作播完）

  const arenaRef = useRef(null);
  const sendPlace = useInputGomoku();

  // 化身
  const opponentId = order.find((id) => id !== selfId) ?? null;
  const selfChar = players?.[selfId]?.characterId;
  const oppChar = opponentId ? players?.[opponentId]?.characterId : null;
  const selfActor = useRef(null);
  const oppActor = useRef(null);
  const boardRef = useRef(init.board ?? {});

  // 進行中：think/wait 待機切換；結束後：勝者持續歡呼(win)、敗者持續喪氣(lose)，皆 loop
  const endAction = (pid) => (winner == null ? 'idle' : (pid === winner ? 'win' : 'lose'));
  const idleSelf = phase !== 'playing' ? endAction(selfId) : (turn === selfId ? 'think' : 'wait');
  const idleOpp = phase !== 'playing' ? endAction(opponentId) : (turn === opponentId ? 'think' : 'wait');

  function playSelf(name) { selfActor.current?.play(name); setActionFx(ACTIONS[name]?.formula ?? null); }
  function playOpp(name) { oppActor.current?.play(name); }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  function pushLog(line) { setLog((prev) => [...prev.slice(-LOG_LIMIT + 1), line]); }

  useEffect(() => {
    const onSnapshot = (snap) => {
      if (snap.turn !== undefined) setTurn(snap.turn);
      if (snap.turnColor) setTurnColor(snap.turnColor);
      if (snap.turnEndsAtMs) setTurnEndsAtMs(snap.turnEndsAtMs);
      if (typeof snap.moveCount === 'number') setMoveCount(snap.moveCount);
      if (snap.lastMove !== undefined) setLastMove(snap.lastMove);
      if (snap.phase) setPhase(snap.phase);
      if (snap.winner !== undefined) setWinner(snap.winner);
      if (snap.winningLine !== undefined) setWinningLine(snap.winningLine);
      if (Array.isArray(snap.events)) {
        applyBoardEvents(snap.events);
        processEvents(snap.events);
      }
    };
    const onMatchEnd = ({ winnerId }) => {
      // 不立即離開：停在戰鬥畫面播完 win/lose 動作，延遲 2.6s 再跳窗詢問
      setTimeout(() => setEndModal({ winnerId }), 2600);
    };
    socket.on(MSG.SNAPSHOT, onSnapshot);
    socket.on(MSG.MATCH_END, onMatchEnd);
    return () => {
      socket.off(MSG.SNAPSHOT, onSnapshot);
      socket.off(MSG.MATCH_END, onMatchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId]);

  // board 增量更新（用 boardRef 避免 stale），並觸發化身動作 / 緊張偵測
  function applyBoardEvents(events) {
    let patch = null;
    for (const e of events) {
      if (e.type === 'stone_placed') {
        if (!patch) patch = {};
        patch[`${e.c},${e.r}`] = e.color;
        if (e.playerId === selfId) playSelf('stamp');
        else if (e.playerId === opponentId) playOpp('stamp');
      }
    }
    if (patch) {
      const next = { ...boardRef.current, ...patch };
      boardRef.current = next;
      setBoard(next);
      // 對手四連威脅 → 我方緊張（僅遊戲進行中、輪到我要應對時）
      const oppColor = opponentId ? players?.[opponentId]?.color : null;
      if (oppColor && hasFourThreat(next, oppColor, BOARD_SIZE)) {
        // 稍等 stamp 動作播完再演緊張
        setTimeout(() => playSelf('tense'), 260);
      }
    }
  }

  function processEvents(events) {
    for (const e of events) {
      if (e.type === 'stone_placed') {
        pushLog(`=PLACE(${COLOR_LABEL[e.color] ?? e.color}, ${String.fromCharCode(65 + e.c)}${e.r + 1})`);
      } else if (e.type === 'game_won') {
        pushLog(`=WIN(${COLOR_LABEL[e.color] ?? e.color}) // 五連`);
        // 勝負動作改由 phase 結束後的 idleAction 持續循環（win/lose），不再單次播放
      } else if (e.type === 'turn_timeout') {
        pushLog('=TIMEOUT() // 逾時判負');
      } else if (e.type === 'draw') {
        pushLog('=DRAW() // 和局');
      }
    }
  }

  const myTurn = !readOnly && phase === 'playing' && turn === selfId;

  const handlePlace = (c, r) => {
    if (!myTurn) return;
    if (board[`${c},${r}`]) return;   // 已有子
    sendPlace(c, r);
  };

  const self = players?.[selfId];
  const showActors = !!selfChar;

  return (
    <SheetWindow
      fileName="決策矩陣_黑白對弈.xlsx"
      cellRef={lastMove ? `${String.fromCharCode(65 + lastMove.c)}${lastMove.r + 1}` : 'H8'}
      formula={actionFx
        ? <span style={{ fontFamily: 'var(--font-mono)' }}>{actionFx}</span>
        : <><span className="fn">=GOMOKU</span>(<span style={{ color: 'var(--accent-danger)' }}>MATCH(5, RUN)</span>)</>}
      statusLeft={`對弈中 · 手數 ${moveCount} · phase ${phase}`}
      statusRight={myTurn ? '你的回合' : (phase === 'playing' ? '對手回合' : '結束')}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0, justifyContent: 'center' }}>
          <div style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
            <ArenaGomoku
              ref={arenaRef}
              board={board}
              lastMove={lastMove}
              winningLine={winningLine}
              myTurn={myTurn}
              onCellClick={handlePlace}
            />
          </div>
          {/* 對弈 log */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 72,
            background: 'var(--bg-paper)',
            borderTop: '1px solid var(--line-soft)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ink-soft)',
            padding: '4px 8px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column-reverse', gap: 2,
          }}>
            {[...log].reverse().map((line, i) => (
              <div key={log.length - i} style={{
                opacity: 1 - i * 0.12,
                color: line.startsWith('=WIN') ? 'var(--accent-link)' : 'var(--ink-soft)',
              }}>{line}</div>
            ))}
          </div>

          {/* 化身：貼在棋盤區右側 gutter（避開右側 HUD 與右下角 FPS 視窗）；pointer-events:none 不擋操作 */}
          {showActors && oppChar && (
            <div style={{ position: 'absolute', top: 4, right: 4, pointerEvents: 'none', zIndex: 50 }}>
              <CharacterActor ref={oppActor} characterId={oppChar} idleAction={idleOpp} scale={0.58} anchor="tr" />
            </div>
          )}
          {showActors && (
            <div style={{ position: 'absolute', bottom: 78, right: 4, pointerEvents: 'none', zIndex: 51 }}>
              <CharacterActor ref={selfActor} characterId={selfChar} idleAction={idleSelf} scale={1.35} anchor="br" />
            </div>
          )}
        </div>
        <BattleHudGomoku
          selfId={selfId}
          players={players}
          order={order}
          turn={turn}
          turnColor={turnColor}
          moveCount={moveCount}
          turnEndsAtMs={turnEndsAtMs}
          now={now}
          phase={phase}
          onHome={onHome}
        />

        {endModal && (
          <MatchEndModal
            title={endModal.winnerId == null ? '和局' : (endModal.winnerId === selfId ? '你贏了！' : '對手獲勝')}
            subtitle={`=GOMOKU · 手數 ${moveCount}`}
            onRematch={onRematch}
            onExit={onExit}
          />
        )}
      </div>
    </SheetWindow>
  );
}
