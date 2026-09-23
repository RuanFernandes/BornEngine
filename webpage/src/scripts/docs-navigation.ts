import { nextMenuState } from './interaction-state.mjs';

function setExpanded(button: HTMLButtonElement, panel: HTMLElement, open: boolean): void {
  button.setAttribute('aria-expanded', String(open));
  panel.classList.toggle('is-open', open);
}

function bindToggle(button: HTMLButtonElement | null, panel: HTMLElement | null): void {
  if (!button || !panel || button.dataset.toggleBound === 'true') return;
  button.dataset.toggleBound = 'true';
  button.addEventListener('click', () => {
    const isOpen = nextMenuState(button.getAttribute('aria-expanded') === 'true');
    setExpanded(button, panel, isOpen);
  });
  panel.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    link.addEventListener('click', () => setExpanded(button, panel, false));
  });
}

function addRevealEnhancement(): void {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || !('IntersectionObserver' in window)) return;

  root.classList.add('motion-ready');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => observer.observe(element));
}

function initNavigation(): void {
  bindToggle(
    document.querySelector<HTMLButtonElement>('[data-menu-toggle]'),
    document.querySelector<HTMLElement>('[data-site-menu]'),
  );
  bindToggle(
    document.querySelector<HTMLButtonElement>('[data-docs-menu-toggle]'),
    document.querySelector<HTMLElement>('[data-docs-sidebar]'),
  );
  addRevealEnhancement();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavigation, { once: true });
} else {
  initNavigation();
}
