import React from 'react';

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
          background: 'var(--bg-paper)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--ink)',
          padding: 40,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-danger)' }}>
          #REF! — 發生錯誤
        </div>
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: 16,
            background: 'var(--bg-paper-alt)',
            border: '1px solid var(--line-soft)',
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
            padding: '7px 22px',
            border: '1px solid var(--line)',
            background: 'var(--accent)',
            color: 'var(--bg-paper)',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          重新載入
        </button>
      </div>
    );
  }
}
