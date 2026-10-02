import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ExplainerDocument } from '@lucidiff/core/schema';

const fixture = fileURLToPath(new URL('../../../fixtures/sample-document.json', import.meta.url));

/** A fresh copy of the sample document, safe to modify in a test. */
export function sampleDocument(): ExplainerDocument {
  return JSON.parse(readFileSync(fixture, 'utf8')) as ExplainerDocument;
}

/** Returns the contents of every inline <script> element without a type attribute. */
export function inlineScripts(page: string): string[] {
  return [...page.matchAll(/<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
}

/** Returns the decoded Content Security Policy of a rendered page. */
export function cspOf(page: string): string {
  const value = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? '';
  return value.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}
