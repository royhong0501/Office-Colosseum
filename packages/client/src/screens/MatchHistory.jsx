import { excelColors } from '../theme.js';
import {
  ExcelMenuBar,
  ExcelToolbar,
  ExcelSheetTabs,
  ExcelStatusBar,
} from '../components/ExcelChrome.jsx';

export default function MatchHistory({ onBack }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
    }}>
      <ExcelMenuBar currentSheet="History" onNavigate={() => {}} />
      <ExcelToolbar cellRef="A1" formulaText="=COLOSSEUM.HISTORY()" />

      <div style={{
        display: 'flex', flex: 1, overflow: 'hidden', background: excelColors.cellBg,
        flexDirection: 'column', alignItems: 'stretch',
      }}>
        <div style={{
          padding: '12px 20px', borderBottom: `2px solid ${excelColors.accent}`,
          background: excelColors.accent, color: '#F5F0E8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>戰績報表</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
              歷史對戰數據分析
            </div>
          </div>
          <button
            onClick={onBack}
            style={{
              padding: '6px 14px', borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.15)',
              color: '#F5F0E8', fontSize: 11, cursor: 'pointer',
              fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
            }}
          >
            ← 返回主選單
          </button>
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, padding: 40,
        }}>
          <div style={{
            fontSize: 48, color: excelColors.cellBorder,
            fontFamily: 'Consolas, monospace',
          }}>
            #N/A
          </div>
          <div style={{
            fontSize: 14, color: excelColors.text, fontWeight: 600,
          }}>
            尚無對戰紀錄
          </div>
          <div style={{
            fontSize: 11, color: excelColors.textLight, textAlign: 'center',
            lineHeight: 1.6, maxWidth: 420,
          }}>
            戰績報表將會在此呈現。請先回到主選單點擊「連線對戰」完成幾場比賽，
            資料會自動彙整至這張試算表。
          </div>

          <div style={{
            marginTop: 24, padding: 16,
            border: `1px dashed ${excelColors.cellBorder}`,
            borderRadius: 4,
            background: excelColors.headerBg,
            fontSize: 10, color: excelColors.textLight,
            fontFamily: 'Consolas, monospace',
          }}>
            TODO: 本功能尚未實作 — 目前對戰結束後不會保存歷史資料
          </div>
        </div>
      </div>

      <ExcelSheetTabs
        sheets={[
          { id: 'menu', label: '主選單' },
          { id: 'history', label: '戰績報表' },
        ]}
        active="history"
        onSelect={(id) => { if (id === 'menu') onBack(); }}
      />
      <ExcelStatusBar stats="就緒 — 戰績資料庫為空" />
    </div>
  );
}
