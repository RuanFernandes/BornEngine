const LANGUAGE_ALIASES = Object.freeze({
  bash: 'shell',
  css: 'css',
  html: 'html',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  plaintext: 'plaintext',
  rust: 'rust',
  sh: 'shell',
  shell: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  wgsl: 'wgsl',
});

export function monacoLanguage(language = 'text') {
  const normalized = String(language).trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? 'plaintext';
}

export function monacoTheme(theme = 'ink') {
  return theme === 'paper' ? 'vs' : 'vs-dark';
}

export function resolveMonacoBlockLanguage({ blockLanguage = 'text', fallbackLanguage = '' } = {}) {
  return monacoLanguage(fallbackLanguage || blockLanguage);
}

export function createMonacoEditorOptions({ code, language = 'text', theme = 'ink' }) {
  return {
    value: code,
    language: monacoLanguage(language),
    theme: monacoTheme(theme),
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    accessibilitySupport: 'on',
    ariaLabel: `${language} code example`,
    contextmenu: false,
    cursorBlinking: 'solid',
    cursorStyle: 'line-thin',
    folding: false,
    fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
    fontLigatures: true,
    fontSize: 13,
    glyphMargin: false,
    lineDecorationsWidth: 12,
    lineNumbers: 'on',
    minimap: { enabled: false },
    padding: { top: 18, bottom: 18 },
    renderLineHighlight: 'none',
    scrollBeyondLastLine: false,
    scrollbar: {
      horizontalScrollbarSize: 8,
      verticalScrollbarSize: 8,
    },
    wordWrap: 'off',
  };
}

let monacoPromise;
const languagePromises = new Map();

const LANGUAGE_LOADERS = Object.freeze({
  css: () => import('monaco-editor/languages/definitions/css/register.js'),
  html: () => import('monaco-editor/languages/definitions/html/register.js'),
  javascript: () => import('monaco-editor/languages/definitions/javascript/register.js'),
  json: () => import('monaco-editor/language/json/monaco.contribution.js'),
  rust: () => import('monaco-editor/languages/definitions/rust/register.js'),
  shell: () => import('monaco-editor/languages/definitions/shell/register.js'),
  typescript: () => import('monaco-editor/languages/definitions/typescript/register.js'),
  wgsl: () => import('monaco-editor/languages/definitions/wgsl/register.js'),
});

function loadMonaco() {
  monacoPromise ??= import('monaco-editor/editor/editor.api.js');
  return monacoPromise;
}

function loadLanguage(language) {
  const normalized = monacoLanguage(language);
  const loader = LANGUAGE_LOADERS[normalized];
  if (!loader) return Promise.resolve();
  if (!languagePromises.has(normalized)) languagePromises.set(normalized, loader());
  return languagePromises.get(normalized);
}

function scheduleIdle(callback) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback, { timeout: 1200 });
    return;
  }

  globalThis.setTimeout(callback, 0);
}

async function mountCodeBlock(block) {
  if (block.dataset.monacoState === 'loading' || block.dataset.monacoState === 'ready') return;

  const target = block.querySelector('[data-monaco-editor]');
  const fallback = block.querySelector('[data-monaco-fallback]');
  const code = fallback?.querySelector('code')?.textContent ?? '';
  const language = resolveMonacoBlockLanguage({
    blockLanguage: block.dataset.monacoLanguage,
    fallbackLanguage: fallback?.dataset.language,
  });
  block.dataset.monacoLanguage = language;
  if (!target || !code) return;

  block.dataset.monacoState = 'loading';

  try {
    const monaco = await loadMonaco();
    await loadLanguage(language);
    const theme = document.documentElement.dataset.theme ?? 'ink';
    const editor = monaco.editor.create(
      target,
      createMonacoEditorOptions({
        code,
        language,
        theme,
      }),
    );

    block.__monacoEditor = editor;
    block.dataset.monacoState = 'ready';
    block.classList.add('is-monaco-ready');
    fallback?.setAttribute('aria-hidden', 'true');
    target.removeAttribute('aria-hidden');
  } catch {
    block.dataset.monacoState = 'fallback';
  }
}

function initMonacoCode() {
  const blocks = [...document.querySelectorAll('[data-monaco-code]')];
  if (!blocks.length) return;

  const queue = (block) => {
    if (block.dataset.monacoState) return;
    block.dataset.monacoState = 'queued';
    scheduleIdle(() => mountCodeBlock(block));
  };

  if ('IntersectionObserver' in globalThis) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
          queue(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '320px 0px' },
    );
    blocks.forEach((block) => observer.observe(block));
    return;
  }

  blocks.forEach(queue);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMonacoCode, { once: true });
  } else {
    initMonacoCode();
  }
}
