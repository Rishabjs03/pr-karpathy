/**
 * Inline SVG icons (24×24 stroke icons). They inherit `currentColor` and are hidden from
 * assistive technology; every icon sits next to a visible text label.
 */
import { raw, type SafeHtml } from './html';

function icon(paths: string, className = 'icon'): SafeHtml {
  return raw(
    `<svg class="${className}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`,
  );
}

export const icons = {
  sun: () =>
    icon(
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
      'icon icon-sun',
    ),
  moon: () => icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 'icon icon-moon'),
  chevron: () => icon('<path d="m9 18 6-6-6-6"/>', 'icon icon-chevron'),
  external: () =>
    icon(
      '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    ),
  alert: () =>
    icon(
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    ),
  info: () => icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  shield: () => icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  check: () => icon('<path d="M20 6 9 17l-5-5"/>'),
  file: () =>
    icon(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    ),
  branch: () =>
    icon(
      '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v6M18 9a9 9 0 0 1-9 9"/>',
    ),
} as const;
