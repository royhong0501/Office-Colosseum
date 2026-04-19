// Game screens for HiiiColosseum

// ============ MAIN MENU ============
function MainMenuScreen({ onNavigate }) {
  const [hoveredCell, setHoveredCell] = React.useState(null);
  const recentFiles = [
    { name: '對戰紀錄_2026Q1.xlsx', date: '2026/04/18', size: '2.4MB' },
    { name: '角色能力值分析.xlsx', date: '2026/04/15', size: '1.8MB' },
    { name: '賽季排名表.xlsx', date: '2026/04/10', size: '956KB' },
  ];

  return React.createElement('div', { style: { display: 'flex', height: '100%', background: excelColors.cellBg } },
    // Left panel - "Start" area
    React.createElement('div', {
      style: {
        width: 280, background: excelColors.accent, color: '#F5F0E8',
        padding: '40px 24px', display: 'flex', flexDirection: 'column',
        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      }
    },
      React.createElement('div', { style: { fontSize: 28, fontWeight: 700, marginBottom: 4, letterSpacing: 2 } }, '📋 HiiiCalc'),
      React.createElement('div', { style: { fontSize: 11, opacity: 0.7, marginBottom: 40 } }, 'v3.2.1 — 試算表管理工具'),
      React.createElement('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 16, opacity: 0.8 } }, '快速開始'),
      [
        { icon: '⚔', label: '新增對戰分析', desc: '選擇角色進入競技場', target: 'select' },
        { icon: '📊', label: '角色資料庫', desc: '查看所有角色能力值', target: 'select' },
        { icon: '📈', label: '戰績報表', desc: '歷史對戰數據分析', target: 'results' },
      ].map((item, i) => React.createElement('div', {
        key: i,
        style: {
          padding: '12px 16px', marginBottom: 8, borderRadius: 4, cursor: 'pointer',
          background: hoveredCell === `menu${i}` ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
          transition: 'background 0.2s',
        },
        onMouseEnter: () => setHoveredCell(`menu${i}`),
        onMouseLeave: () => setHoveredCell(null),
        onClick: () => onNavigate(item.target),
      },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 600 } }, `${item.icon} ${item.label}`),
        React.createElement('div', { style: { fontSize: 10, opacity: 0.6, marginTop: 2 } }, item.desc),
      )),
      React.createElement('div', { style: { flex: 1 } }),
      React.createElement('div', { style: { fontSize: 9, opacity: 0.4 } }, '© 2026 Hiii Corp. 版權所有'),
    ),
    // Right panel - recent files
    React.createElement('div', {
      style: { flex: 1, padding: '40px 48px', fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif' }
    },
      React.createElement('div', { style: { fontSize: 18, fontWeight: 600, color: excelColors.text, marginBottom: 24 } }, '最近開啟的檔案'),
      React.createElement('div', {
        style: { border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4, overflow: 'hidden' }
      },
        React.createElement('div', {
          style: {
            display: 'grid', gridTemplateColumns: '1fr 120px 80px',
            background: excelColors.headerBg, padding: '8px 12px', fontSize: 11, fontWeight: 600, color: excelColors.textLight,
            borderBottom: `1px solid ${excelColors.cellBorder}`,
          }
        }, ...[React.createElement('span', { key: 'n' }, '名稱'), React.createElement('span', { key: 'd' }, '修改日期'), React.createElement('span', { key: 's' }, '大小')]),
        recentFiles.map((f, i) => React.createElement('div', {
          key: i,
          style: {
            display: 'grid', gridTemplateColumns: '1fr 120px 80px',
            padding: '10px 12px', fontSize: 12, color: excelColors.text,
            borderBottom: i < recentFiles.length - 1 ? `1px solid ${excelColors.cellBorder}` : 'none',
            cursor: 'pointer', background: hoveredCell === `file${i}` ? excelColors.selectedCell : 'transparent',
          },
          onMouseEnter: () => setHoveredCell(`file${i}`),
          onMouseLeave: () => setHoveredCell(null),
          onClick: () => onNavigate('select'),
        },
          React.createElement('span', null, `📄 ${f.name}`),
          React.createElement('span', { style: { color: excelColors.textLight } }, f.date),
          React.createElement('span', { style: { color: excelColors.textLight } }, f.size),
        ))
      ),
      // Hidden arena preview
      React.createElement('div', {
        style: { marginTop: 40, padding: 20, background: excelColors.headerBg, borderRadius: 6, border: `1px solid ${excelColors.cellBorder}` }
      },
        React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: excelColors.accent, marginBottom: 12 } }, '📊 今日競技場概況'),
        React.createElement('div', { style: { display: 'flex', gap: 24, fontSize: 11, color: excelColors.textLight } },
          ['🐱 貓方勝率: 48.2%', '🐶 犬方勝率: 51.8%', '⚔ 今日對戰: 1,247 場', '🏆 MVP: 哈士奇'].map((s, i) =>
            React.createElement('div', { key: i, style: { padding: '8px 12px', background: excelColors.cellBg, borderRadius: 4, border: `1px solid ${excelColors.cellBorder}` } }, s)
          )
        ),
      ),
    )
  );
}

// ============ CHARACTER SELECT ============
function CharacterSelectScreen({ onNavigate, onSelectCharacters }) {
  const [selectedP1, setSelectedP1] = React.useState(null);
  const [selectedP2, setSelectedP2] = React.useState(null);
  const [detailChar, setDetailChar] = React.useState(null);
  const [tab, setTab] = React.useState('cats');

  const chars = tab === 'cats' ? CAT_BREEDS : DOG_BREEDS;
  const colHeaders = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const fieldHeaders = ['品種', '類型', 'HP', 'ATK', 'DEF', 'SPD', 'SPC', '技能', '選P1', '選P2'];

  return React.createElement('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', background: excelColors.cellBg } },
    // Column headers
    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: '36px repeat(10, 1fr)',
        background: excelColors.headerBg, borderBottom: `1px solid ${excelColors.cellBorder}`,
        fontFamily: 'Consolas, monospace', fontSize: 10, color: excelColors.textLight, textAlign: 'center',
      }
    }, colHeaders.map(h => React.createElement('div', { key: h, style: { padding: '2px 0', borderRight: `0.5px solid ${excelColors.cellBorder}` } }, h))),
    // Tab selector as row 1
    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: '36px repeat(10, 1fr)',
        borderBottom: `1px solid ${excelColors.cellBorder}`,
      }
    },
      React.createElement(Cell, { header: true, style: { textAlign: 'center', fontSize: 10 } }, '1'),
      React.createElement(Cell, { header: true, style: { gridColumn: 'span 5', textAlign: 'center', cursor: 'pointer', background: tab === 'cats' ? excelColors.selectedCell : excelColors.headerBg, fontWeight: tab === 'cats' ? 700 : 400 }, onClick: () => setTab('cats') }, '🐱 貓科資料表 (Sheet1)'),
      React.createElement(Cell, { header: true, style: { gridColumn: 'span 5', textAlign: 'center', cursor: 'pointer', background: tab === 'dogs' ? excelColors.selectedCell : excelColors.headerBg, fontWeight: tab === 'dogs' ? 700 : 400 }, onClick: () => setTab('dogs') }, '🐶 犬科資料表 (Sheet2)'),
    ),
    // Field headers as row 2
    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: '36px repeat(10, 1fr)',
        borderBottom: `2px solid ${excelColors.accent}`,
        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", Consolas, monospace',
      }
    },
      React.createElement(Cell, { header: true, style: { textAlign: 'center', fontSize: 10 } }, '2'),
      fieldHeaders.map(h => React.createElement(Cell, { key: h, header: true, style: { textAlign: 'center', fontSize: 11, fontWeight: 700 } }, h)),
    ),
    // Character rows
    React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
      chars.map((ch, i) => {
        const isP1 = selectedP1?.id === ch.id;
        const isP2 = selectedP2?.id === ch.id;
        return React.createElement('div', {
          key: ch.id,
          style: {
            display: 'grid', gridTemplateColumns: '36px repeat(10, 1fr)',
            borderBottom: `0.5px solid ${excelColors.cellBorder}`,
            background: isP1 ? '#E8F0E0' : isP2 ? '#E8E0F0' : i % 2 === 0 ? 'transparent' : excelColors.headerBg + '40',
            fontFamily: '"Microsoft JhengHei", "Noto Sans TC", Consolas, monospace',
          }
        },
          React.createElement(Cell, { header: true, style: { textAlign: 'center', fontSize: 10 } }, i + 3),
          React.createElement(Cell, { style: { cursor: 'pointer', fontWeight: 600, color: excelColors.accent }, onClick: () => setDetailChar(ch) },
            `${ch.name} (${ch.nameEn})`
          ),
          React.createElement(Cell, null, ch.type === 'cat' ? '🐱貓' : '🐶犬'),
          React.createElement(Cell, { style: { textAlign: 'right', color: ch.stats.hp >= 100 ? excelColors.greenAccent : excelColors.text } }, ch.stats.hp),
          React.createElement(Cell, { style: { textAlign: 'right', color: ch.stats.atk >= 65 ? excelColors.redAccent : excelColors.text } }, ch.stats.atk),
          React.createElement(Cell, { style: { textAlign: 'right' } }, ch.stats.def),
          React.createElement(Cell, { style: { textAlign: 'right', color: ch.stats.spd >= 75 ? excelColors.blueAccent : excelColors.text } }, ch.stats.spd),
          React.createElement(Cell, { style: { textAlign: 'right' } }, ch.stats.spc),
          React.createElement(Cell, { style: { fontSize: 10 } }, ch.skill),
          React.createElement(Cell, {
            style: { textAlign: 'center', cursor: 'pointer', background: isP1 ? '#C8E0B8' : 'transparent', fontWeight: isP1 ? 700 : 400 },
            onClick: () => setSelectedP1(isP1 ? null : ch),
          }, isP1 ? '✔ P1' : '○'),
          React.createElement(Cell, {
            style: { textAlign: 'center', cursor: 'pointer', background: isP2 ? '#C8B8E0' : 'transparent', fontWeight: isP2 ? 700 : 400 },
            onClick: () => setSelectedP2(isP2 ? null : ch),
          }, isP2 ? '✔ P2' : '○'),
        );
      })
    ),
    // Character detail popup
    detailChar && React.createElement('div', {
      style: {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: excelColors.cellBg, border: `2px solid ${excelColors.accent}`,
        borderRadius: 6, padding: 24, boxShadow: '4px 4px 20px rgba(0,0,0,0.15)',
        zIndex: 300, minWidth: 340, fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
      }
    },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        React.createElement('div', { style: { fontSize: 16, fontWeight: 700, color: excelColors.accent } }, `${detailChar.name} — 角色詳情`),
        React.createElement('div', { style: { cursor: 'pointer', fontSize: 18, color: excelColors.textLight }, onClick: () => setDetailChar(null) }, '✕'),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 20, alignItems: 'center' } },
        React.createElement('div', { style: { background: excelColors.headerBg, padding: 12, borderRadius: 4, border: `1px solid ${excelColors.cellBorder}` } },
          React.createElement(AsciiCharacter, { character: detailChar, scale: 1.5, highlight: true }),
        ),
        React.createElement(RadarChart, { stats: detailChar.stats, size: 160, color: detailChar.color }),
      ),
      React.createElement('div', { style: { marginTop: 16, padding: 12, background: excelColors.headerBg, borderRadius: 4, fontSize: 12 } },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: 4 } }, `💥 ${detailChar.skill}`),
        React.createElement('div', { style: { color: excelColors.textLight } }, detailChar.skillDesc),
      ),
    ),
    detailChar && React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.2)', zIndex: 299 },
      onClick: () => setDetailChar(null),
    }),
    // Bottom action bar
    React.createElement('div', {
      style: {
        padding: '8px 12px', borderTop: `2px solid ${excelColors.accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: excelColors.headerBg, fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif', fontSize: 12,
      }
    },
      React.createElement('div', { style: { display: 'flex', gap: 16 } },
        React.createElement('span', null, `P1: ${selectedP1 ? `${selectedP1.name}` : '未選擇'}`),
        React.createElement('span', { style: { color: excelColors.accent, fontWeight: 700 } }, 'VS'),
        React.createElement('span', null, `P2: ${selectedP2 ? `${selectedP2.name}` : '未選擇'}`),
      ),
      React.createElement('div', {
        style: {
          padding: '6px 24px', background: selectedP1 && selectedP2 ? excelColors.accent : excelColors.cellBorder,
          color: '#F5F0E8', borderRadius: 3, cursor: selectedP1 && selectedP2 ? 'pointer' : 'default',
          fontWeight: 600, transition: 'background 0.2s',
        },
        onClick: () => {
          if (selectedP1 && selectedP2) {
            onSelectCharacters(selectedP1, selectedP2);
            onNavigate('battle');
          }
        },
      }, '▶ 執行分析 (開始對戰)'),
    ),
  );
}

window.MainMenuScreen = MainMenuScreen;
window.CharacterSelectScreen = CharacterSelectScreen;
