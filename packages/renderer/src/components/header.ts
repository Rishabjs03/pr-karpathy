import type { ExplainerDocument } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { icons } from '../icons';
import { normalizePrUrl } from '../links';
import { formatNumber, plural } from '../text';

interface NavItem {
  id: string;
  label: string;
  count?: number;
}

/** The sticky top bar: brand, section links with counts, and the theme toggle. */
export function topBar(doc: ExplainerDocument): SafeHtml {
  const items: NavItem[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'changes', label: 'Changes', count: doc.changes.length },
    { id: 'flow', label: 'Flow' },
    { id: 'risks', label: 'Risks', count: doc.risks.length },
    { id: 'tests', label: 'Tests', count: doc.tests.length },
  ];
  return html`<div class="topbar" role="banner">
    <div class="topbar-inner">
      <a class="brand" href="#top" aria-label="Back to top">
        <span class="brand-mark" aria-hidden="true"></span>${doc.meta.tool.name}
      </a>
      <nav class="section-nav" aria-label="Sections">
        <ul>
          ${items.map(
            (item) =>
              html`<li>
                <a href="#${item.id}" data-nav="${item.id}"
                  >${item.label}${
                    item.count === undefined
                      ? ''
                      : html`<span class="nav-count">${formatNumber(item.count)}</span>`
                  }</a
                >
              </li>`,
          )}
        </ul>
      </nav>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle color theme">
        ${icons.sun()}${icons.moon()}
      </button>
    </div>
  </div>`;
}

function sourceLine(doc: ExplainerDocument): SafeHtml {
  const { source, pr_url: prUrl } = doc.meta;
  const href = prUrl ? normalizePrUrl(prUrl) : null;
  const label =
    source.kind === 'github'
      ? source.label
      : source.kind === 'git'
        ? `Local git · ${source.label}`
        : `Diff · ${source.label}`;
  return href
    ? html`<a href="${href}" rel="noopener noreferrer" target="_blank"
        >${label} ${icons.external()}</a
      >`
    : html`<span>${label}</span>`;
}

/** The page title block: source, title, and diff statistics. */
export function hero(doc: ExplainerDocument): SafeHtml {
  const { source, stats } = doc.meta;
  const refs =
    source.base_ref && source.head_ref
      ? html`<span class="chip mono" title="Head branch into base branch"
          >${icons.branch()}${source.head_ref} → ${source.base_ref}</span
        >`
      : '';
  const author = source.author ? html`<span>by ${source.author}</span>` : '';
  return html`<header class="hero" id="top">
    <p class="eyebrow">${sourceLine(doc)}</p>
    <h1>${doc.title}</h1>
    <div class="hero-meta">
      ${refs}
      <span>${plural(stats.files_changed, 'file')} changed</span>
      <span class="mono diffstat"
        ><span class="add">+${formatNumber(stats.additions)}</span>
        <span class="del">−${formatNumber(stats.deletions)}</span></span
      >
      ${author}
    </div>
  </header>`;
}
