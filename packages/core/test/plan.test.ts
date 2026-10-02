import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET, planAnalysis, splitFileByHunks } from '../src/analyze/plan';
import { describeFile, estimateTokens, formatFileDiff } from '../src/diff/format';
import type { PreparedChangeSet } from '../src/changeset';
import { parseUnifiedDiff } from '../src/diff/parse';
import { fixtureDiff } from './helpers';

function prepared(
  contents: Record<string, { base: string | null; head: string | null }>,
): PreparedChangeSet {
  return {
    source: {
      kind: 'git',
      label: 'main...feature',
      repository: null,
      base_ref: 'main',
      head_ref: 'feature',
      author: null,
    },
    pr: null,
    files: parseUnifiedDiff(fixtureDiff('medium.diff')),
    contents: new Map(Object.entries(contents)),
    skipped: [],
    redactions: 0,
    redactionsByKind: {},
  };
}

const big = (lines: number) =>
  Array.from({ length: lines }, (_, i) => `const line${i} = ${i};`).join('\n');

describe('planAnalysis', () => {
  it('uses one call and includes new contents first, then old contents', () => {
    const plan = planAnalysis(
      prepared({
        'src/api/upload.ts': { base: 'old upload', head: 'new upload' },
        'src/api/server.ts': { base: 'old server', head: 'new server' },
      }),
      2000,
      2000,
    );
    expect(plan.mode).toBe('single');
    if (plan.mode !== 'single') return;
    expect(plan.contents.get('src/api/upload.ts')).toEqual({
      head: 'new upload',
      base: 'old upload',
    });
  });

  it('drops old contents before new contents when the budget is tight', () => {
    const contents = { 'src/api/upload.ts': { base: big(400), head: big(400) } };
    const plan = planAnalysis(prepared(contents), 2000, 2000, {
      ...DEFAULT_BUDGET,
      maxInputTokens: 2000 + 1500 + 3500,
    });
    expect(plan.mode).toBe('single');
    if (plan.mode !== 'single') return;
    expect(Object.keys(plan.contents.get('src/api/upload.ts') ?? {})).toEqual(['head']);
  });

  it('skips contents of very large files', () => {
    const plan = planAnalysis(
      prepared({ 'src/api/upload.ts': { base: null, head: big(20) } }),
      2000,
      2000,
      {
        ...DEFAULT_BUDGET,
        maxContentTokensPerFile: 10,
      },
    );
    expect(plan.mode === 'single' && plan.contents.size).toBe(0);
  });

  it('sends no contents with includeContents false', () => {
    const plan = planAnalysis(
      prepared({ 'src/api/upload.ts': { base: 'a', head: 'b' } }),
      2000,
      2000,
      {
        ...DEFAULT_BUDGET,
        includeContents: false,
      },
    );
    expect(plan.mode === 'single' && plan.contents.size).toBe(0);
  });

  it('switches to batches when the diff does not fit in one call', () => {
    const plan = planAnalysis(prepared({}), 2000, 2000, {
      ...DEFAULT_BUDGET,
      maxInputTokens: 2100,
      batchInputTokens: 4000,
    });
    expect(plan.mode).toBe('batched');
    if (plan.mode !== 'batched') return;
    expect(plan.batches.flatMap((batch) => batch.files.map((file) => file.path)).sort()).toEqual([
      'src/api/server.ts',
      'src/api/upload.ts',
    ]);
    expect(plan.tooLarge).toEqual([]);
  });

  it('marks files whose diff alone exceeds the batch budget as too large', () => {
    const plan = planAnalysis(prepared({}), 2000, 2000, {
      ...DEFAULT_BUDGET,
      maxInputTokens: 2100,
      batchInputTokens: 2300,
    });
    expect(plan.tooLarge.map((file) => file.path)).toContain('src/api/upload.ts');
  });
});

describe('splitFileByHunks', () => {
  const file = parseUnifiedDiff(fixtureDiff('medium.diff')).find(
    (f) => f.path === 'src/api/server.ts',
  )!;

  it('splits a file into parts of whole hunks with their own line counts', () => {
    const parts = splitFileByHunks(file, diffTokensOfOneHunk(file) + 5)!;
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.part)).toEqual([
      { index: 1, total: 2 },
      { index: 2, total: 2 },
    ]);
    expect(parts.reduce((sum, part) => sum + part.additions, 0)).toBe(file.additions);
    expect(parts.flatMap((part) => part.hunks)).toEqual(file.hunks);
  });

  it('returns null when a single hunk is larger than the budget', () => {
    expect(splitFileByHunks(file, 10)).toBeNull();
  });

  it('tells the model that a part is a part', () => {
    const [first] = splitFileByHunks(file, diffTokensOfOneHunk(file) + 5)!;
    expect(describeFile(first!)).toContain('part 1 of 2');
  });
});

function diffTokensOfOneHunk(file: ReturnType<typeof parseUnifiedDiff>[number]): number {
  return Math.max(
    ...file.hunks.map((hunk) => estimateTokens(formatFileDiff({ ...file, hunks: [hunk] })) + 30),
  );
}
