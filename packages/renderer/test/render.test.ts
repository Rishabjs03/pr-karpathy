import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MERMAID_CDN_URL, MERMAID_INTEGRITY, renderBody, renderHtml } from '../src/index';
import { cspOf, inlineScripts, sampleDocument } from './helpers';

const XSS = '<script>alert(1)</script><img src=x onerror=alert(2)>';

describe('renderHtml', () => {
  it('renders a complete, self-contained document', () => {
    const page = renderHtml(sampleDocument());
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<html lang="en">');
    expect(page).toContain(
      '<title>Retry failed webhook deliveries with exponential backoff · lucidiff</title>',
    );
    // Inline CSS and JS, no external stylesheets or fonts.
    expect(page).toContain('<style>');
    expect(page).not.toMatch(/<link[^>]+stylesheet/);
    expect(page).toContain('id="lucidiff-data"');
  });

  it('rejects documents that do not match the schema', () => {
    const doc = sampleDocument() as unknown as Record<string, unknown>;
    delete doc.title;
    expect(() => renderHtml(doc)).toThrow(expect.objectContaining({ name: 'ZodError' }));
  });

  it('escapes model-written text everywhere it appears', () => {
    const doc = sampleDocument();
    doc.title = XSS;
    doc.summary = XSS;
    doc.changes[0]!.what = XSS;
    doc.changes[0]!.file = `src/${XSS}.ts`;
    doc.risks[0]!.reason = XSS;
    doc.risks[0]!.title = XSS;
    doc.tests[0]!.description = XSS;
    doc.flow.caption = XSS;
    doc.flow.nodes[0]!.label = XSS;
    const page = renderHtml(doc);
    expect(page).not.toContain('<script>alert(1)');
    expect(page).not.toContain('<img src=x');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps the page data block from closing its script element', () => {
    const doc = sampleDocument();
    doc.flow.mermaid = 'flowchart LR\n  a["</script><script>alert(1)</script>"]';
    const page = renderHtml(doc);
    const dataBlock =
      /<script type="application\/json" id="lucidiff-data">([\s\S]*?)<\/script>/.exec(page);
    expect(dataBlock?.[1]).toContain('\\u003c/script>');
    expect(JSON.parse(dataBlock?.[1] ?? '').mermaid).toBe(doc.flow.mermaid);
  });

  it('turns backtick spans into inline code and nothing else', () => {
    const doc = sampleDocument();
    doc.summary = 'Calls `parse<T>()` and **not bold**.';
    const body = renderBody(doc).value;
    expect(body).toContain('<code class="nowrap">parse&lt;T&gt;()</code>');
    expect(body).toContain('**not bold**');
  });

  it('lists the hash of every inline script in the Content Security Policy', () => {
    const page = renderHtml(sampleDocument());
    const csp = cspOf(page);
    const scripts = inlineScripts(page);
    expect(scripts.length).toBe(2);
    for (const script of scripts) {
      const hash = createHash('sha256').update(script).digest('base64');
      expect(csp).toContain(`'sha256-${hash}'`);
    }
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('loads Mermaid from the CDN with Subresource Integrity by default', () => {
    const page = renderHtml(sampleDocument());
    expect(page).toContain(`src="${MERMAID_CDN_URL}"`);
    expect(page).toContain(`integrity="${MERMAID_INTEGRITY}"`);
    expect(page).toContain('crossorigin="anonymous"');
  });

  it('embeds Mermaid inline when asked, with no external script', () => {
    const script = 'globalThis.mermaid = { fake: true }; const s = "</script>";';
    const page = renderHtml(sampleDocument(), { mermaid: { kind: 'inline', script } });
    expect(page).not.toContain(MERMAID_CDN_URL);
    expect(page).not.toContain('https://cdn.jsdelivr.net');
    expect(page).toContain('const s = "<\\/script>"');
    const csp = cspOf(page);
    for (const inline of inlineScripts(page)) {
      expect(csp).toContain(createHash('sha256').update(inline).digest('base64'));
    }
  });

  it('omits Mermaid entirely with kind "none"', () => {
    const page = renderHtml(sampleDocument(), { mermaid: { kind: 'none' } });
    expect(page).not.toContain('<script id="mermaid-script"');
    expect(page).not.toContain('cdn.jsdelivr.net/npm/mermaid');
  });

  it('shows the text version of the flow when the graph has no Mermaid source', () => {
    const doc = sampleDocument();
    doc.flow.mermaid = null;
    const body = renderBody(doc).value;
    expect(body).not.toContain('data-flow-diagram');
    expect(body).toMatch(/<details class="flow-text" data-flow-text open>/);
    expect(body).toContain('The diagram did not pass validation');
  });

  it('sorts risks from high to low severity', () => {
    const body = renderBody(sampleDocument()).value;
    const order = [...body.matchAll(/class="risk severity-(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['high', 'medium', 'low']);
  });

  it('links risks to the exact lines in the GitHub pull request', () => {
    const doc = sampleDocument();
    const body = renderBody(doc).value;
    const risk = doc.risks.find((r) => r.severity === 'high')!;
    const anchor = createHash('sha256').update(risk.file).digest('hex');
    expect(body).toContain(
      `https://github.com/acme/notifier/pull/482/files#diff-${anchor}R${risk.lines[0]}-R${risk.lines[1]}`,
    );
  });

  it('shows plain locations when there is no pull request URL', () => {
    const doc = sampleDocument();
    doc.meta.pr_url = null;
    const body = renderBody(doc).value;
    expect(body).not.toContain('/files#diff-');
    expect(body).toContain('<span class="location mono">src/jobs/retry-worker.ts:18–27');
  });

  it('renders an explicit empty state when there are no risks', () => {
    const doc = sampleDocument();
    doc.risks = [];
    expect(renderBody(doc).value).toContain('No concrete risks found.');
  });

  it('gives every checklist item a stable id for saved state', () => {
    const doc = sampleDocument();
    const body = renderBody(doc).value;
    for (const test of doc.tests) expect(body).toContain(`data-check-id="${test.id}"`);
  });

  it('matches the snapshot of the page body', () => {
    expect(renderBody(sampleDocument()).value).toMatchSnapshot();
  });
});
