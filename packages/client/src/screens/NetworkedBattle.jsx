import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../net/socket.js';
import { MSG, TICK_MS, getCharacterById } from '@office-colosseum/shared';
import ArenaGrid from './battle/ArenaGrid.jsx';
import BattleHUD from './battle/BattleHUD.jsx';
import BattleLog from './battle/BattleLog.jsx';
import { useInputCapture } from './battle/useInputCapture.js';

export default function NetworkedBattle({ initialState, onEnd }) {
  const socket = getSocket();
  const [players, setPlayers] = useState(initialState?.state?.players ?? {});
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState(['=BATTLE.START("對戰開始")']);
  const [effects, setEffects] = useState([]);
  const readInput = useInputCapture();

  useEffect(() => {
    const onSnap = snap => {
      setPlayers(snap.players);
      setTick(snap.tick);
      for (const e of snap.events ?? []) {
        if (e.type === 'damage') {
          const src = getCharacterById(snap.players[e.sourceId]?.characterId)?.name ?? e.sourceId.slice(0, 4);
          const tgt = getCharacterById(snap.players[e.targetId]?.characterId)?.name ?? e.targetId.slice(0, 4);
          setLog(l => [...l.slice(-8),
            `=${e.isSkill ? 'SKILL' : 'ATTACK'}("${src}","${tgt}") // DMG=${e.amount}`]);
          const id = Math.random();
          setEffects(eff => [...eff, {
            id, x: e.at.x, y: e.at.y,
            text: e.isSkill ? `💥${e.amount}` : `-${e.amount}`,
            color: e.isSkill ? '#B85450' : '#DAA520',
          }]);
          setTimeout(() => setEffects(eff => eff.filter(x => x.id !== id)), 800);
        } else if (e.type === 'eliminated') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=ELIMINATED("${name}")`]);
        }
      }
    };
    const onEndMsg = m => onEnd(m);
    socket.on(MSG.SNAPSHOT, onSnap);
    socket.on(MSG.MATCH_END, onEndMsg);
    const interval = setInterval(() => socket.emit(MSG.INPUT, readInput()), TICK_MS);
    return () => {
      socket.off(MSG.SNAPSHOT, onSnap);
      socket.off(MSG.MATCH_END, onEndMsg);
      clearInterval(interval);
    };
  }, []);

  const selfId = socket.id;
  const playerList = Object.values(players);

  // Track now for skill cooldown countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FDFBF7' }}>
      <BattleHUD players={playerList} selfId={selfId} now={now} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ArenaGrid players={playerList} effects={effects} selfId={selfId} />
      </div>
      <BattleLog log={log} />
    </div>
  );
}
