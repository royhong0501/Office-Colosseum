// 角色化身：程序化 pixel 貓/狗 + 三層狀態機動作（沿用 games-characters.css keyframes）。
//   - IDLE（think/wait/sniff/idle）無限循環
//   - KEY/BURST（stamp/win/mine…）單次播放，dur 後自動回到 idleAction
// 用法：
//   const ref = useRef();
//   <CharacterActor ref={ref} characterId="shiba" idleAction="think" size="lg" />
//   ref.current.play('stamp');   // 觸發單次動作

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { spriteFor } from '../lib/breedSprite.js';
import { ACTIONS } from '../screens/battle/characterActions.js';

const BASE = 2.4;              // sprite 放大倍率（40 → 96px）
const SPRITE = 40 * BASE;      // 96
const BOX_W = 200, BOX_H = 180;
const SPRITE_LEFT = (BOX_W - SPRITE) / 2;   // 52
const SPRITE_TOP = BOX_H - SPRITE - 8;      // 76

function FxNode({ fx, palette }) {
  const base = { left: fx.x, top: fx.y };
  if (fx.delay) base.animationDelay = `calc(var(--dur) * ${fx.delay})`;
  switch (fx.t) {
    case 'shadow':
      return <div className="shadow" style={{ left: 60, top: 168 }} />;
    case 'pop':
      return <div className={`fx fx-pop ${fx.cls || ''}`} style={{ ...base, zIndex: 40 }}>{fx.text}</div>;
    case 'bubble':
      return <div className="fx fx-bubble" style={{ ...base, zIndex: 35 }}>{fx.text}</div>;
    case 'spark':
      return <div className={`fx fx-spark ${fx.cls || ''}`} style={base} />;
    case 'sweat':
      return <div className="fx fx-sweat" style={base} />;
    case 'smoke':
      return <div className="fx fx-smoke" style={{ ...base, zIndex: 33 }} />;
    case 'boom':
      return <div className="fx fx-boom" style={{ ...base, zIndex: 34 }} />;
    case 'gloom':
      return <div className="fx fx-gloom" style={{ ...base, zIndex: 40 }} />;
    case 'sniff':
      return <div className="fx fx-sniff" style={base} />;
    case 'paw':
      return <div className="fx fx-paw" style={{ ...base, '--fur': palette?.base, '--furOut': palette?.outline }} />;
    case 'flag':
      return (
        <div className="fx fx-flag" style={{ ...base, width: 16, height: 24, zIndex: 36 }}>
          <div className="pole" /><div className="cloth" />
        </div>
      );
    case 'dizzy':
      return (
        <div className="fx fx-dizzy" style={{ ...base, zIndex: 40 }}>
          <div className="st" /><div className="st" /><div className="st" />
        </div>
      );
    default:
      return null;
  }
}

const ANCHOR_ORIGIN = { br: 'right bottom', tr: 'right top', bl: 'left bottom', center: 'center bottom' };

const CharacterActor = forwardRef(function CharacterActor(
  { characterId, idleAction = 'idle', scale = 1, anchor = 'br' },
  ref,
) {
  const { url, P } = useMemo(() => spriteFor(characterId), [characterId]);
  const [current, setCurrent] = useState(idleAction);
  const idleRef = useRef(idleAction);
  const playingRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    idleRef.current = idleAction;
    if (!playingRef.current) setCurrent(idleAction);
  }, [idleAction]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useImperativeHandle(ref, () => ({
    play(name) {
      const cfg = ACTIONS[name];
      if (!cfg) return;
      playingRef.current = true;
      setCurrent(name);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        playingRef.current = false;
        setCurrent(idleRef.current);
      }, cfg.dur * 1000 + 80);
    },
  }), []);

  const cfg = ACTIONS[current] ?? ACTIONS.idle;
  const oneShot = !cfg.loop;

  return (
    <div
      className={`char-actor act-${current}${oneShot ? ' oneshot' : ''}`}
      style={{
        position: 'relative',
        width: BOX_W, height: BOX_H,
        '--dur': `${cfg.dur}s`,
        '--fur': P?.base, '--furOut': P?.outline,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: ANCHOR_ORIGIN[anchor] ?? 'right bottom',
      }}
    >
      <div className="sprite" style={{ width: SPRITE, height: SPRITE, left: SPRITE_LEFT, top: SPRITE_TOP }}>
        <img src={url} alt="" width={SPRITE} height={SPRITE} draggable={false} />
      </div>
      {(cfg.fx ?? []).map((fx, i) => <FxNode key={`${current}-${i}`} fx={fx} palette={P} />)}
    </div>
  );
});

export default CharacterActor;
