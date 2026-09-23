export {};

declare global {
  interface Window {
    PagefindUI?: new (options: { element: string | HTMLElement; bundlePath: string; autofocus?: boolean }) => unknown;
  }
}

let pagefindLoading: Promise<void> | null = null;

function loadPagefind(): Promise<void> {
  if (window.PagefindUI) return Promise.resolve();
  if (pagefindLoading) return pagefindLoading;

  const basePath = document.documentElement.dataset.basePath ?? '';
  const scriptUrl = `${basePath.replace(/\/$/, '')}/_pagefind/pagefind-ui.js`;
  pagefindLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Pagefind UI could not be loaded'));
    document.head.appendChild(script);
  });
  return pagefindLoading;
}

function openSearch(dialog: HTMLDialogElement): void {
  if (!dialog.open) dialog.showModal();
  const target = dialog.querySelector<HTMLElement>('[data-pagefind-ui]');
  if (!target || target.dataset.searchInitialized === 'true') return;

  target.dataset.searchInitialized = 'loading';
  const basePath = document.documentElement.dataset.basePath ?? '';
  loadPagefind()
    .then(() => {
      if (!window.PagefindUI) throw new Error('Pagefind UI is unavailable');
      new window.PagefindUI({
        element: target,
        bundlePath: `${basePath.replace(/\/$/, '')}/_pagefind/`,
        autofocus: true,
      });
      target.dataset.searchInitialized = 'true';
      dialog.querySelector<HTMLElement>('[data-search-fallback]')?.remove();
    })
    .catch(() => {
      target.dataset.searchInitialized = 'failed';
      const fallback = dialog.querySelector<HTMLElement>('[data-search-fallback]');
      if (fallback) fallback.textContent = 'Search is unavailable here. Use the documentation navigation or your browser find command.';
    });
}

function initSearch(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]');
  const openButton = document.querySelector<HTMLButtonElement>('[data-search-open]');
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-search-close]');
  if (!dialog || !openButton) return;

  openButton.addEventListener('click', () => openSearch(dialog));
  closeButton?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener('keydown', (event) => {
    const active = document.activeElement as HTMLElement | null;
    const typing = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      openSearch(dialog);
    }
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openSearch(dialog);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearch, { once: true });
} else {
  initSearch();
}
