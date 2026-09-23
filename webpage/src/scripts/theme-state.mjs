export const THEME_STORAGE_KEY = 'bornengine-theme';

const THEMES = new Set(['ink', 'paper']);

export function resolveTheme({ storedTheme, prefersDark, fallback = 'paper' }) {
  if (THEMES.has(storedTheme)) return storedTheme;
  if (prefersDark === true) return 'ink';
  if (prefersDark === false) return 'paper';
  return THEMES.has(fallback) ? fallback : 'paper';
}

export function nextTheme(theme) {
  return theme === 'ink' ? 'paper' : 'ink';
}
