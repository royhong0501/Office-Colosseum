import React, { useState, useEffect } from 'react';
import { THEMES, applyTheme, currentTheme } from '../theme/themeVars.js';

export default function StatusBarThemeSelect() {
  const [value, setValue] = useState(currentTheme());

  useEffect(() => {
    // 掛上後再同步一次，避免 SSR/初始化 race
    setValue(currentTheme());
  }, []);

  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 10, color: 'var(--bg-paper)', opacity: 0.85,
      fontFamily: 'var(--font-ui)',
    }}>
      <span>工作表樣式</span>
      <select
        value={value}
        onChange={(e) => {
          const next = applyTheme(e.target.value);
          setValue(next);
        }}
        style={{
          background: 'var(--bg-input)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          padding: '1px 4px',
          outline: 'none',
        }}
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </label>
  );
}
