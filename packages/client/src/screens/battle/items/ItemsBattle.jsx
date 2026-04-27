// 道具戰主畫面：訂閱 server SNAPSHOT、處理事件、教學 modal、HUD。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG, TICK_MS, EMOTE_CD_MS, getCharacterById } from '@office-colosseum/shared';
import { ARENA_COLS, ARENA_ROWS } from '@office-colosseum/shared/src/games/items/constants.js';
import SheetWindow from '../../../components/SheetWindow.jsx';
import ArenaItems from './ArenaItems.jsx';
import BattleHudItems from './BattleHudItems.jsx';
import TutorialModal from './TutorialModal.jsx';
import { useInputItems } from './useInputItems.js';
import { useEmoteInput } from '../useEmoteInput.js';
import { useEmoteFeed } from '../useEmoteFeed.js';
import EmoteBar from '../../../components/EmoteBar.jsx';

const LOG_LIMIT = 12;

export default function ItemsBattle({ initialState, config, onEnd, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;

  const [players, setPlayers] = useState(initialState?.state?.players ?? {});
  const [bullets, setBullets] = useState(initialState?.state?.bullets ?? []);
  const [traps, setTraps] = useState(initialState?.state?.traps ?? []);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState(initialState?.state?.phase ?? 'playing');
  const [roundEndsAtMs, setRoundEndsAtMs] = useState(initialState?.state?.roundEndsAtMs ?? 0);
  const [log, setLog] = useState(['=BATTLE.START("道具戰 · 第 1 回合")']);
  const [floaters, setFloaters] = useState([]);
  const [hurtIds, setHurtIds] = useState(() => new Set());
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [now, setNow] = useState(Date.now());

  const arenaRef = useRef(null);
  const selfPosRef = useRef({ x: ARENA_COLS / 2, y: ARENA_ROWS / 2 });
  const nextFloaterId = useRef(1);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const { emoteOpen, consume: consumeEmote } = useEmoteInput();
  const emoteOpenRef = useRef(false);
  // 同步 emoteOpen state 到 ref（給 useInputItems 在 keyboard handler 內讀）
  useEffect(() => { emoteOpenRef.current = emoteOpen; }, [emoteOpen]);
  const activeEmotes = useEmoteFeed();
  const [selfCooldownUntil, setSelfCooldownUntil] = useState(0);

  const readInput = useInputItems(arenaRef, selfPosRef, { emoteOpenRef });
  useEffect(() => {
    if (readOnly) return undefined;
    const id = setInterval(() => {
      if (phase !== 'playing' || tutorialOpen) return;
      try {
        const baseInput = readInput();
        const emote = consumeEmote();
        if (emote != null && Date.now() >= selfCooldownUntil) {
          setSelfCooldownUntil(Date.now() + EMOTE_CD_MS);
        }
        socket.emit(MSG.INPUT, { ...baseInput, emote });
      } catch (e) { /* ignore */ }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, tutorialOpen, readInput, socket, readOnly, consumeEmote, selfCooldownUntil]);

  useEffect(() => {
    const onSnapshot = (snap) => {
      setTick(snap.tick);
      setPlayers(snap.players ?? {});
      setBullets(snap.bullets ?? []);
      setTraps(snap.traps ?? []);
      if (snap.phase) setPhase(snap.phase);
      if (snap.roundEndsAtMs) setRoundEndsAtMs(snap.roundEndsAtMs);
      const me = snap.players?.[selfId];
      if (me) selfPosRef.current = { x: me.x, y: me.y };
      if (Array.isArray(snap.events)) processEvents(snap.events);
    };
    const onMatchEnd = ({ winnerId, summary }) => {
      onEnd?.({ winnerId, summary, players });
    };
    socket.on(MSG.SNAPSHOT, onSnapshot);
    socket.on(MSG.MATCH_END, onMatchEnd);
    return () => {
      socket.off(MSG.SNAPSHOT, onSnapshot);
      socket.off(MSG.MATCH_END, onMatchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId]);

  function addFloater(x, y, text, color) {
    const id = nextFloaterId.current++;
    setFloaters((prev) => [...prev, { id, x, y, text, color }]);
    setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== id)), 800);
  }
  function markHurt(id) {
    setHurtIds((prev) => { const n = new Set(prev); n.add(id); return n; });
    setTimeout(() => setHurtIds((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; }), 220);
  }
  function pushLog(line) { setLog((prev) => [...prev.slice(-LOG_LIMIT + 1), line]); }

  function processEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          markHurt(e.targetId);
          if (e.at) addFloater(e.at.x, e.at.y - 0.3, `−${e.amount}`, '#cc2a1a');
          const src = getCharacterById(players[e.sourceId]?.characterId)?.name ?? e.sourceId?.slice(0, 4);
          const tgt = getCharacterById(players[e.targetId]?.characterId)?.name ?? e.targetId?.slice(0, 4);
          pushLog(`=SHOOT("${src}","${tgt}") // HP−${e.amount}`);
          break;
        }
        case 'eliminated': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=ELIMINATED("${name}")`);
          break;
        }
        case 'trap_placed': {
          const owner = getCharacterById(players[e.ownerId]?.characterId)?.name ?? e.ownerId?.slice(0, 4);
          pushLog(`=CAST("${owner}","${e.kind}") // [${e.cx},${e.cy}]`);
          break;
        }
        case 'trap_triggered': {
          const victim = getCharacterById(players[e.victimId]?.characterId)?.name ?? e.victimId?.slice(0, 4);
          pushLog(`=TRIGGER("${victim}","${e.kind}")`);
          break;
        }
        case 'skill_cast': {
          if (e.kind === 'undo') {
            const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
            pushLog(`=UNDO("${name}") // HP→${Math.round(e.hpRestored)}`);
          }
          break;
        }
        case 'teleport': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=VALIDATE.TELEPORT("${name}")`);
          break;
        }
        default: break;
      }
    }
  }

  const me = players?.[selfId];
  const aliveN = Object.values(players ?? {}).filter(p => p.alive).length;

  return (
    <SheetWindow
      fileName="進階儲存格格式工具.xlsx"
      cellRef={me ? `${String.fromCharCode(65 + Math.floor(me.x))}${Math.floor(me.y) + 1}` : 'A1'}
      formula={<>
        <span className="fn">=ITEM.WAR</span>(<span style={{ color: 'var(--accent-danger)' }}>SKILLS, HP, MP</span>)
      </>}
      statusLeft={`對戰進行中 · tick ${tick} · phase ${phase}`}
      statusRight={`存活 ${aliveN} / ${Object.keys(players ?? {}).length}`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
          <ArenaItems
            ref={arenaRef}
            players={players}
            bullets={bullets}
            traps={traps}
            selfId={selfId}
            hurtIds={hurtIds}
            now={now}
            activeEmotes={activeEmotes}
          />
          {/* 飄字 */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {floaters.map((f) => (
              <div key={f.id} style={{
                position: 'absolute',
                left: `${(f.x / ARENA_COLS) * 100}%`,
                top: `${(f.y / ARENA_ROWS) * 100}%`,
                transform: 'translate(-50%, -50%)',
                fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                color: f.color, textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                animation: 'floatUp 0.8s ease-out forwards',
              }}>{f.text}</div>
            ))}
          </div>
          {/* 戰鬥 log */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 110,
            background: 'var(--bg-paper)',
            borderTop: '1px solid var(--line-soft)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ink-soft)',
            padding: '4px 8px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column-reverse', gap: 2,
          }}>
            {[...log].reverse().map((line, i) => (
              <div key={log.length - i} style={{
                opacity: 1 - i * 0.08,
                color: line.startsWith('=ELIMINATED') ? 'var(--accent-danger)' :
                       line.startsWith('=UNDO') ? '#4f8d4f' :
                       line.startsWith('=CAST') || line.startsWith('=TRIGGER') ? 'var(--accent-link)' : 'var(--ink-soft)',
              }}>{line}</div>
            ))}
          </div>
          {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}
        </div>
        <BattleHudItems
          selfId={selfId}
          players={players}
          roundEndsAtMs={roundEndsAtMs}
          now={now}
        />
      </div>
      {/* hold T 顯示的 emote bar — position: fixed 自己 escape SheetWindow layout */}
      <EmoteBar open={emoteOpen} cooldownUntil={selfCooldownUntil} />
    </SheetWindow>
  );
}
