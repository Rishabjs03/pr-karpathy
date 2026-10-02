import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse';
import { FileIndex } from '../src/postprocess/paths';
import { validateRiskCitations } from '../src/postprocess/citations';
import type { LlmRisk } from '../src/schema/llm';
import { fixtureDiff } from './helpers';

const index = new FileIndex([
  ...parseUnifiedDiff(fixtureDiff('small.diff')),
  ...parseUnifiedDiff(fixtureDiff('deletion-only.diff')),
  ...parseUnifiedDiff(fixtureDiff('rename.diff')),
]);

const REASON = 'A concrete reason that names the failing input and the effect.';

function risk(overrides: Partial<LlmRisk>): LlmRisk {
  return {
    severity: 'medium',
    title: 'A risk',
    file: 'src/lib/rate-limit.ts',
    side: 'new',
    start_line: 11,
    end_line: 14,
    reason: REASON,
    ...overrides,
  };
}

describe('validateRiskCitations', () => {
  it('keeps a citation inside a hunk', () => {
    const { risks, dropped } = validateRiskCitations([risk({})], index);
    expect(dropped).toEqual([]);
    expect(risks[0]).toMatchObject({ file: 'src/lib/rate-limit.ts', side: 'new', lines: [11, 14] });
  });

  it('accepts lines just outside a hunk (within the margin) and rejects lines far away', () => {
    // The small.diff hunk covers new lines 8-18.
    expect(
      validateRiskCitations([risk({ start_line: 21, end_line: 22 })], index).risks,
    ).toHaveLength(1);
    expect(
      validateRiskCitations([risk({ start_line: 40, end_line: 41 })], index).dropped[0]?.reason,
    ).toMatch(/outside the changed hunks/);
    expect(
      validateRiskCitations([risk({ start_line: 21, end_line: 22 })], index, { margin: 0 }).risks,
    ).toHaveLength(0);
  });

  it('normalizes paths the model writes with prefixes', () => {
    for (const file of [
      './src/lib/rate-limit.ts',
      'b/src/lib/rate-limit.ts',
      '`src/lib/rate-limit.ts`',
      '/src/lib/rate-limit.ts',
    ]) {
      expect(validateRiskCitations([risk({ file })], index).risks[0]?.file).toBe(
        'src/lib/rate-limit.ts',
      );
    }
  });

  it('rounds and orders line numbers', () => {
    expect(
      validateRiskCitations([risk({ start_line: 14.4, end_line: 10.6 })], index).risks[0]?.lines,
    ).toEqual([11, 14]);
  });

  it('drops invalid line numbers and ranges that are too wide', () => {
    expect(
      validateRiskCitations([risk({ start_line: 0, end_line: 3 })], index).dropped[0]?.reason,
    ).toMatch(/not a valid line/);
    expect(
      validateRiskCitations([risk({ start_line: 1, end_line: 200 })], index).dropped[0]?.reason,
    ).toMatch(/span more than 80/);
  });

  it('uses old lines for deleted files even when the model says "new"', () => {
    const { risks } = validateRiskCitations(
      [risk({ file: 'src/lib/old-helpers.ts', side: 'new', start_line: 1, end_line: 3 })],
      index,
    );
    expect(risks[0]).toMatchObject({ side: 'old', file: 'src/lib/old-helpers.ts' });
  });

  it('maps a renamed file to its new path for new lines and old path for old lines', () => {
    const viaOld = validateRiskCitations(
      [risk({ file: 'src/lib/config.ts', side: 'new', start_line: 8, end_line: 8 })],
      index,
    );
    expect(viaOld.risks[0]?.file).toBe('src/config/load.ts');
    const oldSide = validateRiskCitations(
      [risk({ file: 'src/config/load.ts', side: 'old', start_line: 8, end_line: 8 })],
      index,
    );
    expect(oldSide.risks[0]?.file).toBe('src/lib/config.ts');
  });

  it('drops vague reasons and duplicates', () => {
    expect(
      validateRiskCitations([risk({ reason: 'May be slow.' })], index).dropped[0]?.reason,
    ).toMatch(/too short/);
    expect(validateRiskCitations([risk({}), risk({})], index).risks).toHaveLength(1);
  });

  it('drops risks in renamed files without content changes', () => {
    const { dropped } = validateRiskCitations(
      [risk({ file: 'docs/index.md', start_line: 1, end_line: 1 })],
      index,
    );
    expect(dropped[0]?.reason).toMatch(/outside the changed hunks/);
  });
});
