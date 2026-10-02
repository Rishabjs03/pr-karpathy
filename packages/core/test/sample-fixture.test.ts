import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileFlowToMermaid } from '../src/flow';

describe('sample fixture', () => {
  it('has Mermaid source that matches the current compiler (run scripts/update-sample-flow.mjs)', () => {
    const doc = JSON.parse(
      readFileSync(new URL('../../../fixtures/sample-document.json', import.meta.url), 'utf8'),
    );
    expect(doc.flow.mermaid).toBe(compileFlowToMermaid(doc.flow));
  });
});
