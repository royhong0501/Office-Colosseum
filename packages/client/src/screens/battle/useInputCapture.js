import { useEffect, useRef } from 'react';

export function useInputCapture() {
  const keys = useRef(new Set());
  const seq = useRef(0);

  useEffect(() => {
    const down = e => { keys.current.add(e.key.toLowerCase()); };
    const up = e => { keys.current.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return () => {
    const k = keys.current;
    let dir = null;
    if (k.has('w') || k.has('arrowup')) dir = 'up';
    else if (k.has('s') || k.has('arrowdown')) dir = 'down';
    else if (k.has('a') || k.has('arrowleft')) dir = 'left';
    else if (k.has('d') || k.has('arrowright')) dir = 'right';
    const attack = k.has('j');
    const skill = k.has('k');
    // consume one-shots so server sees the action exactly once per keypress
    k.delete('j'); k.delete('k');
    return { seq: ++seq.current, dir, attack, skill };
  };
}
