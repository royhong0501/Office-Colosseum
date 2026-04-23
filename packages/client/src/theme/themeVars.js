// 主題 token 的單一真實來源——實際 CSS 變數定義寫在 index.html 的 <style>
// 這裡的 THEMES 只拿來提供顯示名稱與下拉選項；切換透過 data-theme 屬性
export const THEMES = [
  { id: 'warm', label: '暖棕米白' },
  { id: 'green', label: '經典辦公綠' },
  { id: 'blue', label: '冷灰藍' },
];

const STORAGE_KEY = 'hiiicalc.theme';
const DEFAULT_THEME = 'warm';

export function applyTheme(id) {
  const valid = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', valid);
  }
  try {
    localStorage.setItem(STORAGE_KEY, valid);
  } catch {
    /* private mode 等環境可能不給寫 */
  }
  return valid;
}

export function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

// 給非 React 處（例如 BossKey 的 overlay）可直接 resolve 當前主題 id
export function currentTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME;
}
