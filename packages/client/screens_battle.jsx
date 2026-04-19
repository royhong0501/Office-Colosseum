// Battle Screen for HiiiColosseum

function BattleScreen({ p1, p2, onNavigate }) {
  const GRID_W = 16, GRID_H = 10;
  const [p1Pos, setP1Pos] = React.useState({ x: 2, y: 5 });
  const [p2Pos, setP2Pos] = React.useState({ x: 13, y: 5 });
  const [p1Hp, setP1Hp] = React.useState(p1.stats.hp);
  const [p2Hp, setP2Hp] = React.useState(p2.stats.hp);
  const [battleLog, setBattleLog] = React.useState(['=BATTLE.START("對戰開始")', `=LOAD("${p1.name}","${p2.name}")`, '// 使用 WASD 移動, J=攻擊, K=技能']);
  const [effects, setEffects] = React.useState([]);
  const [gameOver, setGameOver] = React.useState(null);
  const [p1Anim, setP1Anim] = React.useState(null);
  const [p2Anim, setP2Anim] = React.useState(null);
  const [p2Cooldown, setP2Cooldown] = React.useState(0);
  const [p1SkillCd, setP1SkillCd] = React.useState(0);
  const containerRef = React.useRef(null);
  const gameLoopRef = React.useRef(null);
  const keysRef = React.useRef({});

  const addLog = (msg) => setBattleLog(prev => [...prev.slice(-8), msg]);
  const addEffect = (x, y, text, color) => {
    const id = Date.now() + Math.random();
    setEffects(prev => [...prev, { id, x, y, text, color }]);
    setTimeout(() => setEffects(prev => prev.filter(e => e.id !== id)), 800);
  };

  // Damage calc
  const calcDamage = (attacker, defender, isSkill) => {
    const base = isSkill ? attacker.stats.spc : attacker.stats.atk;
    const def = defender.stats.def;
    const dmg = Math.max(1, Math.floor(base * (1 - def / (def + 80)) * (0.85 + Math.random() * 0.3)));
    return isSkill ? Math.floor(dmg * 1.5) : dmg;
  };

  // Distance
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // P1 attack
  const p1Attack = React.useCallback((isSkill) => {
    if (gameOver) return;
    const d = dist(p1Pos, p2Pos);
    if (d > 2) {
      addLog('// ERROR: 距離太遠，無法攻擊');
      return;
    }
    if (isSkill && p1SkillCd > 0) {
      addLog(`// COOLDOWN: 技能冷卻中 (${p1SkillCd})`);
      return;
    }
    const dmg = calcDamage(p1, p2, isSkill);
    setP2Hp(prev => {
      const next = Math.max(0, prev - dmg);
      if (next <= 0) setGameOver('p1');
      return next;
    });
    setP1Anim('attack');
    setTimeout(() => setP1Anim(null), 300);
    addEffect(p2Pos.x, p2Pos.y, isSkill ? `💥${dmg}` : `-${dmg}`, isSkill ? '#B85450' : '#DAA520');
    addLog(isSkill
      ? `=SKILL("${p1.name}","${p1.skill}") // DMG=${dmg}`
      : `=ATTACK("${p1.name}") // DMG=${dmg}`);
    if (isSkill) setP1SkillCd(5);
  }, [p1Pos, p2Pos, gameOver, p1SkillCd, p1, p2]);

  // P2 AI
  React.useEffect(() => {
    if (gameOver) return;
    const aiTick = setInterval(() => {
      setP2Cooldown(cd => {
        if (cd > 0) return cd - 1;
        // AI action
        setP2Pos(prev => {
          setP1Pos(p1p => {
            const d = dist(p1p, prev);
            if (d <= 2) {
              // Attack
              const isSkill = Math.random() < 0.2;
              const dmg = calcDamage(p2, p1, isSkill);
              setP1Hp(hp => {
                const next = Math.max(0, hp - dmg);
                if (next <= 0) setGameOver('p2');
                return next;
              });
              setP2Anim('attack');
              setTimeout(() => setP2Anim(null), 300);
              addEffect(p1p.x, p1p.y, isSkill ? `💥${dmg}` : `-${dmg}`, '#B85450');
              addLog(isSkill
                ? `=AI.SKILL("${p2.name}","${p2.skill}") // DMG=${dmg}`
                : `=AI.ATTACK("${p2.name}") // DMG=${dmg}`);
            }
            return p1p;
          });
          // Move toward p1
          const d = dist(p1Pos, prev);
          if (d > 2) {
            let nx = prev.x, ny = prev.y;
            if (p1Pos.x < prev.x) nx--;
            else if (p1Pos.x > prev.x) nx++;
            else if (p1Pos.y < prev.y) ny--;
            else if (p1Pos.y > prev.y) ny++;
            nx = Math.max(0, Math.min(GRID_W - 1, nx));
            ny = Math.max(0, Math.min(GRID_H - 1, ny));
            return { x: nx, y: ny };
          }
          return prev;
        });
        return Math.floor(3 + (100 - p2.stats.spd) / 20);
      });
    }, 600);
    return () => clearInterval(aiTick);
  }, [gameOver, p1, p2]);

  // Keyboard input
  React.useEffect(() => {
    if (gameOver) return;
    const onDown = (e) => { keysRef.current[e.key.toLowerCase()] = true; };
    const onUp = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    const loop = setInterval(() => {
      const k = keysRef.current;
      setP1Pos(prev => {
        let { x, y } = prev;
        if (k['w'] || k['arrowup']) y = Math.max(0, y - 1);
        if (k['s'] || k['arrowdown']) y = Math.min(GRID_H - 1, y + 1);
        if (k['a'] || k['arrowleft']) x = Math.max(0, x - 1);
        if (k['d'] || k['arrowright']) x = Math.min(GRID_W - 1, x + 1);
        // clear movement keys after processing
        k['w'] = k['s'] = k['a'] = k['d'] = false;
        k['arrowup'] = k['arrowdown'] = k['arrowleft'] = k['arrowright'] = false;
        return { x, y };
      });
      if (k['j']) { k['j'] = false; p1Attack(false); }
      if (k['k']) { k['k'] = false; p1Attack(true); }
    }, 150);

    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); clearInterval(loop); };
  }, [gameOver, p1Attack]);

  // Skill cooldown tick
  React.useEffect(() => {
    if (gameOver) return;
    const t = setInterval(() => setP1SkillCd(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [gameOver]);

  const colLabels = 'ABCDEFGHIJKLMNOP'.split('');

  // Arena cell
  const isArenaCenter = (x, y) => {
    const cx = GRID_W / 2, cy = GRID_H / 2;
    const dx = (x - cx + 0.5) / (GRID_W / 2);
    const dy = (y - cy + 0.5) / (GRID_H / 2);
    return dx * dx + dy * dy < 1;
  };

  return React.createElement('div', {
    ref: containerRef, tabIndex: 0,
    style: { height: '100%', display: 'flex', flexDirection: 'column', background: excelColors.cellBg, outline: 'none' },
  },
    // Top stats bar (like a formula area)
    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '6px 12px',
        borderBottom: `2px solid ${excelColors.accent}`, background: excelColors.headerBg,
        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", Consolas, monospace', fontSize: 11,
      }
    },
      // P1 info
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('div', { style: { background: excelColors.cellBg, padding: 4, borderRadius: 3, border: `1px solid ${excelColors.cellBorder}` } },
          React.createElement(AsciiCharacter, { character: p1, scale: 0.7 }),
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 700, color: excelColors.greenAccent } }, `P1: ${p1.name}`),
          React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 } },
            React.createElement('span', { style: { fontSize: 10, color: excelColors.textLight } }, 'HP:'),
            React.createElement('div', { style: { width: 100, height: 10, background: excelColors.cellBorder, borderRadius: 2, overflow: 'hidden' } },
              React.createElement('div', { style: { width: `${(p1Hp / p1.stats.hp) * 100}%`, height: '100%', background: p1Hp > p1.stats.hp * 0.3 ? excelColors.greenAccent : excelColors.redAccent, transition: 'width 0.3s' } }),
            ),
            React.createElement('span', { style: { fontSize: 10, fontWeight: 600 } }, `${p1Hp}/${p1.stats.hp}`),
          ),
        ),
      ),
      React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: excelColors.accent, alignSelf: 'center' } }, '⚔ VS'),
      // P2 info
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('div', { style: { textAlign: 'right' } },
          React.createElement('div', { style: { fontWeight: 700, color: excelColors.redAccent } }, `P2: ${p2.name}`),
          React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center', marginTop: 2, justifyContent: 'flex-end' } },
            React.createElement('span', { style: { fontSize: 10, fontWeight: 600 } }, `${p2Hp}/${p2.stats.hp}`),
            React.createElement('div', { style: { width: 100, height: 10, background: excelColors.cellBorder, borderRadius: 2, overflow: 'hidden' } },
              React.createElement('div', { style: { width: `${(p2Hp / p2.stats.hp) * 100}%`, height: '100%', background: p2Hp > p2.stats.hp * 0.3 ? excelColors.redAccent : '#888', transition: 'width 0.3s', marginLeft: 'auto' } }),
            ),
            React.createElement('span', { style: { fontSize: 10, color: excelColors.textLight } }, 'HP:'),
          ),
        ),
        React.createElement('div', { style: { background: excelColors.cellBg, padding: 4, borderRadius: 3, border: `1px solid ${excelColors.cellBorder}` } },
          React.createElement(AsciiCharacter, { character: p2, scale: 0.7, direction: -1 }),
        ),
      ),
    ),
    // Main area: arena grid + log
    React.createElement('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
      // Arena grid
      React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' } },
        // Col headers
        React.createElement('div', {
          style: { display: 'grid', gridTemplateColumns: `28px repeat(${GRID_W}, 1fr)`, background: excelColors.headerBg }
        },
          React.createElement('div', { style: { borderRight: `0.5px solid ${excelColors.cellBorder}`, borderBottom: `0.5px solid ${excelColors.cellBorder}` } }),
          ...colLabels.slice(0, GRID_W).map(l => React.createElement('div', {
            key: l, style: { textAlign: 'center', fontSize: 9, padding: '1px 0', color: excelColors.textLight, borderRight: `0.5px solid ${excelColors.cellBorder}`, borderBottom: `0.5px solid ${excelColors.cellBorder}`, fontFamily: 'Consolas, monospace' }
          }, l)),
        ),
        // Grid rows
        React.createElement('div', { style: { flex: 1, display: 'grid', gridTemplateColumns: `28px repeat(${GRID_W}, 1fr)`, gridTemplateRows: `repeat(${GRID_H}, 1fr)`, position: 'relative' } },
          ...Array.from({ length: GRID_H }, (_, row) => [
            React.createElement('div', {
              key: `r${row}`, style: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: excelColors.textLight, background: excelColors.headerBg, borderRight: `0.5px solid ${excelColors.cellBorder}`, borderBottom: `0.5px solid ${excelColors.cellBorder}`, fontFamily: 'Consolas, monospace' }
            }, row + 1),
            ...Array.from({ length: GRID_W }, (_, col) => {
              const isP1 = p1Pos.x === col && p1Pos.y === row;
              const isP2 = p2Pos.x === col && p2Pos.y === row;
              const inArena = isArenaCenter(col, row);
              const eff = effects.find(e => e.x === col && e.y === row);
              return React.createElement('div', {
                key: `c${row}-${col}`,
                style: {
                  border: `0.5px solid ${excelColors.cellBorder}`,
                  background: isP1 ? '#E8F0E0' : isP2 ? '#F0E0E0' : inArena ? '#F8F4EC' : excelColors.cellBg,
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontFamily: 'Consolas, monospace', overflow: 'hidden',
                  boxShadow: inArena ? 'inset 0 0 4px rgba(139,115,85,0.08)' : 'none',
                }
              },
                // Arena circle hint
                !isP1 && !isP2 && inArena && React.createElement('span', { style: { color: excelColors.cellBorder, fontSize: 7 } }, '·'),
                // Characters
                isP1 && React.createElement('div', {
                  style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: p1Anim === 'attack' ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }
                }, React.createElement(AsciiCharacter, { character: p1, scale: 0.55, highlight: true, direction: p2Pos.x >= p1Pos.x ? 1 : -1 })),
                isP2 && React.createElement('div', {
                  style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: p2Anim === 'attack' ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }
                }, React.createElement(AsciiCharacter, { character: p2, scale: 0.55, highlight: true, direction: p1Pos.x >= p2Pos.x ? -1 : 1 })),
                // Effects
                eff && React.createElement('div', {
                  style: {
                    position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                    color: eff.color, fontWeight: 900, fontSize: 14, zIndex: 50,
                    animation: 'floatUp 0.8s ease-out forwards', pointerEvents: 'none',
                    textShadow: '0 0 6px rgba(0,0,0,0.3)',
                  }
                }, eff.text),
              );
            }),
          ]).flat(),
        ),
      ),
      // Battle log (like a console/formula pane)
      React.createElement('div', {
        style: {
          width: 260, borderLeft: `2px solid ${excelColors.accent}`,
          display: 'flex', flexDirection: 'column', background: excelColors.headerBg,
        }
      },
        React.createElement('div', { style: { padding: '4px 8px', fontSize: 10, fontWeight: 700, borderBottom: `1px solid ${excelColors.cellBorder}`, color: excelColors.accent, fontFamily: '"Microsoft JhengHei", sans-serif' } }, '📝 公式記錄 (Battle Log)'),
        React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: '4px 8px', fontFamily: 'Consolas, monospace', fontSize: 10, lineHeight: 1.6 } },
          battleLog.map((log, i) => React.createElement('div', {
            key: i, style: { color: log.includes('ERROR') ? excelColors.redAccent : log.includes('SKILL') ? excelColors.blueAccent : excelColors.text, borderBottom: `0.5px solid ${excelColors.cellBorder}22`, padding: '2px 0' }
          }, log))
        ),
        // Controls help
        React.createElement('div', {
          style: { padding: 8, borderTop: `1px solid ${excelColors.cellBorder}`, fontSize: 10, fontFamily: '"Microsoft JhengHei", Consolas, monospace', color: excelColors.textLight }
        },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 4, color: excelColors.accent } }, '⌨ 快捷鍵'),
          React.createElement('div', null, 'WASD / 方向鍵 = 移動'),
          React.createElement('div', null, 'J = 普通攻擊'),
          React.createElement('div', null, `K = 技能 (${p1.skill}) ${p1SkillCd > 0 ? `[CD:${p1SkillCd}]` : '[就緒]'}`),
        ),
      ),
    ),
    // Game Over overlay
    gameOver && React.createElement('div', {
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(74,63,53,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500, fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      }
    },
      React.createElement('div', {
        style: { background: excelColors.cellBg, border: `3px solid ${excelColors.accent}`, borderRadius: 8, padding: '32px 48px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }
      },
        React.createElement('div', { style: { fontSize: 14, color: excelColors.textLight, marginBottom: 8 } }, '=RESULT()'),
        React.createElement('div', { style: { fontSize: 28, fontWeight: 700, color: excelColors.accent, marginBottom: 8 } },
          gameOver === 'p1' ? '🏆 P1 勝利！' : '🏆 P2 勝利！'
        ),
        React.createElement('div', { style: { fontSize: 16, marginBottom: 20, color: excelColors.text } },
          `${gameOver === 'p1' ? p1.name : p2.name} 贏得了這場對戰`
        ),
        React.createElement('div', {
          style: { display: 'flex', gap: 12, justifyContent: 'center' }
        },
          React.createElement('div', {
            style: { padding: '8px 20px', background: excelColors.accent, color: '#F5F0E8', borderRadius: 3, cursor: 'pointer', fontWeight: 600 },
            onClick: () => onNavigate('select'),
          }, '📊 返回選擇'),
          React.createElement('div', {
            style: { padding: '8px 20px', background: excelColors.accent, color: '#F5F0E8', borderRadius: 3, cursor: 'pointer', fontWeight: 600 },
            onClick: () => onNavigate('results'),
          }, '📈 查看報表'),
        ),
      ),
    ),
  );
}

// ============ RESULTS SCREEN ============
function ResultsScreen({ onNavigate, history }) {
  const fakeHistory = history.length > 0 ? history : [
    { p1: '哈士奇', p2: '曼赤肯', winner: '哈士奇', date: '04/19 14:23', dmgDealt: 245, dmgTaken: 180 },
    { p1: '柴犬', p2: '波斯貓', winner: '波斯貓', date: '04/19 13:50', dmgDealt: 198, dmgTaken: 220 },
    { p1: '柯基', p2: '孟加拉貓', winner: '柯基', date: '04/19 12:15', dmgDealt: 312, dmgTaken: 267 },
    { p1: '鬥牛犬', p2: '緬因貓', winner: '緬因貓', date: '04/18 18:40', dmgDealt: 156, dmgTaken: 190 },
  ];

  return React.createElement('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: excelColors.cellBg, fontFamily: '"Microsoft JhengHei", "Noto Sans TC", Consolas, monospace' } },
    // Title row
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: '36px 1fr', borderBottom: `2px solid ${excelColors.accent}` }
    },
      React.createElement(Cell, { header: true, style: { textAlign: 'center' } }, '1'),
      React.createElement(Cell, { header: true, style: { fontSize: 14, fontWeight: 700, color: excelColors.accent, padding: '8px 12px' } }, '📈 對戰績效分析報表 — BATTLE_PERFORMANCE_REPORT.xlsx'),
    ),
    // Summary stats row
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: '36px repeat(4, 1fr)', borderBottom: `1px solid ${excelColors.cellBorder}` }
    },
      React.createElement(Cell, { header: true, style: { textAlign: 'center' } }, '2'),
      React.createElement(Cell, { style: { textAlign: 'center', background: '#E8F0E0' } }, `總場次: ${fakeHistory.length}`),
      React.createElement(Cell, { style: { textAlign: 'center', background: '#F0E0E0' } }, `🐶勝場: ${fakeHistory.filter(h => DOG_BREEDS.some(d => d.name === h.winner)).length}`),
      React.createElement(Cell, { style: { textAlign: 'center', background: '#E0E8F0' } }, `🐱勝場: ${fakeHistory.filter(h => CAT_BREEDS.some(c => c.name === h.winner)).length}`),
      React.createElement(Cell, { style: { textAlign: 'center' } }, `平均傷害: ${Math.round(fakeHistory.reduce((s, h) => s + h.dmgDealt, 0) / fakeHistory.length)}`),
    ),
    // Table headers
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr 100px 80px 80px', borderBottom: `2px solid ${excelColors.accent}` }
    },
      React.createElement(Cell, { header: true, style: { textAlign: 'center' } }, '3'),
      ...['P1 角色', 'P2 角色', '勝者', '日期', '輸出DMG', '承受DMG'].map(h =>
        React.createElement(Cell, { key: h, header: true, style: { fontWeight: 700, textAlign: 'center' } }, h)
      ),
    ),
    // Data rows
    React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
      fakeHistory.map((h, i) => React.createElement('div', {
        key: i,
        style: { display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr 100px 80px 80px', borderBottom: `0.5px solid ${excelColors.cellBorder}`, background: i % 2 === 0 ? 'transparent' : excelColors.headerBg + '40' }
      },
        React.createElement(Cell, { header: true, style: { textAlign: 'center' } }, i + 4),
        React.createElement(Cell, null, h.p1),
        React.createElement(Cell, null, h.p2),
        React.createElement(Cell, { style: { fontWeight: 700, color: excelColors.greenAccent } }, `🏆 ${h.winner}`),
        React.createElement(Cell, { style: { color: excelColors.textLight } }, h.date),
        React.createElement(Cell, { style: { textAlign: 'right', color: excelColors.blueAccent } }, h.dmgDealt),
        React.createElement(Cell, { style: { textAlign: 'right', color: excelColors.redAccent } }, h.dmgTaken),
      ))
    ),
    // Bottom action
    React.createElement('div', {
      style: { padding: '8px 12px', borderTop: `2px solid ${excelColors.accent}`, display: 'flex', gap: 12, justifyContent: 'center', background: excelColors.headerBg }
    },
      React.createElement('div', {
        style: { padding: '6px 20px', background: excelColors.accent, color: '#F5F0E8', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: 12 },
        onClick: () => onNavigate('select'),
      }, '⚔ 新增對戰'),
      React.createElement('div', {
        style: { padding: '6px 20px', background: excelColors.accent, color: '#F5F0E8', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: 12 },
        onClick: () => onNavigate('menu'),
      }, '🏠 返回首頁'),
    ),
  );
}

window.BattleScreen = BattleScreen;
window.ResultsScreen = ResultsScreen;
