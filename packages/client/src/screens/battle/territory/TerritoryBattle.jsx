// 數據領地爭奪戰主畫面 — 訂閱 SNAPSHOT + 渲染 + WASD 輸入。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG, TICK_MS, EMOTE_CD_MS, getCharacterById } from '@office-colosseum/shared';
import SheetWindow from '../../../components/SheetWindow.jsx';
import ArenaTerritory from './ArenaTerritory.jsx';
import BattleHudTerritory from './BattleHudTerritory.jsx';
import { useInputTerritory } from './useInputTerritory.js';
import { useEmoteInput } from '../useEmoteInput.js';
import { useEmoteFeed } from '../useEmoteFeed.js';
import EmoteBar from '../../../components/EmoteBar.jsx';

const LOG_LIMIT = 10;

export default function TerritoryBattle({ initialState, config, onEnd, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;

  const [players, setPlayers] = useState(initialState?.state?.players ?? {});
  const [teams, setTeams] = useState(initialState?.state?.teams ?? []);
  const [cells, setCells] = useState(initialState?.state?.cells ?? {});
  const [counts, setCounts] = useState(initialState?.state?.counts ?? []);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState(initialState?.state?.phase ?? 'playing');
  const [roundEndsAtMs, setRoundEndsAtMs] = useState(initialState?.state?.roundEndsAtMs ?? 0);
  const [log, setLog] = useState(['=BATTLE.START("領地爭奪戰")']);
  const [now, setNow] = useState(Date.now());

  const arenaRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const readInput = useInputTerritory();
  const { emoteOpen, consume: consumeEmote } = useEmoteInput();
  const activeEmotes = useEmoteFeed();
  const [selfCooldownUntil, setSelfCooldownUntil] = useState(0);
  useEffect(() => {
    if (readOnly) return undefined;
    const id = setInterval(() => {
      if (phase !== 'playing') return;
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
  }, [phase, readInput, socket, readOnly, consumeEmote, selfCooldownUntil]);

  useEffect(() => {
    const onSnapshot = (snap) => {
      setTick(snap.tick);
      setPlayers(snap.players ?? {});
      if (snap.teams) setTeams(snap.teams);
      // cells 不再 per-tick 全送，靠 events 增量更新
      if (snap.counts) setCounts(snap.counts);
      if (snap.phase) setPhase(snap.phase);
      if (snap.roundEndsAtMs) setRoundEndsAtMs(snap.roundEndsAtMs);
      if (Array.isArray(snap.events)) {
        applyCellEvents(snap.events);
        processEvents(snap.events);
      }
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

  function pushLog(line) { setLog((prev) => [...prev.slice(-LOG_LIMIT + 1), line]); }

  // server 不再每 tick 送 cells；client 維護本地 map，根據 paint / area_captured events 增量更新。
  // 同一 tick 可能有多個 events，全部累進一個 patch 再 setCells，避免多次 React re-render。
  function applyCellEvents(events) {
    let patch = null;
    for (const e of events) {
      if (e.type === 'paint' && Array.isArray(e.cells)) {
        for (const [c, r, teamId] of e.cells) {
          if (!patch) patch = {};
          patch[`${c},${r}`] = teamId;
        }
      } else if (e.type === 'area_captured' && Array.isArray(e.cells)) {
        for (const [c, r] of e.cells) {
          if (!patch) patch = {};
          patch[`${c},${r}`] = e.teamId;
        }
      }
    }
    if (patch) setCells(prev => ({ ...prev, ...patch }));
  }

  function processEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'area_captured': {
          const team = teams?.[e.teamId];
          pushLog(`=FORMATBRUSH(${team?.name ?? `T${e.teamId}`}) // +${e.cells?.length ?? 0} cells`);
          break;
        }
        default: break;
      }
    }
  }

  const self = players?.[selfId];

  return (
    <SheetWindow
      fileName="條件式格式化_塗色進度.xlsx"
      cellRef={self ? `${String.fromCharCode(65 + Math.floor(self.x))}${Math.floor(self.y) + 1}` : 'A1'}
      formula={<>
        <span className="fn">=TERRITORY</span>(<span style={{ color: 'var(--accent-danger)' }}>COUNTIF(COLOR=TEAM)</span>)
      </>}
      statusLeft={`對戰進行中 · tick ${tick} · phase ${phase}`}
      statusRight={`${(counts ?? []).map((n, i) => `${teams?.[i]?.name ?? `T${i}`} ${n}`).join(' · ')}`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
          <ArenaTerritory
            ref={arenaRef}
            teams={teams}
            players={players}
            cells={cells}
            selfId={selfId}
            activeEmotes={activeEmotes}
          />
          {/* 戰鬥 log */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 90,
            background: 'var(--bg-paper)',
            borderTop: '1px solid var(--line-soft)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--ink-soft)',
            padding: '4px 8px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column-reverse', gap: 2,
          }}>
            {[...log].reverse().map((line, i) => (
              <div key={log.length - i} style={{
                opacity: 1 - i * 0.1,
                color: line.startsWith('=FORMATBRUSH') ? 'var(--accent-link)' : 'var(--ink-soft)',
              }}>{line}</div>
            ))}
          </div>
        </div>
        <BattleHudTerritory
          selfId={selfId}
          teams={teams}
          players={players}
          counts={counts}
          roundEndsAtMs={roundEndsAtMs}
          now={now}
        />
      </div>
      <EmoteBar open={emoteOpen && !readOnly} cooldownUntil={selfCooldownUntil} />
    </SheetWindow>
  );
}
