import { useState, useEffect } from 'react';
import { ALL_CHARACTERS, MSG, MIN_PLAYERS } from '@office-colosseum/shared';
import { getSocket } from '../net/socket.js';
import { getJoinName, getPlayerUuid } from '../lib/playerIdentity.js';
import { CharacterSpriteImg } from '../components/CharacterSprite.jsx';
import { excelColors } from '../theme.js';
import {
  ExcelMenuBar,
  ExcelToolbar,
  ExcelSheetTabs,
  ExcelStatusBar,
} from '../components/ExcelChrome.jsx';

export default function Lobby({ onMatchStart, onBack }) {
  const [players, setPlayers] = useState([]);
  const socket = getSocket();

  useEffect(() => {
    const doJoin = () => {
      socket.emit(MSG.JOIN, { name: getJoinName(), uuid: getPlayerUuid() });
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    const onLobbyState = (data) => setPlayers(data.players ?? []);
    const onMatchStartEvt = (payload) => onMatchStart(payload);
    const onError = (err) => {
      console.warn('[server error]', err);
      alert(`[${err?.code ?? 'error'}] ${err?.msg ?? '未知錯誤'}`);
    };

    socket.on(MSG.LOBBY_STATE, onLobbyState);
    socket.on(MSG.MATCH_START, onMatchStartEvt);
    socket.on(MSG.ERROR, onError);

    return () => {
      socket.off('connect', doJoin);
      socket.off(MSG.LOBBY_STATE, onLobbyState);
      socket.off(MSG.MATCH_START, onMatchStartEvt);
      socket.off(MSG.ERROR, onError);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = players.find((p) => p.id === socket.id);

  const handlePick = (charId) => {
    socket.emit(MSG.PICK, { characterId: charId });
  };

  const handleReady = () => {
    socket.emit(MSG.READY, { ready: !me?.ready });
  };

  const handleStart = () => {
    socket.emit(MSG.START, {});
  };

  const handleAddBot = () => {
    socket.emit(MSG.ADD_BOT);
  };

  const handleRemoveBot = (botId) => {
    socket.emit(MSG.REMOVE_BOT, { botId });
  };

  const handleBack = () => {
    socket.emit(MSG.LEAVE);
    onBack();
  };

  const canStart =
    players.length >= MIN_PLAYERS &&
    players.every((p) => p.ready && p.characterId);

  const startDisabledReason = (() => {
    if (players.length < MIN_PLAYERS) {
      return `還差 ${MIN_PLAYERS - players.length} 人（最少 ${MIN_PLAYERS} 人）`;
    }
    const noChar = players.find((p) => !p.characterId);
    if (noChar) return `${noChar.name} 尚未選角色`;
    const notReady = players.find((p) => !p.ready);
    if (notReady) return `${notReady.name} 尚未按準備`;
    return null;
  })();

  // ---- Loading placeholder ----
  if (!me) {
    return (
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        background: excelColors.cellBg, fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
        color: excelColors.textLight, fontSize: 16,
      }}>
        連線中...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
    }}>
      <ExcelMenuBar currentSheet="Lobby" onNavigate={() => {}} />
      <ExcelToolbar
        cellRef="A1"
        formulaText={`=COLOSSEUM.LOBBY(${players.length})`}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: excelColors.cellBg }}>
        {/* Left sidebar — player roster */}
        <div style={{
          width: 240, borderRight: `1px solid ${excelColors.cellBorder}`,
          display: 'flex', flexDirection: 'column', background: excelColors.headerBg,
        }}>
          {/* Lobby title */}
          <div style={{
            padding: '12px 16px', borderBottom: `2px solid ${excelColors.accent}`,
            background: excelColors.accent, color: '#F5F0E8',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Lobby ({players.length}/{8})
            </div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
              最少 {MIN_PLAYERS} 人才能開始
            </div>
          </div>

          {/* Player rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {players.map((p) => {
              const char = ALL_CHARACTERS.find((c) => c.id === p.characterId);
              const isMe = p.id === socket.id;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '8px 12px',
                    borderBottom: `1px solid ${excelColors.cellBorder}`,
                    background: isMe ? excelColors.selectedCell : 'transparent',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.isHost && (
                      <span style={{ fontSize: 10, background: excelColors.accent, color: '#F5F0E8', padding: '1px 4px', borderRadius: 2 }}>
                        HOST
                      </span>
                    )}
                    {p.isBot && (
                      <span style={{ fontSize: 10, background: excelColors.blueAccent, color: '#F5F0E8', padding: '1px 4px', borderRadius: 2 }}>
                        CPU
                      </span>
                    )}
                    <span style={{ fontWeight: isMe ? 700 : 400, color: excelColors.text }}>
                      {p.name}
                    </span>
                    {p.ready && (
                      <span style={{ marginLeft: 'auto', color: excelColors.greenAccent, fontWeight: 700 }}>
                        ✔
                      </span>
                    )}
                    {me.isHost && p.isBot && (
                      <button
                        onClick={() => handleRemoveBot(p.id)}
                        title="移除"
                        style={{
                          marginLeft: p.ready ? 6 : 'auto',
                          background: 'transparent',
                          border: `1px solid ${excelColors.cellBorder}`,
                          color: excelColors.textLight,
                          cursor: 'pointer',
                          fontSize: 10,
                          lineHeight: 1,
                          padding: '1px 4px',
                          fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: excelColors.textLight, marginTop: 2 }}>
                    {char ? char.name : '—'}
                  </div>
                </div>
              );
            })}
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 8 - players.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${excelColors.cellBorder}`,
                  fontSize: 11, color: excelColors.cellBorder,
                  fontStyle: 'italic',
                }}
              >
                — 等待玩家加入...
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{
            padding: 12, borderTop: `1px solid ${excelColors.cellBorder}`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <button
              onClick={handleReady}
              style={{
                padding: '8px 0', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: me.ready ? excelColors.redAccent : excelColors.greenAccent,
                color: '#F5F0E8', fontWeight: 700, fontSize: 12,
                fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
              }}
            >
              {me.ready ? '取消準備' : '準備 (Ready)'}
            </button>

            {me.isHost && (
              <>
                <button
                  onClick={handleStart}
                  disabled={!canStart}
                  style={{
                    padding: '8px 0', borderRadius: 3, border: 'none',
                    cursor: canStart ? 'pointer' : 'not-allowed',
                    background: canStart ? excelColors.accent : excelColors.cellBorder,
                    color: '#F5F0E8', fontWeight: 700, fontSize: 12,
                    fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                  }}
                >
                  ▶ 開始比賽
                </button>
                {!canStart && startDisabledReason && (
                  <div style={{
                    fontSize: 10, color: excelColors.textLight,
                    textAlign: 'center', lineHeight: 1.4, marginTop: -2,
                  }}>
                    {startDisabledReason}
                  </div>
                )}
                <button
                  onClick={handleAddBot}
                  disabled={players.length >= 8}
                  style={{
                    padding: '6px 0', borderRadius: 3,
                    border: `1px solid ${excelColors.cellBorder}`,
                    background: players.length >= 8 ? excelColors.headerBg : excelColors.cellBg,
                    color: players.length >= 8 ? excelColors.cellBorder : excelColors.text,
                    cursor: players.length >= 8 ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                  }}
                >
                  + 新增電腦對手
                </button>
              </>
            )}

            <button
              onClick={handleBack}
              style={{
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

        {/* Right — character picker grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Grid header */}
          <div style={{
            padding: '8px 16px', borderBottom: `1px solid ${excelColors.cellBorder}`,
            background: excelColors.headerBg,
            fontSize: 12, fontWeight: 600, color: excelColors.text,
          }}>
            選擇角色 — 點選角色牌選擇
          </div>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '36px repeat(10, 1fr)',
            background: excelColors.headerBg,
            borderBottom: `1px solid ${excelColors.cellBorder}`,
            fontFamily: 'Consolas, monospace', fontSize: 10,
            color: excelColors.textLight, textAlign: 'center',
          }}>
            <div style={{ padding: '2px 0', borderRight: `0.5px solid ${excelColors.cellBorder}` }}></div>
            {['A','B','C','D','E','F','G','H','I','J'].map((h) => (
              <div key={h} style={{ padding: '2px 0', borderRight: `0.5px solid ${excelColors.cellBorder}` }}>{h}</div>
            ))}
          </div>

          {/* Character grid — 2 rows of 10 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {[0, 1].map((rowIdx) => (
              <div
                key={rowIdx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px repeat(10, 1fr)',
                  borderBottom: `1px solid ${excelColors.cellBorder}`,
                }}
              >
                {/* Row number */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: excelColors.headerBg, borderRight: `1px solid ${excelColors.cellBorder}`,
                  fontSize: 10, color: excelColors.textLight, fontFamily: 'Consolas, monospace',
                }}>
                  {rowIdx + 1}
                </div>

                {ALL_CHARACTERS.slice(rowIdx * 10, rowIdx * 10 + 10).map((ch) => {
                  const isPicked = me.characterId === ch.id;
                  const otherPicker = players.find(
                    (p) => p.id !== socket.id && p.characterId === ch.id,
                  );
                  return (
                    <div
                      key={ch.id}
                      onClick={() => handlePick(ch.id)}
                      style={{
                        padding: '8px 6px', cursor: 'pointer',
                        borderRight: `0.5px solid ${excelColors.cellBorder}`,
                        background: isPicked
                          ? excelColors.selectedCell
                          : otherPicker
                          ? excelColors.headerBg
                          : 'transparent',
                        outline: isPicked ? `2px solid ${excelColors.accent}` : 'none',
                        outlineOffset: -2,
                        transition: 'background 0.15s',
                        textAlign: 'center',
                        minHeight: 80,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => {
                        if (!isPicked) e.currentTarget.style.background = excelColors.selectedCell + '88';
                      }}
                      onMouseLeave={(e) => {
                        if (!isPicked && !otherPicker) e.currentTarget.style.background = 'transparent';
                        else if (!isPicked && otherPicker) e.currentTarget.style.background = excelColors.headerBg;
                      }}
                    >
                      <CharacterSpriteImg character={ch} size={42} />

                      <div style={{
                        fontSize: 9, marginTop: 3,
                        color: isPicked ? excelColors.accent : excelColors.text,
                        fontWeight: isPicked ? 700 : 400,
                      }}>
                        {ch.name}
                      </div>
                      {otherPicker && (
                        <div style={{ fontSize: 8, color: excelColors.blueAccent }}>
                          {otherPicker.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Character detail strip */}
          {me.characterId && (() => {
            const picked = ALL_CHARACTERS.find((c) => c.id === me.characterId);
            if (!picked) return null;
            return (
              <div style={{
                padding: '8px 16px', borderTop: `2px solid ${excelColors.accent}`,
                background: excelColors.headerBg,
                display: 'flex', alignItems: 'center', gap: 20, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: excelColors.accent }}>{picked.name}</span>
                <span style={{ color: excelColors.textLight }}>{picked.nameEn}</span>
                <span>HP: {picked.stats.hp}</span>
                <span>ATK: {picked.stats.atk}</span>
                <span>DEF: {picked.stats.def}</span>
                <span>SPD: {picked.stats.spd}</span>
                <span>SPC: {picked.stats.spc}</span>
                <span style={{ color: excelColors.textLight, fontSize: 10 }}>
                  技能: {picked.skill}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      <ExcelSheetTabs
        sheets={[
          { id: 'menu', label: '主選單' },
          { id: 'lobby', label: '連線大廳' },
        ]}
        active="lobby"
        onSelect={(id) => { if (id === 'menu') handleBack(); }}
      />
      <ExcelStatusBar
        stats={`大廳: ${players.length}/8 人 — ${me.ready ? '已準備' : '尚未準備'}`}
      />
    </div>
  );
}
