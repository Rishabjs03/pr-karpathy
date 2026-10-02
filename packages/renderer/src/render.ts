// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- the ?raw module types must load wherever this file is type-checked, including from other packages.
/// <reference path="./raw.d.ts" />
import { parseExplainerDocument, type ExplainerDocument } from '@lucidiff/core/schema';
import clientScript from './assets/client.js?raw';
import styles from './assets/styles.css?raw';
import themeScript from './assets/theme-init.js?raw';
import { changesSection } from './components/changes';
import { flowSection } from './components/flow';
import { footer } from './components/footer';
import { hero, topBar } from './components/header';
import { layout } from './components/layout';
import { risksSection } from './components/risks';
import { summarySection } from './components/summary';
import { testsSection } from './components/tests';
import { html, jsonForScript, type SafeHtml } from './html';
import { plainText } from './text';
import { type MermaidAsset } from './mermaid-bundle';

export interface RenderOptions {
  /**
   * How the page loads Mermaid for the flow diagram.
   * Defaults to `{ kind: 'cdn' }`. Use `loadMermaidBundle()` with `{ kind: 'inline' }` for
   * pages that must work offline.
   */
  mermaid?: MermaidAsset;
}

/** Data the page script reads at runtime. */
interface PageData {
  storageKey: string;
  mermaid: string | null;
}

function storageKey(doc: ExplainerDocument): string {
  return doc.meta.pr_url ?? `${doc.meta.source.kind}:${doc.meta.source.label}:${doc.title}`;
}

/** Renders the page body. Exported for tests that snapshot structure without assets. */
export function renderBody(doc: ExplainerDocument): SafeHtml {
  return html`${topBar(doc)}
    <main id="main" class="container">
      ${hero(doc)} ${summarySection(doc)} ${changesSection(doc)} ${flowSection(doc)}
      ${risksSection(doc)} ${testsSection(doc)} ${footer(doc)}
    </main>`;
}

/**
 * Renders an explainer document as a single self-contained HTML page.
 *
 * The document is validated first, so this function is safe to call with JSON read from disk.
 * The output has inline CSS and JS, a strict Content Security Policy, and no external
 * requests except the pinned Mermaid build (unless `options.mermaid` says otherwise).
 *
 * @param document - An explainer document, for example from `explain()` in `@lucidiff/core`.
 * @param options - Rendering options.
 * @returns The complete HTML page as a string.
 * @throws {import('zod').ZodError} when `document` does not match the explainer schema.
 */
export function renderHtml(document: unknown, options: RenderOptions = {}): string {
  const doc = parseExplainerDocument(document);
  const data: PageData = {
    storageKey: storageKey(doc),
    mermaid: doc.flow.nodes.length > 0 ? doc.flow.mermaid : null,
  };
  return layout({
    title: `${plainText(doc.title)} · ${doc.meta.tool.name}`,
    description: plainText(doc.summary.split(/\n\s*\n/)[0] ?? doc.title).slice(0, 200),
    styles,
    themeScript,
    clientScript,
    dataJson: jsonForScript(data),
    mermaid: options.mermaid ?? { kind: 'cdn' },
    body: renderBody(doc),
  });
}
