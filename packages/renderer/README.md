# @lucidiff/renderer

Renders a [lucidiff](https://github.com/Rishabjs03/pr-karpathy#readme) explainer document into
one self-contained HTML page.

```ts
import { loadMermaidBundle, renderHtml } from '@lucidiff/renderer';

const html = renderHtml(document); // Mermaid from a pinned CDN build with SRI
const offline = renderHtml(document, {
  mermaid: { kind: 'inline', script: await loadMermaidBundle() }, // works without network
});
```

`renderHtml` validates its input against the explainer schema, so it is safe to call with JSON
read from disk. The page has inline CSS and JS, a strict Content Security Policy with script
hashes, light and dark themes, collapsible change cards, severity-sorted risks with links to
the PR lines, a checklist saved in `localStorage`, and print styles.

MIT License.
