/**
 * Renders the sample explainer document (fixtures/sample-document.json) to .sample/, so you
 * can work on the page design without calling a model. Run `pnpm build` first.
 *
 *   pnpm sample             # loads Mermaid from the CDN
 *   pnpm sample --offline   # embeds Mermaid in the page
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadMermaidBundle, renderHtml } from '@lucidiff/renderer';

const offline = process.argv.includes('--offline');
const document = JSON.parse(await readFile('fixtures/sample-document.json', 'utf8'));
const page = renderHtml(document, {
  mermaid: offline ? { kind: 'inline', script: await loadMermaidBundle() } : { kind: 'cdn' },
});
await mkdir('.sample', { recursive: true });
const file = offline ? '.sample/sample-offline.html' : '.sample/sample.html';
await writeFile(file, page);
console.log(`Wrote ${file} (${Math.round(page.length / 1024)} KB)`);
