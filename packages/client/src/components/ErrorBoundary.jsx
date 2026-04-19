import React from 'react';
import { excelColors } from '../theme.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: excelColors.cellBg,
          fontFamily: '"Microsoft JhengHei","Noto Sans TC",sans-serif',
          color: excelColors.text,
          padding: 40,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: excelColors.redAccent }}>
          #REF! — 發生錯誤
        </div>
        <pre
          style={{
            fontFamily: 'Consolas, monospace',
            fontSize: 12,
            padding: 16,
            background: excelColors.headerBg,
            border: `1px solid ${excelColors.cellBorder}`,
            borderRadius: 4,
            maxWidth: 600,
            maxHeight: 240,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 24px',
            border: 'none',
            borderRadius: 3,
            background: excelColors.accent,
            color: '#F5F0E8',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: '"Microsoft JhengHei","Noto Sans TC",sans-serif',
          }}
        >
          重新載入
        </button>
      </div>
    );
  }
}
