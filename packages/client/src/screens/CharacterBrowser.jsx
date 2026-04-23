import React, { useState, useEffect, useMemo } from 'react';
import { ALL_CHARACTERS, CAT_BREEDS, DOG_BREEDS, MSG } from '@office-colosseum/shared';
import { CharacterSpriteImg } from '../components/CharacterSprite.jsx';
import { getSocket } from '../net/socket.js';
import SheetWindow from '../components/SheetWindow.jsx';

const STAT_LABELS = [
  { key: 'hp', label: 'HP', full: '體力', max: 120 },
  { key: 'atk', label: 'ATK', full: '攻擊', max: 80 },
  { key: 'def', label: 'DEF', full: '防禦', max: 80 },
  { key: 'spd', label: 'SPD', full: '速度', max: 90 },
  { key: 'spc', label: 'SPC', full: '特技', max: 90 },
];

function campLabel(type) {
  return type === 'cat' ? '貓方' : type === 'dog' ? '狗方' : '—';
}

function idBadge(character) {
  const prefix = character.type === 'cat' ? 'CAT' : 'DOG';
  const list = character.type === 'cat' ? CAT_BREEDS : DOG_BREEDS;
  const idx = list.findIndex((c) => c.id === character.id);
  return `${prefix}-${String(idx + 1).padStart(3, '0')}`;
}

function computeCampWinRate(records, type) {
  if (!records?.players) return null;
  let matches = 0, wins = 0;
  const ids = new Set((type === 'cat' ? CAT_BREEDS : DOG_BREEDS).map((c) => c.id));
  for (const player of Object.values(records.players)) {
    for (const [charId, r] of Object.entries(player.byCharacter ?? {})) {
      if (!ids.has(charId)) continue;
      matches += r.matches ?? 0;
      wins += r.wins ?? 0;
    }
  }
  if (matches === 0) return null;
  return { matches, wins, rate: (wins / matches) * 100 };
}

function computeCharUsage(records, charId) {
  if (!records?.players) return { matches: 0, wins: 0, rate: null };
  let matches = 0, wins = 0;
  for (const player of Object.values(records.players)) {
    const r = player.byCharacter?.[charId];
    if (!r) continue;
    matches += r.matches ?? 0;
    wins += r.wins ?? 0;
  }
  return { matches, wins, rate: matches > 0 ? (wins / matches) * 100 : null };
}

export default function CharacterBrowser({ onBack }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(ALL_CHARACTERS[0]?.id ?? null);
  const [records, setRecords] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    const onRecords = (data) => setRecords(data ?? null);
    const request = () => socket.emit(MSG.GET_RECORDS);
    socket.on(MSG.RECORDS, onRecords);
    if (socket.connected) request();
    else socket.once('connect', request);
    return () => {
      socket.off(MSG.RECORDS, onRecords);
      socket.off('connect', request);
    };
  }, []);

  const filtered = filter === 'all'
    ? ALL_CHARACTERS
    : filter === 'cat' ? CAT_BREEDS : DOG_BREEDS;

  const selected = ALL_CHARACTERS.find((c) => c.id === selectedId) ?? ALL_CHARACTERS[0];

  const dogRate = useMemo(() => computeCampWinRate(records, 'dog'), [records]);
  const catRate = useMemo(() => computeCampWinRate(records, 'cat'), [records]);
  const usage = useMemo(() => computeCharUsage(records, selected?.id), [records, selected?.id]);

  const selIdx = ALL_CHARACTERS.findIndex((c) => c.id === selected?.id);

  return (
    <SheetWindow
      fileName="員工能力評估表_2026Q2.xlsx"
      cellRef={`A${selIdx + 2}`}
      formula={`=VLOOKUP("${selected?.name ?? ''}", CHARACTERS, 2, FALSE)`}
      tabs={[
        { id: 'all', label: `全部 (${ALL_CHARACTERS.length})` },
        { id: 'dog', label: `狗方 (${DOG_BREEDS.length})` },
        { id: 'cat', label: `貓方 (${CAT_BREEDS.length})` },
      ]}
      activeTab={filter}
      onTabSelect={setFilter}
      statusLeft="唯讀 — 員工檔案請洽 HR 部門"
      statusRight={`總員工: ${ALL_CHARACTERS.length} | 狗方: ${DOG_BREEDS.length} | 貓方: ${CAT_BREEDS.length}`}
      fullscreen
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ==== 頂部焦點角色 3 欄 ==== */}
        {selected && (
          <div style={{
            display: 'grid', gridTemplateColumns: '260px 1fr 260px',
            gap: 16,
          }}>
            {/* 大頭像 */}
            <div style={{
              width: 260, height: 260,
              background: 'repeating-linear-gradient(135deg, var(--bg-paper-alt) 0 12px, var(--bg-paper) 12px 24px)',
              border: '1px solid var(--line-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 6, left: 8,
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: 'var(--ink-muted)', letterSpacing: 1,
              }}>
                {idBadge(selected)}
              </div>
              <CharacterSpriteImg character={selected} size={200} />
            </div>

            {/* 角色資訊卡 */}
            <div style={{
              background: 'var(--bg-paper-alt)',
              border: '1px solid var(--line-soft)',
              padding: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div>
                <div style={{
                  fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
                  marginBottom: 4, letterSpacing: 1,
                }}>
                  員工編號 {idBadge(selected)}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>{selected.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                    {selected.nameEn}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px',
                    background: selected.type === 'cat' ? 'var(--accent-danger)' : 'var(--accent)',
                    color: 'var(--bg-paper)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {campLabel(selected.type)}陣營
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px',
                    border: '1px solid var(--line-soft)',
                    color: 'var(--ink-soft)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {selected.skillKind?.toUpperCase() ?? 'SKILL'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '70px 70px 1fr 48px', rowGap: 6, alignItems: 'center' }}>
                {STAT_LABELS.map((s) => {
                  const val = selected.stats[s.key] ?? 0;
                  const pct = Math.min(100, (val / s.max) * 100);
                  return (
                    <React.Fragment key={s.key}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ink)' }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{s.full}</span>
                      <div style={{
                        height: 10, background: 'var(--bg-input)',
                        border: '1px solid var(--line-soft)',
                        marginRight: 8,
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: 'var(--accent)',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink)', textAlign: 'right' }}>
                        {val}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>

              <div style={{
                borderTop: '1px dashed var(--line-soft)', paddingTop: 10,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                  技能 · {selected.skill}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {selected.skillDesc}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  操作：WASD 移動 · J 普攻 · K 技能 · ESC 切換季度報表
                </div>
              </div>
            </div>

            {/* 陣營 / 使用勝率 */}
            <div style={{
              background: 'var(--bg-paper-alt)',
              border: '1px solid var(--line-soft)',
              padding: 16,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
                陣營勝率 / server-wide
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>狗方平均</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {dogRate ? `${dogRate.rate.toFixed(1)}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                  {dogRate ? `${dogRate.wins}/${dogRate.matches} 場` : '尚無資料'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>貓方平均</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-danger)', fontFamily: 'var(--font-mono)' }}>
                  {catRate ? `${catRate.rate.toFixed(1)}%` : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                  {catRate ? `${catRate.wins}/${catRate.matches} 場` : '尚無資料'}
                </div>
              </div>
              <div style={{ borderTop: '1px dashed var(--line-soft)', paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                  本角色使用數據
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                  {usage.matches > 0
                    ? `${usage.matches} 場 · 勝率 ${usage.rate?.toFixed(1)}%`
                    : '尚未登場'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==== 全角色表格 ==== */}
        <div>
          <div style={{
            fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            marginBottom: 4,
          }}>
            {`=QUERY(CHARACTERS, "SELECT * WHERE 陣營 = '${filter === 'all' ? '全部' : campLabel(filter)}'")`}
          </div>
          <div style={{ border: '1px solid var(--line-soft)', background: 'var(--bg-input)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '68px 1.2fr 1.2fr 60px 1.4fr repeat(5, 52px)',
              background: 'var(--bg-cell-header)',
              borderBottom: '1px solid var(--line-soft)',
              fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)',
            }}>
              {['編號', '中文名', '英文名', '陣營', '技能', 'HP', 'ATK', 'DEF', 'SPD', 'SPC'].map((h, i) => (
                <div key={i} style={{
                  padding: '4px 6px',
                  borderRight: i < 9 ? '1px solid var(--line-soft)' : 'none',
                  textAlign: i >= 5 ? 'right' : 'left',
                }}>{h}</div>
              ))}
            </div>
            {filtered.map((ch, i) => {
              const isSel = ch.id === selected?.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedId(ch.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '68px 1.2fr 1.2fr 60px 1.4fr repeat(5, 52px)',
                    fontSize: 11, color: 'var(--ink)',
                    background: isSel ? 'var(--bg-paper-alt)' : (i % 2 === 0 ? 'var(--bg-paper)' : 'var(--bg-input)'),
                    borderBottom: '1px solid var(--line-soft)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ padding: '5px 6px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-muted)' }}>
                    {idBadge(ch)}
                  </div>
                  <div style={{ padding: '5px 6px', borderRight: '1px solid var(--line-soft)', fontFamily: 'var(--font-ui)', fontWeight: isSel ? 700 : 400 }}>
                    {ch.name}
                  </div>
                  <div style={{ padding: '5px 6px', borderRight: '1px solid var(--line-soft)', color: 'var(--ink-soft)' }}>
                    {ch.nameEn}
                  </div>
                  <div style={{ padding: '5px 6px', borderRight: '1px solid var(--line-soft)', color: ch.type === 'cat' ? 'var(--accent-danger)' : 'var(--accent)' }}>
                    {campLabel(ch.type)}
                  </div>
                  <div style={{ padding: '5px 6px', borderRight: '1px solid var(--line-soft)', fontFamily: 'var(--font-ui)', color: 'var(--ink-soft)' }}>
                    {ch.skill}
                  </div>
                  {STAT_LABELS.map((s) => (
                    <div key={s.key} style={{
                      padding: '5px 6px',
                      borderRight: s.key === 'spc' ? 'none' : '1px solid var(--line-soft)',
                      textAlign: 'right',
                    }}>
                      {ch.stats[s.key]}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-input)',
              color: 'var(--ink-soft)',
              border: '1px solid var(--line-soft)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            回主選單
          </button>
        </div>
      </div>
    </SheetWindow>
  );
}
