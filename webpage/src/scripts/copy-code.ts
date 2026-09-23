import { copyFeedback } from './interaction-state.mjs';

function bindCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-code]').forEach((button) => {
    if (button.dataset.copyBound === 'true') return;
    button.dataset.copyBound = 'true';
    button.addEventListener('click', async () => {
      const block = button.closest<HTMLElement>('[data-code-block]');
      const code = block?.querySelector('code')?.textContent ?? '';
      const status = block?.querySelector<HTMLElement>('.code-block__status');
      let success = false;

      try {
        if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(code);
        success = true;
      } catch {
        success = false;
      }

      const feedback = copyFeedback(success);
      button.textContent = feedback.label;
      if (status) status.textContent = feedback.liveMessage;
      window.setTimeout(() => {
        button.textContent = 'Copy';
        if (status) status.textContent = '';
      }, 2200);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindCopyButtons, { once: true });
} else {
  bindCopyButtons();
}
