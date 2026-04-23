import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../net/socket.js';
import { MSG, TICK_MS, getCharacterById } from '@office-colosseum/shared';
import ArenaDisk from './battle/ArenaDisk.jsx';
import BattleHUD from './battle/BattleHUD.jsx';
import BattleLog from './battle/BattleLog.jsx';
import { useInputCapture } from './battle/useInputCapture.js';

export default function NetworkedBattle({ initialState, onEnd }) {
  const socket = getSocket();
  const [players, setPlayers] = useState(initialState?.state?.players ?? {});
  const [projectiles, setProjectiles] = useState([]);
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState(['=BATTLE.START("對戰開始")']);
  const [effects, setEffects] = useState([]);
  const [skillCasts, setSkillCasts] = useState([]);
  const [dashTrails, setDashTrails] = useState([]);
  const [muzzleFlashes, setMuzzleFlashes] = useState([]);
  const [hurtIds, setHurtIds] = useState(() => new Set());

  const arenaRef = useRef(null);
  const selfPosRef = useRef({ x: 0, y: 0 });
  const readInput = useInputCapture(arenaRef, selfPosRef);

  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    const addTransient = (setter, id, ms) => {
      setter(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setTimeout(() => setter(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      }), ms);
    };

    const onSnap = snap => {
      setPlayers(snap.players);
      setProjectiles(snap.projectiles ?? []);
      setTick(snap.tick);
      // 更新自己當前世界座標（給 useInputCapture 算 aimAngle 用）
      const selfId = socket.id;
      const me = snap.players?.[selfId];
      if (me) selfPosRef.current = { x: me.x, y: me.y };
      for (const e of snap.events ?? []) {
        if (e.type === 'projectile_spawn') {
          if (e.isSkill) {
            const id = Math.random();
            setMuzzleFlashes(list => [...list, { id, x: e.x, y: e.y, angle: e.angle, variant: e.variant ?? null }]);
            setTimeout(() => setMuzzleFlashes(list => list.filter(x => x.id !== id)), 150);
          }
        } else if (e.type === 'skill_cast') {
          // strike 的 cast 視覺由 muzzleFlash 處理；dash 由 dash_move；shield/speedBuff 由 player state。
          // 只有 burst（buff 啟動閃光）與 heal（上升粒子）走 skillCasts overlay。
          if (e.kind === 'burst' || e.kind === 'heal') {
            const id = Math.random();
            const duration = e.kind === 'burst' ? 400 : 700;
            setSkillCasts(list => [...list, { id, kind: e.kind, x: e.at.x, y: e.at.y, facing: e.facing }]);
            setTimeout(() => setSkillCasts(list => list.filter(x => x.id !== id)), duration);
          }
        } else if (e.type === 'burst_buff_on') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=BURST_BUFF("${name}") // SPEED×1.5`]);
        } else if (e.type === 'damage') {
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
          addTransient(setHurtIds, e.targetId, 220);
        } else if (e.type === 'eliminated') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=ELIMINATED("${name}")`]);
        } else if (e.type === 'dash_move') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=DASH("${name}")`]);
          const trailId = Math.random();
          setDashTrails(list => [...list, { id: trailId, from: e.from, to: e.to }]);
          setTimeout(() => setDashTrails(list => list.filter(x => x.id !== trailId)), 500);
          const id = Math.random();
          setEffects(eff => [...eff, { id, x: e.to.x, y: e.to.y, text: '»»»', color: '#5C8BB2' }]);
          setTimeout(() => setEffects(eff => eff.filter(x => x.id !== id)), 600);
        } else if (e.type === 'shield_on') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=SHIELD_ON("${name}")`]);
          const id = Math.random();
          setEffects(eff => [...eff, { id, x: e.at.x, y: e.at.y, text: '盾', color: '#7BA05B' }]);
          setTimeout(() => setEffects(eff => eff.filter(x => x.id !== id)), 900);
        } else if (e.type === 'heal') {
          const name = getCharacterById(snap.players[e.playerId]?.characterId)?.name ?? e.playerId.slice(0, 4);
          setLog(l => [...l.slice(-8), `=HEAL("${name}") // HP=+${e.amount}`]);
          const id = Math.random();
          setEffects(eff => [...eff, { id, x: e.at.x, y: e.at.y, text: `+${e.amount}`, color: '#4A9B5E' }]);
          setTimeout(() => setEffects(eff => eff.filter(x => x.id !== id)), 800);
        }
      }
    };
    const onEndMsg = m => onEnd({ ...m, players: playersRef.current });
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

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FDFBF7' }}>
      <BattleHUD players={playerList} selfId={selfId} now={now} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ArenaDisk
          ref={arenaRef}
          players={playerList}
          effects={effects}
          projectiles={projectiles}
          skillCasts={skillCasts}
          dashTrails={dashTrails}
          muzzleFlashes={muzzleFlashes}
          hurtIds={hurtIds}
          selfId={selfId}
          now={now}
        />
      </div>
      <BattleLog log={log} />
    </div>
  );
}
