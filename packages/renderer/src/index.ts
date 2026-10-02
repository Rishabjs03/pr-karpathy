/**
 * @lucidiff/renderer turns an explainer document into a single self-contained HTML page.
 *
 * @example
 *   import { renderHtml } from '@lucidiff/renderer';
 *   const page = renderHtml(document); // document from explain() in @lucidiff/core
 */
export { renderHtml, renderBody, type RenderOptions } from './render';
export {
  loadMermaidBundle,
  MERMAID_CDN_URL,
  MERMAID_INTEGRITY,
  MERMAID_VERSION,
  type LoadMermaidOptions,
  type MermaidAsset,
} from './mermaid-bundle';
export { prFileUrl, prLineUrl, normalizePrUrl } from './links';
