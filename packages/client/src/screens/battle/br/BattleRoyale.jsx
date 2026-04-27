// 大逃殺戰鬥主畫面 — 訂閱 server SNAPSHOT 渲染，每 tick 上傳 INPUT。

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG, TICK_MS, EMOTE_CD_MS, getCharacterById } from '@office-colosseum/shared';
import { ARENA_COLS, ARENA_ROWS, BULLET_DMG } from '@office-colosseum/shared/src/games/br/constants.js';
import SheetWindow from '../../../components/SheetWindow.jsx';
import ArenaBR from './ArenaBR.jsx';
import BattleHudBR from './BattleHudBR.jsx';
import { useInputBR } from './useInputBR.js';
import { useEmoteInput } from '../useEmoteInput.js';
import { useEmoteFeed } from '../useEmoteFeed.js';
import EmoteBar from '../../../components/EmoteBar.jsx';

const LOG_LIMIT = 12;

export default function BattleRoyale({ initialState, config, onEnd, readOnly = false }) {
  const socket = getSocket();
  const selfId = socket.id;

  // server state（每 tick 被 snapshot 覆寫）
  const [players, setPlayers] = useState(initialState?.state?.players ?? {});
  const [bullets, setBullets] = useState(initialState?.state?.bullets ?? []);
  // poison: server 不再每 tick 全送 infected/severe（會把 SNAPSHOT 撐到 5-10 KB）。
  // client 維護本地 infected/severe array，根據 poison_wave events 增量加進來。
  // nextWaveAtMs / waveCount 仍從 snapshot 拿（HUD 倒數用）。
  const [poison, setPoison] = useState(() => ({
    infected: initialState?.state?.poison?.infected ?? [],
    severe: initialState?.state?.poison?.severe ?? [],
    nextWaveAtMs: initialState?.state?.poison?.nextWaveAtMs ?? 0,
    waveCount: initialState?.state?.poison?.waveCount ?? 0,
  }));
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState(initialState?.state?.phase ?? 'playing');
  const [log, setLog] = useState(['=BATTLE.START("對戰開始")']);
  const [floaters, setFloaters] = useState([]);           // 飄字：damage / heal / etc.
  const [hurtIds, setHurtIds] = useState(() => new Set());
  const [poisonWaveBanner, setPoisonWaveBanner] = useState(null);

  const arenaRef = useRef(null);
  const selfPosRef = useRef({ x: 10, y: 4.5 });
  const [now, setNow] = useState(Date.now());
  const nextFloaterId = useRef(1);

  // 每 tick 更新 now（for HUD 倒數）
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // 輸入（觀戰模式不送）
  const readInput = useInputBR(arenaRef, selfPosRef);
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

  // 訂閱 SNAPSHOT / MATCH_END
  useEffect(() => {
    const onSnapshot = (snap) => {
      setTick(snap.tick);
      setPlayers(snap.players ?? {});
      setBullets(snap.bullets ?? []);
      // snap.poison 只帶 nextWaveAtMs / waveCount；infected / severe 由本地 events 增量維護
      if (snap.poison) {
        setPoison(prev => ({
          ...prev,
          nextWaveAtMs: snap.poison.nextWaveAtMs ?? prev.nextWaveAtMs,
          waveCount: snap.poison.waveCount ?? prev.waveCount,
        }));
      }
      if (snap.phase) setPhase(snap.phase);
      // 更新 selfPosRef（供 aim 計算）
      const me = snap.players?.[selfId];
      if (me) selfPosRef.current = { x: me.x, y: me.y };
      // 處理 events
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
    setFloaters((prev) => [...prev, { id, x, y, text, color, spawnedAt: Date.now() }]);
    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 800);
  }

  function markHurt(id) {
    setHurtIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setHurtIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 220);
  }

  function pushLog(line) {
    setLog((prev) => [...prev.slice(-LOG_LIMIT + 1), line]);
  }

  function processEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          markHurt(e.targetId);
          const label = e.kind === 'poison' ? `−${e.amount} #REF!` : `−${e.amount}`;
          const color = e.kind === 'poison' ? 'var(--accent-danger)' : '#cc2a1a';
          if (e.at) addFloater(e.at.x, e.at.y - 0.3, label, color);
          const src = e.sourceId ? (getCharacterById(players[e.sourceId]?.characterId)?.name ?? e.sourceId.slice(0, 4)) : '#REF!';
          const tgt = getCharacterById(players[e.targetId]?.characterId)?.name ?? e.targetId?.slice(0, 4);
          if (e.kind === 'poison') {
            pushLog(`=POISON("${tgt}") // HP−${e.amount}`);
          } else {
            pushLog(`=SHOOT("${src}","${tgt}") // HP−${e.amount}`);
          }
          break;
        }
        case 'eliminated': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=ELIMINATED("${name}")`);
          break;
        }
        case 'dash_move': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=DASH("${name}") »»»`);
          break;
        }
        case 'shield_on': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=SHIELD_ON("${name}")`);
          break;
        }
        case 'shield_off':
          // 不 spam log
          break;
        case 'shield_block': {
          if (e.at) addFloater(e.at.x, e.at.y - 0.3, 'BLOCK', 'var(--accent-link)');
          const sName = getCharacterById(players[e.shooterId]?.characterId)?.name ?? e.shooterId?.slice(0, 4);
          const dName = getCharacterById(players[e.defenderId]?.characterId)?.name ?? e.defenderId?.slice(0, 4);
          pushLog(`=BLOCK("${sName}"→"${dName}", -${BULLET_DMG} 盾)`);
          break;
        }
        case 'shield_break': {
          markHurt(e.playerId);
          if (e.at) addFloater(e.at.x, e.at.y - 0.4, 'SHIELD BROKEN!', 'var(--accent-danger)');
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=SHIELD_BREAK("${name}")`);
          break;
        }
        case 'shield_recovered': {
          const name = getCharacterById(players[e.playerId]?.characterId)?.name ?? e.playerId?.slice(0, 4);
          pushLog(`=SHIELD_OK("${name}")`);
          break;
        }
        case 'poison_wave': {
          pushLog(`=SPREAD(wave=${e.waveCount}, cells=${e.newCells?.length ?? 0})`);
          setPoisonWaveBanner({ id: Date.now(), wave: e.waveCount });
          setTimeout(() => setPoisonWaveBanner(null), 1800);
          // 增量更新本地 infected / severe
          setPoison(prev => {
            const next = { ...prev };
            if (Array.isArray(e.newCells) && e.newCells.length) {
              const seen = new Set(prev.infected);
              const added = [];
              for (const [c, r] of e.newCells) {
                const k = `${c},${r}`;
                if (!seen.has(k)) { seen.add(k); added.push(k); }
              }
              if (added.length) next.infected = [...prev.infected, ...added];
            }
            if (Array.isArray(e.newSevere) && e.newSevere.length) {
              const seen = new Set(prev.severe);
              const added = [];
              for (const [c, r] of e.newSevere) {
                const k = `${c},${r}`;
                if (!seen.has(k)) { seen.add(k); added.push(k); }
              }
              if (added.length) next.severe = [...prev.severe, ...added];
            }
            return next;
          });
          break;
        }
        default:
          break;
      }
    }
  }

  const me = players?.[selfId];
  const mapName = initialState?.state?.map?.name ?? '—';

  return (
    <SheetWindow
      fileName={`資料清理報告_${config?.mapId ?? '—'}.xlsx`}
      cellRef={me ? `${String.fromCharCode(65 + Math.max(0, Math.min(25, Math.floor(me.x))))}${Math.max(0, Math.floor(me.y)) + 1}` : 'A1'}
      formula={
        <>
          <span className="fn">=BATTLE.ROYALE</span>(
          <span style={{ color: 'var(--accent-danger)' }}>&quot;{mapName}&quot;</span>, {Object.keys(players ?? {}).length})
        </>
      }
      statusLeft={`對戰進行中 · tick ${tick} · phase ${phase}`}
      statusRight={`存活 ${Object.values(players ?? {}).filter(p => p.alive).length} / ${Object.keys(players ?? {}).length}`}
      fullscreen
    >
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 主戰場（SVG） */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
          <ArenaBR
            ref={arenaRef}
            map={initialState?.state?.map}
            players={players}
            bullets={bullets}
            poison={poison}
            selfId={selfId}
            hurtIds={hurtIds}
            activeEmotes={activeEmotes}
          />
          {/* 飄字 overlay（HTML 層） */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {floaters.map((f) => (
              <div
                key={f.id}
                style={{
                  position: 'absolute',
                  left: `${(f.x / ARENA_COLS) * 100}%`,
                  top: `${(f.y / ARENA_ROWS) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  fontWeight: 700,
                  color: f.color,
                  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  animation: 'floatUp 0.8s ease-out forwards',
                }}
              >
                {f.text}
              </div>
            ))}
          </div>
          {/* 毒圈擴散 banner */}
          {poisonWaveBanner && (
            <div style={{
              position: 'absolute', top: 12, left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--accent-danger)', color: 'var(--bg-paper)',
              padding: '4px 12px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: 1,
              pointerEvents: 'none',
            }}>
              ⚠ #REF! 擴散 · 第 {poisonWaveBanner.wave} 波
            </div>
          )}
          {/* 戰鬥 log（fixed 高度浮在底部） */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 110,
            background: 'var(--bg-paper)',
            borderTop: '1px solid var(--line-soft)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--ink-soft)',
            padding: '4px 8px',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column-reverse', gap: 2,
          }}>
            {[...log].reverse().map((line, i) => (
              <div key={log.length - i} style={{
                opacity: 1 - i * 0.08,
                color: line.startsWith('=ELIMINATED') ? 'var(--accent-danger)' : line.startsWith('=DASH') ? 'var(--accent-link)' : 'var(--ink-soft)',
              }}>
                {line}
              </div>
            ))}
          </div>
        </div>
        {/* 右側 HUD */}
        <BattleHudBR selfId={selfId} players={players} poison={poison} now={now} />
      </div>
      {/* hold T 顯示的 emote bar — position: fixed 自己 escape SheetWindow layout */}
      <EmoteBar open={emoteOpen} cooldownUntil={selfCooldownUntil} />
    </SheetWindow>
  );
}
