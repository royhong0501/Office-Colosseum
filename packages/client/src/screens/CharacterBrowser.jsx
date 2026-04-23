import { useState } from 'react';
import { ALL_CHARACTERS } from '@office-colosseum/shared';
import { excelColors } from '../theme.js';
import { CharacterSpriteImg } from '../components/CharacterSprite.jsx';
import {
  ExcelMenuBar,
  ExcelToolbar,
  ExcelSheetTabs,
  ExcelStatusBar,
} from '../components/ExcelChrome.jsx';

const STAT_LABELS = [
  { key: 'hp', label: 'HP', full: '體力' },
  { key: 'atk', label: 'ATK', full: '攻擊' },
  { key: 'def', label: 'DEF', full: '防禦' },
  { key: 'spd', label: 'SPD', full: '速度' },
  { key: 'spc', label: 'SPC', full: '特技' },
];

export default function CharacterBrowser({ onBack }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(ALL_CHARACTERS[0]?.id ?? null);

  const filtered = filter === 'all'
    ? ALL_CHARACTERS
    : ALL_CHARACTERS.filter((c) => c.type === filter);

  const selected = ALL_CHARACTERS.find((c) => c.id === selectedId) ?? ALL_CHARACTERS[0];

  const counts = {
    all: ALL_CHARACTERS.length,
    cat: ALL_CHARACTERS.filter((c) => c.type === 'cat').length,
    dog: ALL_CHARACTERS.filter((c) => c.type === 'dog').length,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
    }}>
      <ExcelMenuBar currentSheet="Characters" onNavigate={() => {}} />
      <ExcelToolbar cellRef="A1" formulaText={`=COLOSSEUM.CHARACTERS(${filtered.length})`} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: excelColors.cellBg }}>
        {/* Left — character list */}
        <div style={{
          width: 280, borderRight: `1px solid ${excelColors.cellBorder}`,
          display: 'flex', flexDirection: 'column', background: excelColors.headerBg,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: `2px solid ${excelColors.accent}`,
            background: excelColors.accent, color: '#F5F0E8',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>角色資料庫</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
              共 {ALL_CHARACTERS.length} 位參賽者
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${excelColors.cellBorder}`,
            background: excelColors.toolbarBg,
          }}>
            {[
              { id: 'all', label: `全部 (${counts.all})` },
              { id: 'cat', label: `貓方 (${counts.cat})` },
              { id: 'dog', label: `犬方 (${counts.dog})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  flex: 1, padding: '8px 0', border: 'none',
                  borderBottom: filter === f.id ? `2px solid ${excelColors.accent}` : '2px solid transparent',
                  cursor: 'pointer',
                  background: filter === f.id ? excelColors.cellBg : 'transparent',
                  fontSize: 11,
                  fontWeight: filter === f.id ? 700 : 400,
                  color: filter === f.id ? excelColors.accent : excelColors.textLight,
                  fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map((ch, idx) => {
              const isSel = ch.id === selected?.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedId(ch.id)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: `1px solid ${excelColors.cellBorder}`,
                    background: isSel ? excelColors.selectedCell : 'transparent',
                    borderLeft: isSel ? `3px solid ${excelColors.accent}` : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  }}
                >
                  <span style={{
                    fontSize: 9, color: excelColors.textLight,
                    fontFamily: 'Consolas, monospace', minWidth: 24,
                  }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 2,
                    background: ch.type === 'cat' ? excelColors.blueAccent : excelColors.greenAccent,
                    color: '#F5F0E8',
                  }}>
                    {ch.type === 'cat' ? '貓' : '犬'}
                  </span>
                  <span style={{
                    fontWeight: isSel ? 700 : 400,
                    color: isSel ? excelColors.accent : excelColors.text,
                  }}>
                    {ch.name}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, color: excelColors.textLight,
                  }}>
                    {ch.nameEn}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{
            padding: 12, borderTop: `1px solid ${excelColors.cellBorder}`,
          }}>
            <button
              onClick={onBack}
              style={{
                width: '100%',
                padding: '6px 0', borderRadius: 3, border: `1px solid ${excelColors.cellBorder}`,
                cursor: 'pointer', background: 'transparent',
                color: excelColors.textLight, fontSize: 11,
                fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
              }}
            >
              ← 返回主選單
            </button>
          </div>
        </div>

        {/* Right — detail */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          {selected && (
            <>
              {/* Header card */}
              <div style={{
                display: 'flex', gap: 24, padding: 20,
                border: `1px solid ${excelColors.cellBorder}`,
                borderLeft: `4px solid ${selected.color ?? excelColors.accent}`,
                borderRadius: 4,
                background: excelColors.headerBg,
                marginBottom: 24,
              }}>
                <div style={{
                  padding: 12,
                  background: excelColors.cellBg,
                  border: `1px solid ${excelColors.cellBorder}`,
                  borderRadius: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CharacterSpriteImg character={selected} size={180} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: excelColors.accent }}>
                      {selected.name}
                    </span>
                    <span style={{ fontSize: 13, color: excelColors.textLight }}>
                      {selected.nameEn}
                    </span>
                  </div>
                  <div style={{
                    display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 2,
                    background: selected.type === 'cat' ? excelColors.blueAccent : excelColors.greenAccent,
                    color: '#F5F0E8', marginBottom: 12,
                  }}>
                    {selected.type === 'cat' ? '貓方陣營' : '犬方陣營'}
                  </div>
                  <div style={{ fontSize: 12, color: excelColors.text, marginTop: 8 }}>
                    <div style={{ fontWeight: 700, color: excelColors.accent, marginBottom: 2 }}>
                      ★ 技能：{selected.skill}
                    </div>
                    <div style={{ fontSize: 11, color: excelColors.textLight, lineHeight: 1.5 }}>
                      {selected.skillDesc}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats table */}
              <div style={{
                border: `1px solid ${excelColors.cellBorder}`, borderRadius: 4,
                overflow: 'hidden', marginBottom: 24,
              }}>
                <div style={{
                  padding: '8px 16px',
                  background: excelColors.headerBg,
                  borderBottom: `1px solid ${excelColors.cellBorder}`,
                  fontSize: 12, fontWeight: 600, color: excelColors.text,
                }}>
                  能力值報表
                </div>
                {STAT_LABELS.map((s, i) => {
                  const val = selected.stats[s.key];
                  const pct = Math.min(100, (val / 100) * 100);
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 60px 1fr 50px',
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderBottom: i < STAT_LABELS.length - 1 ? `1px solid ${excelColors.cellBorder}` : 'none',
                        fontSize: 12, color: excelColors.text,
                        background: i % 2 === 0 ? 'transparent' : excelColors.toolbarBg,
                      }}
                    >
                      <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 700 }}>
                        {s.label}
                      </span>
                      <span style={{ color: excelColors.textLight }}>
                        {s.full}
                      </span>
                      <div style={{
                        height: 14, background: excelColors.cellBg,
                        border: `1px solid ${excelColors.cellBorder}`, borderRadius: 2,
                        overflow: 'hidden', marginRight: 12,
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: selected.color ?? excelColors.accent,
                        }} />
                      </div>
                      <span style={{
                        fontFamily: 'Consolas, monospace', fontWeight: 700,
                        color: excelColors.accent, textAlign: 'right',
                      }}>
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Summary row */}
              <div style={{
                display: 'flex', gap: 12, fontSize: 11, color: excelColors.textLight,
              }}>
                <div style={{
                  padding: '6px 12px', background: excelColors.headerBg,
                  border: `1px solid ${excelColors.cellBorder}`, borderRadius: 3,
                }}>
                  總能力值: {STAT_LABELS.reduce((a, s) => a + selected.stats[s.key], 0)}
                </div>
                <div style={{
                  padding: '6px 12px', background: excelColors.headerBg,
                  border: `1px solid ${excelColors.cellBorder}`, borderRadius: 3,
                }}>
                  ID: {selected.id}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ExcelSheetTabs
        sheets={[
          { id: 'menu', label: '主選單' },
          { id: 'characters', label: '角色資料庫' },
        ]}
        active="characters"
        onSelect={(id) => { if (id === 'menu') onBack(); }}
      />
      <ExcelStatusBar stats={`已載入 ${ALL_CHARACTERS.length} 筆角色資料 — ${filtered.length} 筆符合篩選條件`} />
    </div>
  );
}
