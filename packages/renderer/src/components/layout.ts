/**
 * The document shell: `<head>`, Content Security Policy, styles, and scripts.
 *
 * The page carries a strict CSP. Scripts run only if their SHA-256 hash is listed, or (for
 * the CDN build of Mermaid) if they come from jsDelivr with a matching SRI hash. So even if
 * text from a pull request ever slipped past escaping, it could not run as script.
 */
import { createHash } from 'node:crypto';
import { html, raw, type SafeHtml } from '../html';
import { MERMAID_CDN_URL, MERMAID_INTEGRITY, type MermaidAsset } from '../mermaid-bundle';

function sha256Source(script: string): string {
  return `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
}

/**
 * Makes JavaScript safe to place inside an inline `<script>` element.
 *
 * `<\/script` is equivalent to `</script` in every JavaScript context (strings, templates,
 * and regular expressions), but the HTML parser does not treat it as a closing tag.
 */
export function safeInlineScript(script: string): string {
  const escaped = script.replace(/<\/script/gi, '<\\/script');
  if (/<!--/.test(escaped) && /<script/i.test(escaped)) {
    throw new Error('Cannot inline a script that contains both "<!--" and "<script".');
  }
  return escaped;
}

export interface LayoutParts {
  title: string;
  description: string;
  styles: string;
  themeScript: string;
  clientScript: string;
  dataJson: string;
  mermaid: MermaidAsset;
  body: SafeHtml;
}

/** Wraps the page body in a complete, self-contained HTML document. */
export function layout(parts: LayoutParts): string {
  const themeScript = safeInlineScript(parts.themeScript);
  const clientScript = safeInlineScript(parts.clientScript);
  const mermaidInline =
    parts.mermaid.kind === 'inline' ? safeInlineScript(parts.mermaid.script) : null;

  const scriptSources = [sha256Source(themeScript), sha256Source(clientScript)];
  if (mermaidInline !== null) scriptSources.push(sha256Source(mermaidInline));
  if (parts.mermaid.kind === 'cdn') scriptSources.push('https://cdn.jsdelivr.net');

  const csp = [
    "default-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    // Mermaid writes inline styles into the SVG it generates.
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const mermaidTag =
    parts.mermaid.kind === 'cdn'
      ? html`<script
          id="mermaid-script"
          src="${MERMAID_CDN_URL}"
          integrity="${MERMAID_INTEGRITY}"
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          defer
        ></script>`
      : mermaidInline !== null
        ? raw(`<script id="mermaid-script">${mermaidInline}</script>`)
        : '';

  return `<!doctype html>
${html`<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="referrer" content="no-referrer" />
    <meta name="color-scheme" content="light dark" />
    <meta name="description" content="${parts.description}" />
    <meta name="generator" content="lucidiff" />
    <title>${parts.title}</title>
    ${raw(`<script>${themeScript}</script>`)} ${raw(`<style>${parts.styles}</style>`)} ${mermaidTag}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    ${parts.body}
    ${raw(`<script type="application/json" id="lucidiff-data">${parts.dataJson}</script>`)}
    ${raw(`<script>${clientScript}</script>`)}
  </body>
</html>`}
`;
}
