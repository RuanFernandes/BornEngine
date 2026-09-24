import { nextTheme, resolveTheme, THEME_STORAGE_KEY } from './theme-state.mjs';

type Theme = 'ink' | 'paper';

const body = document.body;
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'ink' || stored === 'paper' ? stored : null;
  } catch {
    return null;
  }
}

function currentTheme(): Theme {
  return body.classList.contains('theme-ink') ? 'ink' : 'paper';
}

function updateButton(theme: Theme): void {
  if (!button) return;
  const next = nextTheme(theme);
  button.setAttribute('aria-pressed', String(theme === 'ink'));
  button.setAttribute('aria-label', `Switch to ${next === 'ink' ? 'dark' : 'light'} mode`);
  const label = button.querySelector<HTMLElement>('[data-theme-toggle-label]');
  if (label) label.textContent = `Switch to ${next === 'ink' ? 'dark' : 'light'} mode`;
}

function applyTheme(theme: Theme, persist = false): void {
  body.classList.remove('theme-paper', 'theme-ink');
  body.classList.add(`theme-${theme}`);
  document.documentElement.dataset.theme = theme;
  updateButton(theme);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in private browsing; the in-memory change still applies.
    }
  }
}

function syncWithSystem(prefersDark: boolean): void {
  if (body.dataset.themeMode !== 'system' || readStoredTheme()) return;
  applyTheme(resolveTheme({ storedTheme: null, prefersDark, fallback: currentTheme() }));
}

document.documentElement.dataset.theme = currentTheme();
updateButton(currentTheme());

button?.addEventListener('click', () => {
  applyTheme(nextTheme(currentTheme()), true);
});

const handleSystemChange = (event: MediaQueryListEvent): void => {
  syncWithSystem(event.matches);
};

if (body.dataset.themeMode === 'system') {
  mediaQuery.addEventListener('change', handleSystemChange);
}
